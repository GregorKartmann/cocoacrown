/**
 * Advent-Event „Lebkuchen-Manufaktur“ (winter pack).
 *
 * Calendar: the device's local clock decides. November is the preview
 * (Lebkuchenbäckerei already bakes, everything else waits), from 1 December
 * 00:00 local time one door opens per day up to the 24th, doors 25 and 26 are
 * the Christmas bonus, and the event closes at the end of 26 December.
 * Doors that were missed can be opened later, as long as the event runs.
 */

export const WINTER_MONTH = 12; // December
export const LAST_DOOR = 26;
/** Up to this day every door unlocks something new. */
export const LAST_FEATURE_DOOR = 24;

export interface WinterFloorDef {
  id: 'baeckerei' | 'verzierung' | 'verpackung';
  name: string;
  product: string;
  machine: string;
  bg: string;
  machineArt: string;
  prop: string;
  productArt: string;
  /** Seconds per batch. */
  cycle: number;
  /** Zimtsterne per batch and level. */
  base: number;
  /** Cost of level 1 → 2 and growth per level. */
  cost: number;
  growth: number;
  /** Zimtsterne to build (after its door). */
  build: number;
}

export const WINTER_FLOORS: WinterFloorDef[] = [
  {
    id: 'baeckerei',
    name: 'Lebkuchenbäckerei',
    product: 'Gewürzlebkuchen',
    machine: 'Kupferofen',
    bg: 'winter/hintergruende/baeckerei',
    machineArt: 'winter/maschinen/lebkuchenofen',
    prop: 'winter/requisiten/mehl_und_gewuerze',
    productArt: 'winter/produkte/gewuerzlebkuchen',
    cycle: 3,
    base: 1,
    cost: 6,
    growth: 1.2,
    build: 0,
  },
  {
    id: 'verzierung',
    name: 'Herzen-Werkstatt',
    product: 'Lebkuchenherzen',
    machine: 'Glasierstation',
    bg: 'winter/hintergruende/verzierung',
    machineArt: 'winter/maschinen/glasierstation',
    prop: 'winter/requisiten/trockengestell',
    productArt: 'winter/produkte/lebkuchenherz',
    cycle: 5,
    base: 8,
    cost: 80,
    growth: 1.2,
    build: 400,
  },
  {
    id: 'verpackung',
    name: 'Festdosen-Atelier',
    product: 'Adventsdosen',
    machine: 'Festdosen-Presse',
    bg: 'winter/hintergruende/verpackung',
    machineArt: 'winter/maschinen/festdosen_presse',
    prop: 'winter/requisiten/festdosen_wagen',
    productArt: 'winter/produkte/adventsdose',
    cycle: 8,
    base: 50,
    cost: 900,
    growth: 1.2,
    build: 6000,
  },
];

/** Every 25 levels a floor doubles its output. */
export const WINTER_MILESTONE = 25;

/** Hours of event production credited while away (perk raises it). */
export const WINTER_OFFLINE_HOURS = 2;
export const WINTER_OFFLINE_HOURS_PERK = 8;

export type Perk =
  | 'markt' // Wintermarkt opens
  | 'auto0' // Ofenwichtel: Bäckerei bakes by itself
  | 'auto1'
  | 'auto2'
  | 'floor1' // Herzen-Werkstatt can be built
  | 'floor2' // Festdosen-Atelier can be built
  | 'mehr25' // +25 % Zimtsterne
  | 'mehr50' // +50 % Zimtsterne
  | 'offline' // event offline time 8 h
  | 'tagesziele'; // daily goals give Zimtsterne too

export type Decor = 'schneefall' | 'girlande' | 'lichterbogen' | 'lichterturm' | 'baum' | 'schneedach';

