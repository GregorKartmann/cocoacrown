import { WINTER_MANAGER_NAME } from './winter';
import type { ManagerBonus, ManagerCategory } from '../sim/types';

/** Player-facing texts and names (German). Kept apart from numbers in balance.ts. */

export const GAME_TITLE = 'Cocoa Crown';
export const FACTORY_NAME = 'Manufaktur am Kakaokai';

export const FIRST_NAMES = [
  'Anna', 'Ben', 'Clara', 'Deniz', 'Emil', 'Frieda', 'Greta', 'Hannes', 'Ida', 'Jonas', 'Karla', 'Leon', 'Mila', 'Noah',
  'Oskar', 'Paula', 'Rosa', 'Samir', 'Tilda', 'Umut', 'Vera', 'Willi', 'Yara', 'Zoe', 'Aylin', 'Bruno', 'Carlo', 'Elif',
  'Finn', 'Hedi', 'Ilse', 'Jakob', 'Lotte', 'Mats', 'Nele', 'Ole', 'Pia', 'Rudi', 'Selma', 'Theo',
];

export const LAST_NAMES = [
  'Bohnenberg', 'Conradi', 'Dattler', 'Eckhart', 'Fuchs', 'Görner', 'Haselmann', 'Imhof', 'Jäger', 'Kessler', 'Lindner',
  'Mandel', 'Nussbaum', 'Ostermann', 'Pfeffer', 'Quandt', 'Rahm', 'Sahner', 'Teubner', 'Ullrich', 'Vogt', 'Walz',
  'Zimt', 'Brandl', 'Krüger', 'Nowak', 'Yilmaz', 'Schubert', 'Weber', 'Kaya',
];

export const CATEGORY_NAMES: Record<ManagerCategory, string> = {
  floor: 'Produktion',
  lift: 'Aufzug',
  ship: 'Versand',
};

export const BONUS_INFO: Record<ManagerBonus, { title: string; passive: string; active: string }> = {
  speed: { title: 'Taktgeber', passive: 'schnellere Zyklen', active: 'Turbo-Takt' },
  yield: { title: 'Mengenmeister', passive: 'mehr Ware pro Zyklus', active: 'Großcharge' },
  cost: { title: 'Sparfuchs', passive: 'günstigere Upgrades', active: 'Rabattaktion' },
  capacity: { title: 'Hebekünstler', passive: 'mehr Ladung pro Fahrt', active: 'Volle Ladung' },
  price: { title: 'Verhandler', passive: 'höherer Verkaufspreis', active: 'Preisoffensive' },
};

/** Bonus title differs slightly by category for flavour. */
export function bonusTitle(category: ManagerCategory, bonus: ManagerBonus): string {
  if (bonus === 'speed' && category !== 'floor') return 'Schnellläufer';
  if (bonus === 'capacity' && category === 'ship') return 'Disponent';
  return BONUS_INFO[bonus].title;
}

export const CATEGORY_BONUSES: Record<ManagerCategory, ManagerBonus[]> = {
  floor: ['speed', 'yield', 'cost'],
  lift: ['capacity', 'speed', 'cost'],
  ship: ['price', 'capacity', 'speed'],
};

export const FLOOR_FLAVOR = [
  'Kakaobohnen werden im Trommelröster geröstet und zu Nibs gebrochen.',
  'Die Conche rührt Kakao stundenlang zu feinstem Trinkkakao.',
  'Temperierte Schokolade fließt in Formen und wird zu Tafeln.',
  'Ein Schokoladenvorhang überzieht Füllungen zu Pralinen.',
  'Von Hand gerollte Trüffel mit Blattgold – das Kronjuwel.',
  'Geröstete Haselnüsse werden zwischen Mühlsteinen zu cremigem Nougat gemahlen.',
  'Im gekühlten Glasbehälter wird rosa Ruby-Schokolade exakt temperiert.',
  'Die Prägepresse schließt jede Signature-Box mit dem Kronensiegel.',
  'Im Gießformen-Karussell erstarren Schwäne und Löwen aus massiver Schokolade.',
  'Die Prägeanlage presst gerahmte Schokoladenreliefs für die Galerie der Krone.',
];

/* ------------------------------------------------------------------ */
/* Painted art mapping                                                 */
/* ------------------------------------------------------------------ */

const FEMALE = new Set(['Anna', 'Clara', 'Frieda', 'Greta', 'Ida', 'Karla', 'Mila', 'Paula', 'Rosa', 'Tilda', 'Vera', 'Yara', 'Zoe', 'Aylin', 'Elif', 'Hedi', 'Ilse', 'Lotte', 'Nele', 'Pia', 'Selma']);

const FIGURES: Record<ManagerCategory, { f: string[]; m: string[] }> = {
  floor: { f: ['managerin_produktion', 'meisterin', 'chocolatiere'], m: ['vorarbeiter', 'arbeiter_schaufel', 'herr_direktor'] },
  lift: { f: ['arbeiterin_sack', 'managerin_produktion'], m: ['vorarbeiter', 'arbeiter_schaufel'] },
  ship: { f: ['managerin_versand', 'managerin_produktion'], m: ['fahrer', 'inhaber', 'herr_direktor'] },
};

