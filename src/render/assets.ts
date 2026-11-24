import { ImageSource, Rectangle, Texture } from 'pixi.js';
import manifest from '../assets/art/manifest.json';

/**
 * Painted asset pack (WebP, prepared by scripts/prepare-assets.py).
 * Vite fingerprints every file; the service worker precaches them for offline play.
 */
const files = import.meta.glob('../assets/art/**/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const urls: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) urls[path.replace('../assets/art/', '').replace(/\.webp$/, '')] = url;

export type ArtKey = keyof typeof manifest;

export function artUrl(key: ArtKey | string): string {
  return urls[key] ?? '';
}

export function artSize(key: ArtKey | string): { w: number; h: number } {
  return (manifest as Record<string, { w: number; h: number }>)[key] ?? { w: 1, h: 1 };
}

const textures = new Map<string, Texture>();
let loaded: Promise<ArtLoadResult> | null = null;

export interface ArtLoadResult {
  total: number;
  failed: string[];
}

/** One image via a plain <img> element: no workers, no createImageBitmap – works in every WebView and sandbox. */
function loadImage(url: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let done = false;
    const finish = (ok: boolean, err?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (ok) resolve(img);
      else reject(err instanceof Error ? err : new Error(`Bild nicht geladen: ${url}`));
    };
    const timer = setTimeout(() => finish(false, new Error(`Zeitüberschreitung: ${url}`)), timeoutMs);
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      // decode() keeps the first frame smooth; older WebKit rejects it for detached images, onload is enough then
      if (typeof img.decode === 'function') img.decode().then(() => finish(true), () => finish(true));
      else finish(true);
    };
    img.onerror = () => finish(false);
    img.src = url;
  });
}

async function loadTexture(url: string): Promise<Texture> {
  let img: HTMLImageElement;
  try {
    img = await loadImage(url, 10000);
  } catch {
    // one retry with a cache-busting query (a half-finished response may be stuck in the HTTP cache)
    img = await loadImage(`${url}${url.includes('?') ? '&' : '?'}r=${Date.now()}`, 8000);
  }
  return new Texture({ source: new ImageSource({ resource: img, alphaMode: 'premultiply-alpha-on-upload' }) });
}

/**
 * Loads every texture once; progress 0..1. Never rejects and never hangs:
 * an image that fails twice is reported in `failed` and drawn invisible.
 */
export function loadArt(onProgress?: (p: number, done: number, total: number) => void): Promise<ArtLoadResult> {
  if (loaded) return loaded;
  const entries = Object.entries(urls);
  const total = entries.length;
  let done = 0;
  const failed: string[] = [];
  onProgress?.(0, 0, total);
  loaded = Promise.all(
    entries.map(async ([key, url]) => {
      try {
        textures.set(key, await loadTexture(url));
      } catch {
        failed.push(key);
      }
      done++;
      onProgress?.(done / total, done, total);
    }),
  ).then(() => ({ total, failed }));
  return loaded;
}

export function tex(key: ArtKey | string): Texture {
  return textures.get(key) ?? Texture.EMPTY;
}

/** Sub-rectangle of a texture (source pixels). */
export function subTex(key: ArtKey | string, x: number, y: number, w: number, h: number): Texture {
  if (!textures.has(key)) return Texture.EMPTY;
  const t = tex(key);
  return new Texture({ source: t.source, frame: new Rectangle(x, y, Math.min(w, t.source.width - x), Math.min(h, t.source.height - y)) });
}
