export const APP_VERSION = '0.8.0 (Lieferverträge & Kronen-Schatzkammer)';

/** Shown in Settings so players and testers see what is finished and what is planned. */
export const DEV_STATUS: { text: string; done: boolean }[] = [
  { text: 'Manufaktur mit 8 Produktionsetagen, Lastenaufzug und Lieferwagen', done: true },
  { text: 'Oberhaus (Etagen 6–8) mit größerem Aufzug und größeren Lieferwagen', done: true },
  { text: 'Echte Engpass-Simulation mit Zwischenlagern und Versandlager', done: true },
  { text: 'Upgrades ×1/×10/×25/×100/MAX mit Meilensteinen', done: true },
  { text: 'Manager mit 4 Seltenheiten, Passivbonus und aktiver Fähigkeit', done: true },
  { text: 'Tippen, Goldene Kakaobohne, Auftragskette mit 26 Aufträgen', done: true },
  { text: 'Offline-Progression (bis 3 h) mit Bericht', done: true },
  { text: 'Lokale Spielstände mit Sicherung, Prüfsumme, Export/Import', done: true },
  { text: 'Flüssiges Antippen: Tippen beschleunigt sanft statt zu springen', done: true },
  { text: 'Installierbare PWA, offline spielbar (nur unter eigener Webadresse, nicht in der Claude-Vorschau)', done: true },
  { text: 'Rezeptlabor: 4 Zweige, 12 Forschungen mit Rängen, läuft auch offline', done: true },
  { text: 'Prestige „Marke verkaufen“ mit Kronen', done: true },
  { text: 'Zweites Werk mit Rohstoffkette', done: false },
  { text: '30 Erfolge, 3 Tagesziele pro Tag mit Serie und Belohnungen', done: true },
  { text: 'Advent-Event „Lebkuchen-Manufaktur“: 26 Türchen nach Gerätedatum, 3 Etagen, Wintermarkt, Winterdeko, Weihnachtsmanager', done: true },
  { text: 'Lieferverträge: 6 Kunden, Fristen, Ruf-Stufen, Tagesziel', done: true },
  { text: 'Kronen-Schatzkammer: 6 dauerhafte Startboni, Endspiel-Balancing (Kubikwurzel ab 100 Kronen)', done: true },
  { text: 'Weitere Saison-Events', done: false },
  { text: 'Cloud-Speicherstand und Konten', done: false },
];
