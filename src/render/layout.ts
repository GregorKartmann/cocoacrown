/** World layout constants (world units; 1 unit ≈ 1 CSS px on a 420 px wide phone). */
export const L = {
  /** Width of the production interior. */
  interiorW: 322,
  /** Lift shaft. */
  shaftX: 322,
  shaftW: 82,
  towerW: 404,
  /** Visible design width (tower + margins). */
  designW: 428,
  floorH: 150,
  slab: 14,
  roofH: 236,
  groundH: 160,
  streetH: 96,
};

export interface WorldLayout {
  floors: number;
  construction: boolean;
  total: number;
  roofY: number;
  constructionY: number;
  groundY: number;
  floorY: (i: number) => number;
  /** y of the lift car floor for a given lift position. */
  liftY: (pos: number) => number;
  /** Top of the shaft (machine room). */
  shaftTop: number;
}

export function computeLayout(unlockedFloors: number, maxFloors: number): WorldLayout {
  const construction = unlockedFloors < maxFloors;
  const roofY = 0;
  const constructionY = L.roofH;
  const firstFloorTop = L.roofH + (construction ? L.floorH : 0);
  const groundY = firstFloorTop + unlockedFloors * L.floorH;
  const floorY = (i: number) => firstFloorTop + (unlockedFloors - 1 - i) * L.floorH;
  const groundStop = groundY + L.groundH - L.slab - 2;
  const floorStop = (k: number) => floorY(k) + L.floorH - L.slab - 2;
  const liftY = (pos: number) => {
    if (pos <= 1) return groundStop + (floorStop(0) - groundStop) * pos;
    return floorStop(0) - (pos - 1) * L.floorH;
  };
  return {
    floors: unlockedFloors,
    construction,
    total: groundY + L.groundH + L.streetH,
    roofY,
    constructionY,
    groundY,
    floorY,
    liftY,
    shaftTop: L.roofH - 70,
  };
}
