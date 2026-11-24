export const APP_VERSION = '0.4.0 (Prestige)';

/** Shown in Settings so players and testers see what is finished and what is planned. */
export const DEV_STATUS: { text: string; done: boolean }[] = [
  { text: 'Manufaktur mit 5 Produktionsetagen, Lastenaufzug und Lieferwagen', done: true },
  { text: 'Echte Engpass-Simulation mit Zwischenlagern und Versandlager', done: true },
  { text: 'Upgrades ×1/×10/×25/×100/MAX mit Meilensteinen', done: true },
  { text: 'Manager mit 4 Seltenheiten, Passivbonus und aktiver Fähigkeit', done: true },
  { text: 'Tippen, Goldene Kakaobohne, Auftragskette mit 22 Aufträgen', done: true },
  { text: 'Offline-Progression (bis 3 h) mit Bericht', done: true },
  { text: 'Lokale Spielstände mit Sicherung, Prüfsumme, Export/Import', done: true },
  { text: 'Flüssiges Antippen: Tippen beschleunigt sanft statt zu springen', done: true },
  { text: 'Installierbare PWA, offline spielbar (nur unter eigener Webadresse, nicht in der Claude-Vorschau)', done: true },
  { text: 'Rezeptlabor (Forschungsbaum)', done: false },
  { text: 'Prestige „Marke verkaufen“ mit Kronen', done: true },
  { text: 'Etagen 6–8 und zweites Werk mit Rohstoffkette', done: false },
  { text: 'Erfolge, tägliche Ziele und Saison-Events', done: false },
  { text: 'Cloud-Speicherstand und Konten', done: false },
];
