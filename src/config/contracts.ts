/**
 * Lieferverträge: customers order goods with a deadline.
 *
 * A contract asks for units of one floor's product, or for goods value sold
 * (in €). Targets and payment are sized from the factory's current flow when
 * the offer is written, so contracts stay relevant from the first floors to
 * the Oberhaus. Delivered on time they pay money and Ruf; Ruf brings better
 * customers. Deadlines run in game time, also while the game is closed.
 */
import type { GoalReward } from './goals';

export type CustomerId = 'cafe' | 'konditorei' | 'feinkost' | 'grandhotel' | 'salon' | 'hofkontor';

export interface CustomerDef {
  id: CustomerId;
  name: string;
  /** Short line for the contract paper. */
  motto: string;
  icon: string;
  /** Ruf needed before this customer writes offers. */
  ruf: number;
  /** 'units': units of one floor's product; 'value': goods value sold (€). */
  kind: 'units' | 'value';
  /** Floors (indices) this customer orders from; the highest built one is preferred. */
  floors: number[];
  /** Deadline range in minutes. */
  minutes: [number, number];
  /** Target = expected output in the deadline × this range (1 = exactly the current flow). */
  demand: [number, number];
  /** Payment = current income × deadline seconds × this factor. */
  pay: number;
  /** Ruf for an on-time delivery. */
  rufGain: number;
  /** Extra reward and its chance per contract. */
  bonus?: { chance: number; reward: GoalReward };
}

export const CUSTOMERS: CustomerDef[] = [
  {
    id: 'cafe',
    name: 'Café Kupferkännchen',
    motto: 'Für unsere Gäste am Nachmittag',
    icon: 'vertraege/kunden/cafe',
    ruf: 0,
    kind: 'units',
    floors: [0, 1],
    minutes: [5, 8],
    demand: [0.75, 0.9],
    pay: 0.35,
    rufGain: 1,
  },
  {
    id: 'konditorei',
    name: 'Konditorei Zuckerblatt',
    motto: 'Für Torten, Tartes und Pralinés',
    icon: 'vertraege/kunden/konditorei',
    ruf: 10,
    kind: 'units',
    floors: [1, 2, 3],
    minutes: [8, 12],
    demand: [0.8, 0.95],
    pay: 0.4,
    rufGain: 2,
    bonus: { chance: 0.35, reward: { kind: 'recipePoints', amount: 1 } },
  },
  {
    id: 'feinkost',
    name: 'Feinkosthaus Goldblatt',
    motto: 'Ein gemischtes Sortiment für die Feinkosttheke',
    icon: 'vertraege/kunden/feinkost',
    ruf: 30,
    kind: 'value',
    floors: [],
    minutes: [10, 15],
    demand: [0.85, 1.0],
    pay: 0.45,
    rufGain: 3,
    bonus: { chance: 0.35, reward: { kind: 'goldenBean', amount: 1 } },
  },
  {
    id: 'grandhotel',
    name: 'Grandhotel Kronenhof',
    motto: 'Für die Suiten und das Abendbankett',
    icon: 'vertraege/kunden/grandhotel',
    ruf: 70,
    kind: 'units',
    floors: [3, 4, 5],
    minutes: [15, 20],
    demand: [0.9, 1.1],
    pay: 0.5,
    rufGain: 4,
    bonus: { chance: 0.5, reward: { kind: 'goldenBean', amount: 1 } },
  },
  {
    id: 'salon',
    name: 'Salon Nachtgold',
    motto: 'Für den Ball am Samstag',
    icon: 'vertraege/kunden/salon',
    ruf: 140,
    kind: 'units',
    floors: [5, 6, 7],
    minutes: [20, 25],
    demand: [1.0, 1.15],
    pay: 0.55,
    rufGain: 5,
    bonus: { chance: 0.5, reward: { kind: 'recipePoints', amount: 2 } },
  },
  {
    id: 'hofkontor',
    name: 'Hofkontor Zimtwacht',
    motto: 'Hoflieferung – nur das Beste',
    icon: 'vertraege/kunden/hofkontor',
    ruf: 240,
    kind: 'value',
    floors: [],
    minutes: [25, 30],
    demand: [1.0, 1.2],
    pay: 0.6,
    rufGain: 6,
    bonus: { chance: 0.6, reward: { kind: 'managerHireCredit', amount: 1 } },
  },
];

export const CUSTOMER_BY_ID = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c])) as Record<CustomerId, CustomerDef>;

export const CONTRACTS = {
  /** The contract board opens when this floor (index) is built for the first time. */
  openFloor: 1,
  /** Offers on the board. */
  slots: 3,
  /** Seconds until an empty slot gets a new offer. */
  refill: 90,
  /** Offers are rewritten after this many seconds (so their numbers stay current). */
  offerLife: 20 * 60,
  /** Only one contract runs at a time. */
};

export const SEAL_ART = {
  offer: 'vertraege/siegel/angebot',
  active: 'vertraege/siegel/aktiv',
  delivered: 'vertraege/siegel/puenktlich',
  failed: 'vertraege/siegel/abgelaufen',
} as const;