export type DoorReward =
  | { kind: 'stars'; amount: number }
  | { kind: 'recipePoints'; amount: number }
  | { kind: 'goldenBean'; amount: number }
  | { kind: 'managerHireCredit'; amount: number }
  | { kind: 'perk'; perk: Perk }
  | { kind: 'decor'; decor: Decor }
  | { kind: 'weihnachtsmanager' };

export interface Door {
  day: number;
  title: string;
  text: string;
  rewards: DoorReward[];
}

export const DOORS: Door[] = [
  { day: 1, title: 'Der Wintermarkt öffnet', text: 'Tausche Zimtsterne gegen Goldene Bohnen, Rezeptpunkte und Manager.', rewards: [{ kind: 'perk', perk: 'markt' }, { kind: 'stars', amount: 50 }] },
  { day: 2, title: 'Es schneit!', text: 'Über deinem Turm rieseln ab jetzt Schneeflocken.', rewards: [{ kind: 'decor', decor: 'schneefall' }] },
  { day: 3, title: 'Der Ofenwichtel', text: 'Die Lebkuchenbäckerei backt von allein weiter.', rewards: [{ kind: 'perk', perk: 'auto0' }] },
  { day: 4, title: 'Herzen-Werkstatt', text: 'Die zweite Etage der Lebkuchen-Manufaktur kann gebaut werden.', rewards: [{ kind: 'perk', perk: 'floor1' }, { kind: 'stars', amount: 150 }] },
  { day: 5, title: 'Rezept aus Omas Dose', text: 'Drei Rezeptpunkte für dein Labor.', rewards: [{ kind: 'recipePoints', amount: 3 }] },
  { day: 6, title: 'Nikolaus!', text: 'Nikolaus Lebkuchner tritt als legendärer Manager in deine Kakao-Manufaktur ein.', rewards: [{ kind: 'weihnachtsmanager' }] },
  { day: 7, title: 'Tannengirlande', text: 'Über dem Versandlager hängt ein festlicher Tannenzweig.', rewards: [{ kind: 'decor', decor: 'girlande' }] },
  { day: 8, title: 'Der Glasurwichtel', text: 'Die Herzen-Werkstatt glasiert von allein weiter.', rewards: [{ kind: 'perk', perk: 'auto1' }] },
  { day: 9, title: 'Zimt im Überfluss', text: '+25 % Zimtsterne in allen Etagen.', rewards: [{ kind: 'perk', perk: 'mehr25' }] },
  { day: 10, title: 'Goldene Bohne', text: 'Eine Goldene Bohne zum Einlösen.', rewards: [{ kind: 'goldenBean', amount: 1 }] },
  { day: 11, title: 'Festdosen-Atelier', text: 'Die dritte Etage der Lebkuchen-Manufaktur kann gebaut werden.', rewards: [{ kind: 'perk', perk: 'floor2' }, { kind: 'stars', amount: 500 }] },
  { day: 12, title: 'Lichterbogen', text: 'Eine Lichterkette spannt sich über das Fabrikdach.', rewards: [{ kind: 'decor', decor: 'lichterbogen' }] },
  { day: 13, title: 'Fleißige Tage', text: 'Bis zum 26. Dezember bringt jedes Tagesziel zusätzlich Zimtsterne.', rewards: [{ kind: 'perk', perk: 'tagesziele' }] },
  { day: 14, title: 'Der Packwichtel', text: 'Das Festdosen-Atelier packt von allein weiter.', rewards: [{ kind: 'perk', perk: 'auto2' }] },
  { day: 15, title: 'Bewerbung im Schnee', text: 'Ein Manager kostenlos für deine Kakao-Manufaktur.', rewards: [{ kind: 'managerHireCredit', amount: 1 }] },
  { day: 16, title: 'Lichter am Turm', text: 'Lichterketten leuchten an beiden Turmkanten.', rewards: [{ kind: 'decor', decor: 'lichterturm' }] },
  { day: 17, title: 'Gewürzlieferung', text: '+50 % Zimtsterne in allen Etagen.', rewards: [{ kind: 'perk', perk: 'mehr50' }] },
  { day: 18, title: 'Weihnachtsrezepte', text: 'Fünf Rezeptpunkte für dein Labor.', rewards: [{ kind: 'recipePoints', amount: 5 }] },
  { day: 19, title: 'Der Weihnachtsbaum', text: 'Vor der Fabrik steht ein geschmückter Baum.', rewards: [{ kind: 'decor', decor: 'baum' }] },
  { day: 20, title: 'Wintersiegel', text: 'Die Lebkuchen-Manufaktur arbeitet bis zu 8 Stunden ohne dich.', rewards: [{ kind: 'perk', perk: 'offline' }] },
  { day: 21, title: 'Doppeltes Glück', text: 'Zwei Goldene Bohnen.', rewards: [{ kind: 'goldenBean', amount: 2 }] },
  { day: 22, title: 'Schnee auf dem Dach', text: 'Das Fabrikdach trägt eine weiße Haube.', rewards: [{ kind: 'decor', decor: 'schneedach' }] },
  { day: 23, title: 'Letzte Vorbereitungen', text: 'Acht Rezeptpunkte für dein Labor.', rewards: [{ kind: 'recipePoints', amount: 8 }] },
  {
    day: 24,
    title: 'Heiligabend',
    text: 'Das große Adventsgeschenk: drei Goldene Bohnen, zehn Rezeptpunkte und 2.000 Zimtsterne.',
    rewards: [
      { kind: 'goldenBean', amount: 3 },
      { kind: 'recipePoints', amount: 10 },
      { kind: 'stars', amount: 2000 },
    ],
  },
  { day: 25, title: '1. Weihnachtstag', text: '5.000 Zimtsterne für den Wintermarkt.', rewards: [{ kind: 'stars', amount: 5000 }] },
  { day: 26, title: '2. Weihnachtstag', text: 'Eine letzte Goldene Bohne und fünf Rezeptpunkte – frohe Weihnachten!', rewards: [{ kind: 'goldenBean', amount: 1 }, { kind: 'recipePoints', amount: 5 }] },
];

