/** Painted icons from the asset pack (no emoji, no external URLs). */
import type { ReactElement } from 'react';
import { artUrl } from '../render/assets';
import { FLOOR_ART, portraitKey } from '../config/content';
import type { Manager } from '../sim/types';

type P = { size?: number };

function Img({ k, size }: { k: string; size: number }): ReactElement {
  return <img className="icon-img" src={artUrl(k)} alt="" width={size} height={size} style={{ width: size, height: size }} draggable={false} />;
}

export const IconManager = ({ size = 28 }: P) => <Img k="oberflaeche/manager" size={size} />;
export const IconQuest = ({ size = 28 }: P) => <Img k="oberflaeche/auftraege" size={size} />;
export const IconFactory = ({ size = 28 }: P) => <Img k="oberflaeche/werk" size={size} />;
export const IconGear = ({ size = 28 }: P) => <Img k="oberflaeche/einstellungen" size={size} />;
export const IconStats = ({ size = 28 }: P) => <Img k="oberflaeche/statistik" size={size} />;
export const IconCoin = ({ size = 24 }: P) => <Img k="oberflaeche/muenze" size={size} />;
export const IconClose = ({ size = 20 }: P) => <Img k="oberflaeche/schliessen" size={size} />;
export const IconBolt = ({ size = 18 }: P) => <Img k="oberflaeche/boost" size={size} />;
export const IconCrown = ({ size = 24 }: P) => <Img k="oberflaeche/krone" size={size} />;
export const IconLock = ({ size = 22 }: P) => <Img k="oberflaeche/gesperrt" size={size} />;
export const IconWarn = ({ size = 20 }: P) => <Img k="oberflaeche/engpass" size={size} />;
export const IconGift = ({ size = 22 }: P) => <Img k="oberflaeche/belohnung" size={size} />;
export const IconCheck = ({ size = 18 }: P) => <Img k="oberflaeche/bestaetigen" size={size} />;
export const IconWatch = ({ size = 28 }: P) => <Img k="oberflaeche/offline" size={size} />;
export const IconSound = ({ size = 24 }: P) => <Img k="oberflaeche/ton" size={size} />;
export const IconUpgrade = ({ size = 22 }: P) => <Img k="oberflaeche/upgrade" size={size} />;
export const IconLab = ({ size = 28 }: P) => <Img k="forschung/labortisch" size={size} />;
export const IconTruck = ({ size = 22 }: P) => <Img k="logistik/lieferwagen" size={size} />;
export const IconLift = ({ size = 22 }: P) => <Img k="logistik/lastenaufzug" size={size} />;
export const IconBox = ({ size = 22 }: P) => <Img k="produkte/lieferpaket" size={size} />;

export const PRODUCT_ART = FLOOR_ART.map((a) => a.product);
export const IconProduct = ({ floor, size = 40 }: { floor: number; size?: number }) => <Img k={PRODUCT_ART[floor]} size={size} />;

/** Painted manager portrait in a round frame with the rarity colour. */
export function Portrait({ m, size = 58 }: { m: Pick<Manager, 'name' | 'category' | 'look' | 'rarity'>; size?: number }): ReactElement {
  return (
    <span className={`portrait r${m.rarity}`} style={{ width: size, height: size }}>
      <img src={artUrl(portraitKey(m.name, m.category, m.look.hair))} alt="" draggable={false} />
    </span>
  );
}
