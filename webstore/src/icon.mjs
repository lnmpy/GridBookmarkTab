// Generates the GBKTab icon as SVG. All sizes share one design:
// an indigo -> violet rounded square holding a grid of white tiles,
// where one solid tile carries the bookmark ribbon.

const tileOpacity3 = [0.6, 0.48, 0.38, 0.48, 1, 0.32, 0.38, 0.28, 0.22];
const tileOpacity2 = [1, 0.55, 0.55, 0.35];

function bookmark(x, y, s) {
  // Ribbon centered in a tile of size s at (x, y)
  const w = s * 0.46;
  const h = s * 0.6;
  const l = x + (s - w) / 2;
  const t = y + (s - h) / 2;
  const notch = h * 0.26;
  const r = w * 0.18;
  return `<path fill="#6D28D9" d="M${l + r} ${t}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${t + h}l${-w / 2} ${-notch}l${-w / 2} ${notch}V${t + r}a${r} ${r} 0 0 1 ${r} ${-r}z"/>`;
}

/**
 * @param {object} o
 * @param {number} o.canvas  output canvas size in px (viewBox)
 * @param {number} o.art     size of the rounded square
 * @param {2|3}    o.grid    tiles per row
 * @param {boolean} o.shadow draw a soft drop shadow (only for padded icons)
 */
export function iconSvg({ canvas, art, grid, shadow = false }) {
  const o = (canvas - art) / 2;
  const radius = art * 0.25;
  const pad = art * (grid === 3 ? 0.17 : 0.2);
  const gap = art * (grid === 3 ? 0.06 : 0.1);
  const tile = (art - 2 * pad - (grid - 1) * gap) / grid;
  const tr = tile * (grid === 3 ? 0.3 : 0.28);
  const opacities = grid === 3 ? tileOpacity3 : tileOpacity2;
  const solidIndex = grid === 3 ? 4 : 0;

  let tiles = '';
  for (let i = 0; i < grid * grid; i++) {
    const x = o + pad + (i % grid) * (tile + gap);
    const y = o + pad + Math.floor(i / grid) * (tile + gap);
    tiles += `<rect x="${x}" y="${y}" width="${tile}" height="${tile}" rx="${tr}" fill="#fff" fill-opacity="${opacities[i]}"/>`;
    if (i === solidIndex && tile >= 6) tiles += bookmark(x, y, tile);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4F46E5"/><stop offset="1" stop-color="#A855F7"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="${art * 0.03}" stdDeviation="${art * 0.035}" flood-color="#1E1B4B" flood-opacity=".35"/>
    </filter>
  </defs>
  <rect x="${o}" y="${o}" width="${art}" height="${art}" rx="${radius}" fill="url(#bg)"${shadow ? ' filter="url(#sh)"' : ''}/>
  <rect x="${o}" y="${o}" width="${art}" height="${art}" rx="${radius}" fill="url(#gloss)"/>
  ${tiles}
</svg>`;
}

// Size presets: the 128px store icon keeps the 16px transparent padding Chrome asks for,
// toolbar sizes fill the canvas and switch to a 2x2 grid to stay crisp.
export const presets = {
  16: { canvas: 16, art: 16, grid: 2 },
  24: { canvas: 24, art: 24, grid: 2 },
  32: { canvas: 32, art: 32, grid: 3 },
  48: { canvas: 48, art: 46, grid: 3 },
  64: { canvas: 64, art: 60, grid: 3 },
  128: { canvas: 128, art: 96, grid: 3, shadow: true },
};
