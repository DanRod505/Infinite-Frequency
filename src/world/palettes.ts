import { Color } from 'three';

/** Colour scheme of one Neon Dreams variation (GDD §5.2, §5.3). */
export interface Palette {
  skyTop: Color;
  skyMiddle: Color;
  skyHorizon: Color;
  fog: Color;
  sunTop: Color;
  sunBottom: Color;
  gridMain: Color;
  gridSecondary: Color;
  /** Main neon colour for structures. */
  accentA: Color;
  /** Secondary neon colour for structures. */
  accentB: Color;
}

export type PaletteName = 'sunset' | 'midnight' | 'ultraviolet' | 'inferno';

function palette(hex: Record<keyof Palette, number>): Palette {
  const out = {} as Palette;
  for (const key of Object.keys(hex) as (keyof Palette)[]) out[key] = new Color(hex[key]);
  return out;
}

export const PALETTES: Record<PaletteName, Palette> = {
  // Classic synthwave: magenta sky, golden sun.
  sunset: palette({
    skyTop: 0x090018,
    skyMiddle: 0x3a0b5c,
    skyHorizon: 0xff3c8e,
    fog: 0x1a0630,
    sunTop: 0xffd84d,
    sunBottom: 0xff2e8c,
    gridMain: 0xff2ad4,
    gridSecondary: 0x7a1fd0,
    accentA: 0xff3fd2,
    accentB: 0x3ff2ff,
  }),
  // Calm and cold: deep blue night, cyan horizon, pale moon-like sun.
  midnight: palette({
    skyTop: 0x01020e,
    skyMiddle: 0x0a1648,
    skyHorizon: 0x1fb4ff,
    fog: 0x050c26,
    sunTop: 0xe9f6ff,
    sunBottom: 0x4f7dff,
    gridMain: 0x2fd0ff,
    gridSecondary: 0x2433a8,
    accentA: 0x3ff2ff,
    accentB: 0x7b6bff,
  }),
  // Violet haze: purple sky, pink-lilac sun.
  ultraviolet: palette({
    skyTop: 0x07001a,
    skyMiddle: 0x2b0a6e,
    skyHorizon: 0xb04bff,
    fog: 0x150835,
    sunTop: 0xffb3f3,
    sunBottom: 0x9a3dff,
    gridMain: 0xb84dff,
    gridSecondary: 0x4a1d9c,
    accentA: 0xc77dff,
    accentB: 0xff4fd8,
  }),
  // Peak intensity: red-orange sky, burning sun.
  inferno: palette({
    skyTop: 0x16002e,
    skyMiddle: 0x7a0f50,
    skyHorizon: 0xff6a2c,
    fog: 0x2e0a32,
    sunTop: 0xfff07a,
    sunBottom: 0xff2a1f,
    gridMain: 0xff5a2a,
    gridSecondary: 0xa3124f,
    accentA: 0xff7a2a,
    accentB: 0xffd23f,
  }),
};

/** Which variations suit each intensity level. */
export const PALETTES_BY_LEVEL: Record<'low' | 'mid' | 'high', PaletteName[]> = {
  low: ['midnight', 'ultraviolet'],
  mid: ['sunset', 'ultraviolet'],
  high: ['inferno', 'sunset'],
};

/** Writes the blend `a → b` at `t` into `out` (all colours). */
export function lerpPalette(a: Palette, b: Palette, t: number, out: Palette): Palette {
  for (const key of Object.keys(out) as (keyof Palette)[]) out[key].lerpColors(a[key], b[key], t);
  return out;
}

export function clonePalette(p: Palette): Palette {
  const out = {} as Palette;
  for (const key of Object.keys(p) as (keyof Palette)[]) out[key] = p[key].clone();
  return out;
}
