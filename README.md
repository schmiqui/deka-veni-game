# Dobrý pastier

Hra DeKa tímu na Veni Sancte. Pastier zbiera stratené ovečky a vodí ich do ohrady.
Hrá sa šípkami alebo WASD, kolo trvá 60 sekúnd a výsledky sa ukladajú do rebríčka.

## Spustenie

Treba mať nainštalovaný [Node.js](https://nodejs.org), verziu 18 alebo novšiu.

Na celú obrazovku, bez lišty prehliadača:

```bash
npm run kiosk
```

Otvorí sa Chrome cez celú obrazovku, bez kariet a adresného riadku. Na Macu to isté urobí dvojklik na `start.command`.
Zavrieš ho cez Cmd+Q, na Windows Alt+F4.

Bežné spustenie v prehliadači:

```bash
npm start
```

Potom otvor http://localhost:8080. Hra sa prepne na celú obrazovku sama, keď niekto stlačí kláves a začne hrať. Prepnúť sa dá aj klávesom F.

Okno terminálu so serverom nechaj otvorené, inak sa výsledky neuložia.

## Ovládanie

| Kláves | Čo robí |
| --- | --- |
| šípky alebo WASD | pohyb, spustenie hry |
| Enter | spustenie hry, uloženie mena |
| Esc | neuložiť výsledok |
| šípky hore a dole vo výsledkoch | listovanie v poradí |
| F | celá obrazovka |
| M | zvuk |

## Ako sa hrá

Hráčovi netreba nič vysvetľovať:

- Na úvodnej obrazovke sa hrá ukážka a pod ňou sú tri kroky: pozbieraj ovečky, zažeň ich do ohrady, viac naraz je viac bodov.
- Po štarte sa pod pastierom ukážu šípky. Čas sa spustí až pri prvom pohybe.
- Šípka ukazuje k ovečkám, a keď ich má hráč za sebou, ukazuje do ohrady.
- Body za ovečky v ohrade sa násobia počtom oviec, ktoré priviedol naraz.
- Zlatá ovečka má 50 bodov, ale uteká.
- Vlk berie poslednú ovečku v rade. Keď sa ho hráč dotkne, odoženie ho.
- Po kole hráč hneď vidí rebríček a svoje miesto, napíše meno a ukáže sa celé poradie.
- Ak nikto nič nestláča, hra sa sama vráti na úvodnú obrazovku.

## Rebríček

- Výsledky sú v súbore `data/scores.json` a zostanú tam aj po reštarte počítača.
- Záloha všetkých výsledkov je v `data/scores.log.jsonl`.
- Rovnaké meno (bez ohľadu na veľké písmená) je jeden hráč, počíta sa jeho najlepší výsledok.
- Export do Excelu: http://localhost:8080/api/scores.csv
- Nevhodné meno zmažeš priamo v `data/scores.json`, reštart netreba.
- Celý rebríček vynuluješ zmazaním `data/scores.json`.

## Úpravy

Texty a dĺžka kola sú v `public/config.js`.
QR kódy sú v `public/assets/`: `qr.png` (prihlasovací formulár) a `instagram.png` (instagram.com/upece_deka).
Zobrazia sa vpravo dole pod rebríčkom a na úvodnej obrazovke. Ktoré to sú a aké majú popisy, sa nastavuje v `public/config.js` v časti `qrCodes`.
