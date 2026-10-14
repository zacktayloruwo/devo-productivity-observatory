// Colour ramps for the choropleth. Sequential ramps run from the neutral
// ground to the accent, with a dark-theme variant lifted off the panel.

export type Ramp = string[];

export const SEQ_LIGHT: Ramp = ['#EFEDE6', '#CFE0E1', '#9BC4C7', '#5B9BA1', '#1F6F78', '#0E3C42'];
export const SEQ_DARK: Ramp = ['#34474C', '#3B6268', '#4A858C', '#62AAB2', '#95DDE3', '#C9F2F5'];

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

// t in [0, 1] -> colour along the ramp
export function rampColour(ramp: Ramp, t: number): string {
  if (!Number.isFinite(t)) return ramp[0];
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.floor(x), f = x - i;
  if (i >= ramp.length - 1) return ramp[ramp.length - 1];
  const a = hex(ramp[i]), b = hex(ramp[i + 1]);
  return toHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

// Viridis (matplotlib), low to high: dark purple to yellow. Perceptually
// uniform and legible to colour-blind readers, in both themes.
export const VIRIDIS: Ramp = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];

// Diverging, below the mean to above it: red, white, blue (ColorBrewer RdBu, 7 classes)
export const RDBU7: string[] = ['#b2182b', '#ef8a62', '#fddbc7', '#f7f7f7', '#d1e5f0', '#67a9cf', '#2166ac'];