export interface ShopItem {
  id: 'bean' | 'rp' | 'hire';
  name: string;
  text: string;
  icon: string;
  /** Price of the first purchase; each purchase multiplies it by `growth`. */
  price: number;
  growth: number;
  /** Purchases in total; at most one per item and day. */
  max: number;
  reward: DoorReward;
}

/** Every item can be bought once per calendar day (new stock at midnight). */
export const SHOP: ShopItem[] = [
  { id: 'bean', name: 'Goldene Bohne', text: 'Geld oder Tempo-Bonus in der Kakao-Manufaktur', icon: 'produkte/goldene_kakaobohne', price: 1000, growth: 3, max: 12, reward: { kind: 'goldenBean', amount: 1 } },
  { id: 'rp', name: '3 Rezeptpunkte', text: 'Für dein Rezeptlabor', icon: 'forschung/forschungsmarke', price: 800, growth: 3.5, max: 8, reward: { kind: 'recipePoints', amount: 3 } },
  { id: 'hire', name: 'Manager kostenlos', text: 'Eine Einstellung in der Kakao-Manufaktur', icon: 'oberflaeche/manager', price: 5000, growth: 4, max: 4, reward: { kind: 'managerHireCredit', amount: 1 } },
];

/** Name of the Christmas manager (his portrait comes from the winter pack). */
export const WINTER_MANAGER_NAME = 'Nikolaus Lebkuchner';

export const DECOR_NAMES: Record<Decor, string> = {
  schneefall: 'Schneefall',
  girlande: 'Tannengirlande',
  lichterbogen: 'Lichterbogen am Dach',
  lichterturm: 'Lichterketten am Turm',
  baum: 'Weihnachtsbaum',
  schneedach: 'Schnee auf dem Dach',
};
