// Nastavenia hry: texty a dĺžka kola.
window.GAME_CONFIG = {
  // Dĺžka jedného kola v sekundách.
  roundSeconds: 30,

  teamName: 'DeKa tím',
  teamSubtitle: 'Detské katechézy',

  // QR kódy vpravo dole a na úvodnej obrazovke (najviac dva).
  // short = kratší popis do úzkeho rebríčka vpravo.
  qrCodes: [
    { image: 'assets/qr.png', caption: 'Prihlasovací formulár', short: 'Prihláška' },
    { image: 'assets/instagram.png', caption: 'Instagram', sub: '@upece_deka' },
  ],

  maxNameLength: 16,
};
