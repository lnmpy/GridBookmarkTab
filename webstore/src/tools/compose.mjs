import fs from 'node:fs';
import { launch, sleep } from './cdp.mjs';
const [raw, out = new URL('../..', import.meta.url).pathname] = process.argv.slice(2);
const W = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const icon = `${W}/src/icons/icon-128.svg`;
const items = [
  ['screenshots/01-hero.png', 1280, 800, { kicker: 'Bookmark New Tab', title: 'All your bookmarks, one beautiful grid', sub: 'Every new tab opens to the sites you love — with crisp, recognizable icons.', img: 'hero.png' }],
  ['screenshots/02-search.png', 1280, 800, { kicker: 'Instant search', title: 'Press [Space]. Find anything.', sub: 'Fuzzy search across titles and URLs, fully keyboard driven.', img: 'search.png' }],
  ['screenshots/03-dock.png', 1280, 800, { kicker: 'Bookmark dock', title: 'Your favorites, always docked', sub: 'A glass dock with smooth magnification — just name a folder “Dock”.', img: 'dock.png', dark: '1', inset: 'dock-inset.png', insetW: '700' }],
  ['screenshots/04-organize.png', 1280, 800, { kicker: 'Organize in place', title: 'Tidy up without leaving the page', sub: 'Folders, drag & drop, multi-select to move, open or delete in bulk.', img: 'organize.png', inset: 'org-inset.png', insetW: '760', insetB: '150' }],
  ['screenshots/05-themes.png', 1280, 800, { layout: 'split', kicker: 'Make it yours', title: 'Light, dark & your own wallpaper', sub: 'Bing daily or custom backgrounds, adjustable grid — in 10 languages.', img: 'hero.png', img2: 'darkgrid.png' }],
  ['promo/small-tile-440x280.png', 440, 280, { layout: 'small', title: 'Your bookmarks, beautifully organized', sub: 'Grid new tab · Space search · Dock' }],
  ['promo/marquee-1400x560.png', 1400, 560, { layout: 'marquee', title: 'All your bookmarks, one beautiful grid', sub: 'Press [Space] to search, dock your favorites, and make every new tab yours.', img: 'hero.png' }],
];
const b = await launch({ port: 9335 });
await b.send('Page.enable');
for (const [file, w, h, p] of items) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const params = new URLSearchParams({ icon, ...p });
  for (const k of ['img', 'img2', 'inset']) if (p[k]) params.set(k, `${raw}/${p[k]}`);
  await b.send('Page.navigate', { url: `file://${W}/src/frame.html?${params}` });
  await sleep(1200);
  fs.mkdirSync(`${out}/${file.split('/')[0]}`, { recursive: true });
  await b.shot(`${out}/${file}`);
  console.log(file);
}
b.close();
