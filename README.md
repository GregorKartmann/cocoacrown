# Cocoa Crown – Idle-Schokoladen-Imperium

**Spielen:** https://gregorkartmann.github.io/cocoacrown/ (auf dem iPhone in Safari öffnen, „Teilen“ → „Zum Home-Bildschirm“).

Der Branch `gh-pages` enthält den fertigen Build (`npm run build` → `dist/`).

Idle-Tycoon-Spiel als Webapp und installierbare PWA. Vertical Slice 0.3.0 mit gemaltem Asset-Pack: die Manufaktur mit fünf Produktionsetagen, Lastenaufzug, Lieferwagen, Managern, Aufträgen, Goldener Kakaobohne, Offline-Progression und lokalen Spielständen.

## Starten

```bash
npm install
npm run dev        # Entwicklungsserver
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen (http://localhost:4173)
```

Für PWA-Installation und Offline-Betrieb `dist/` über HTTPS ausliefern (z. B. Netlify, Vercel, GitHub Pages, eigener Server). Der Build nutzt relative Pfade und läuft auch in einem Unterordner.

## Tests

```bash
npm test                 # Vitest: Ökonomie, Simulation, Offline, Spielstände, Formatierung, Balancing-Bots
npx playwright test      # Browser-Tests gegen den Build (nutzt installiertes Chrome)
```

`tests/balance.report.test.ts` lässt zwei simulierte Spieler (aufmerksam / gelegentlich) zwei Stunden spielen und prüft das Tempo gegen die Design-Ziele. Die Zeitleisten stehen im Testlog.

## Architektur

| Ordner | Aufgabe |
| --- | --- |
| `src/config` | Balancing (`balance.ts`), Texte, Aufträge – alle Zahlen an einer Stelle |
| `src/core` | Big Numbers (break_infinity.js), deutsche Zahlenformatierung |
| `src/sim` | Wirtschaftssimulation: fester Zeitschritt, Formeln, Aktionen, Offline-Nachberechnung, deterministischer Zufall |
| `src/save` | Serialisierung, Prüfsumme, Validierung, Migrationen, IndexedDB + Sicherungs- und Notfallkopie |
| `src/game` | `GameStore`: Spielschleife, Speichern, Ereignisse, Aktionen |
| `src/render` | PixiJS-Spielwelt: Sprites aus dem Asset-Pack, Animationen, Partikel – liest nur, rechnet nichts |
| `src/assets/art` | Aufbereitete Grafiken (WebP), erzeugt mit `scripts/prepare-assets.py` aus dem Original-Pack |
| `src/ui` | React-Oberfläche: Statusleiste, Menüs, Dialoge |
| `src/audio` | Synthetisierte Soundeffekte und Musik (Web Audio, keine Dateien) |
| `src/pwa` | Service-Worker-Registrierung mit Update-Hinweis |

Die Simulation läuft mit 20 Schritten pro Sekunde unabhängig von der Bildrate. Offline-Zeit wird mit derselben Schrittfunktion nachgerechnet (adaptive Schrittweite, höchstens 20.000 Schritte, Abweichung zur Live-Simulation < 0,1 %).

## Debug

`?debug=1` an die URL hängen: `window.__cc` bietet `store`, `positions()`, `give(betrag)` und `focus(station)` für Tests.

## Grafiken aktualisieren

```bash
python3 -I scripts/prepare-assets.py <Pfad/zum/Cocoa_Crown_Assets> .
```

Das Skript beschneidet Transparenz, skaliert pro Gruppe, schreibt WebP nach `src/assets/art/` und kopiert die App-Icons nach `public/`.