/** Painted portrait for a manager, chosen from category, the name's gender and the stored look. */
export function portraitKey(name: string, category: ManagerCategory, variant: number): string {
  if (name === WINTER_MANAGER_NAME) return 'winter/figuren/weihnachtsmanager_portrait';
  const first = name.split(' ')[0];
  const set = FIGURES[category][FEMALE.has(first) ? 'f' : 'm'];
  return `portraits/${set[Math.abs(variant) % set.length]}`;
}

/** Extra painted pieces of a floor, in design units of the 322 × 150 floor (x centre, y bottom). */
export interface FloorDecor {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** back: behind the workers, front: in front of everything but the HUD. */
  layer: 'back' | 'front';
  /** Additive light that breathes slowly. */
  light?: number;
}

export const FLOOR_ART: {
  bg: string;
  floorLine: number;
  machine: string;
  prop: string;
  product: string;
  /** Second product, alternated in the storage stack. */
  product2?: string;
  operator: string;
  /** A figure that always stands on the floor (foreground), x and facing. */
  extra?: { key: string; x: number; flip: boolean };
  decor?: FloorDecor[];
}[] = [
  { bg: 'hintergruende/etage_roesterei', floorLine: 447, machine: 'maschinen/trommelroester', prop: 'requisiten/roesterei_saecke', product: 'produkte/roestnibs', operator: 'figuren/arbeiter_schaufel' },
  { bg: 'hintergruende/etage_trinkkakao', floorLine: 458, machine: 'maschinen/conche', prop: 'requisiten/kakao_regal', product: 'produkte/trinkkakao', operator: 'figuren/vorarbeiter' },
  { bg: 'hintergruende/etage_veredelung', floorLine: 446, machine: 'maschinen/giessanlage', prop: 'requisiten/tafeln_tisch', product: 'produkte/schokoladentafel', operator: 'figuren/chocolatiere' },
  { bg: 'hintergruende/etage_pralinen', floorLine: 450, machine: 'maschinen/ueberziehmaschine', prop: 'requisiten/pralinen_wagen', product: 'produkte/pralinen', operator: 'figuren/arbeiterin_sack' },
  { bg: 'hintergruende/etage_trueffel', floorLine: 458, machine: 'maschinen/trueffel_atelier', prop: 'requisiten/trueffel_kommode', product: 'produkte/trueffel', operator: 'figuren/meisterin' },
  { bg: 'hintergruende/etage_nougat', floorLine: 442, machine: 'maschinen/nougat_melangeur', prop: 'requisiten/haselnusskiste', product: 'produkte/haselnuss_nougat', operator: 'figuren/arbeiterin_sack' },
  { bg: 'hintergruende/etage_ruby', floorLine: 442, machine: 'maschinen/ruby_temperieranlage', prop: 'requisiten/ruby_regal', product: 'produkte/ruby_tafel', operator: 'figuren/chocolatiere' },
  { bg: 'hintergruende/etage_geschenkbox', floorLine: 442, machine: 'maschinen/geschenkbox_presse', prop: 'requisiten/geschenkbox_wagen', product: 'produkte/signature_box', operator: 'figuren/managerin_versand' },
  {
    bg: 'hintergruende/etage_skulpturen',
    floorLine: 458,
    machine: 'maschinen/giessformen_karussell',
    prop: 'requisiten/formen_werkbank',
    product: 'produkte/schwan',
    product2: 'produkte/loewe',
    operator: 'figuren/bildhauerin',
    decor: [
      { key: 'requisiten/galerie_sockel', x: 236, y: 137, w: 24, h: 26, layer: 'back' },
      { key: 'produkte/loewe', x: 236, y: 113, w: 19, h: 20, layer: 'back' },
    ],
  },
  {
    bg: 'hintergruende/etage_galerie',
    floorLine: 459,
    machine: 'maschinen/praegeanlage',
    prop: 'requisiten/restaurierung_wagen',
    product: 'produkte/relief_kakao',
    product2: 'produkte/relief_stadt',
    operator: 'figuren/kuratorin',
    extra: { key: 'figuren/restaurator', x: 262, flip: true },
    decor: [
      { key: 'effekte/galerie_lichtkegel', x: 230, y: 93, w: 46, h: 88, layer: 'back', light: 0.3 },
      { key: 'requisiten/galerieleuchte', x: 230, y: 67, w: 24, h: 10, layer: 'back' },
      { key: 'produkte/relief_stadt', x: 230, y: 92, w: 32, h: 25, layer: 'back' },
      { key: 'effekte/galerie_lichtfleck', x: 236, y: 140, w: 58, h: 16, layer: 'back', light: 0.45 },
    ],
  },
];
