#!/usr/bin/env node
// Dobrý pastier – malý server bez závislostí.
// Servíruje hru z ./public a ukladá rebríček do ./data/scores.json,
// takže výsledky prežijú reload stránky aj reštart počítača.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'scores.json');
const LOG_FILE = path.join(DATA_DIR, 'scores.log.jsonl');
const KIOSK = process.argv.includes('--kiosk');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

fs.mkdirSync(DATA_DIR, { recursive: true });

// Súbor čítame pri každej požiadavke, aby sa ručná úprava scores.json
// (napr. zmazanie nevhodnej prezývky) prejavila hneď, bez reštartu.
function loadScores() {
  let raw;
  try {
    raw = fs.readFileSync(DATA_FILE, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Nepodarilo sa prečítať', DATA_FILE, err.message);
    return [];
  }
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data.scores) ? data.scores : [];
  } catch (err) {
    // Poškodený súbor neprepíšeme – odložíme ho bokom.
    const backup = path.join(DATA_DIR, `scores.corrupt-${Date.now()}.json`);
    fs.copyFileSync(DATA_FILE, backup);
    console.error(`scores.json je poškodený, záloha: ${backup}. Kompletná história je v ${LOG_FILE}.`);
    return [];
  }
}

function saveScores(scores) {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ scores }, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const name = String(e.name ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  const score = Number(e.score);
  if (!name || !Number.isInteger(score) || score < 0 || score > 10_000_000) return null;
  const count = (v) => (Number.isInteger(v) && v >= 0 && v < 1_000_000 ? v : 0);
  return {
    id: typeof e.id === 'string' && /^[\w-]{1,64}$/.test(e.id) ? e.id : crypto.randomUUID(),
    name,
    score,
    delivered: count(e.delivered),
    bestCombo: count(e.bestCombo),
    date: !Number.isNaN(Date.parse(e.date)) ? new Date(e.date).toISOString() : new Date().toISOString(),
  };
}

function readBody(req, limit = 10_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function toCsv(scores) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [...scores]
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
    .map((s, i) => [i + 1, s.name, s.score, s.delivered, s.bestCombo, s.date].map(esc).join(';'));
  return '﻿' + ['poradie;meno;skore;dorucene_ovecky;najvacsie_stado;datum', ...rows].join('\r\n');
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/scores' && req.method === 'GET') {
    return sendJson(res, 200, { scores: loadScores() });
  }
  if (pathname === '/api/scores' && req.method === 'POST') {
    let entry;
    try {
      entry = cleanEntry(JSON.parse(await readBody(req)));
    } catch {
      entry = null;
    }
    if (!entry) return sendJson(res, 400, { error: 'Neplatný záznam' });
    const scores = loadScores();
    // Klient posiela neodoslané záznamy znova – podľa id ich nezdvojíme.
    if (!scores.some((s) => s.id === entry.id)) {
      scores.push(entry);
      saveScores(scores);
      fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
      console.log(`Nové skóre: ${entry.name}, ${entry.score}`);
    }
    return sendJson(res, 200, { ok: true, entry });
  }
  if (pathname === '/api/scores.csv' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rebricek-dobry-pastier.csv"',
    });
    return res.end(toCsv(loadScores()));
  }
  sendJson(res, 404, { error: 'Nenájdené' });
}

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nenájdené');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  try {
    if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
    else serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Chyba servera' });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    if (KIOSK) {
      // Hra už beží, stačí otvoriť okno.
      console.log(`\n  Hra už beží na http://localhost:${PORT}, otváram ju na celú obrazovku.\n`);
      openKiosk(`http://localhost:${PORT}`);
      setTimeout(() => process.exit(0), 1000);
      return;
    }
    console.error(`\n  Port ${PORT} je obsadený, hra už asi beží na http://localhost:${PORT}`);
    console.error(`  Iný port: PORT=8081 npm start\n`);
    process.exit(1);
  }
  throw err;
});

// Otvorí Chrome bez lišty, adresného riadku a kariet (kiosk).
// Vlastný profil zaručí, že sa otvorí nové okno aj keď už Chrome beží.
function openKiosk(url) {
  const profile = path.join(DATA_DIR, 'chrome-kiosk');
  const flags = ['--kiosk', '--no-first-run', '--disable-session-crashed-bubble', '--disable-infobars', `--user-data-dir=${profile}`, url];
  let cmd;
  let args;
  if (process.platform === 'darwin') {
    cmd = 'open';
    args = ['-na', 'Google Chrome', '--args', ...flags];
  } else if (process.platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', 'chrome', ...flags];
  } else {
    cmd = 'google-chrome';
    args = flags;
  }
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => console.log(`  Chrome sa nepodarilo otvoriť. Otvor ${url} ručne a stlač F.`));
  child.unref();
}

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`\n  Dobrý pastier beží na http://${shown}:${PORT}`);
  console.log(`  Rebríček sa ukladá do: ${DATA_FILE}`);
  console.log(`  Export do Excelu:      http://${shown}:${PORT}/api/scores.csv\n`);
  if (KIOSK) {
    console.log('  Otváram Chrome na celú obrazovku. Zavrieš ho cez Cmd+Q (Alt+F4 na Windows).\n');
    openKiosk(`http://localhost:${PORT}`);
  }
});
