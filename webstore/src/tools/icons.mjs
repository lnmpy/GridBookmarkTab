import fs from 'node:fs';
import { launch, sleep } from './cdp.mjs';
import { iconSvg, presets } from '../icon.mjs';
const out = process.argv[2] || new URL('../icons', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const b = await launch({ port: 9336 });
await b.send('Page.enable');
await b.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
const render = async (svg, size, file) => {
  await b.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  const html = svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}" style="display:block"`);
  await b.send('Page.navigate', { url: `data:text/html,${encodeURIComponent(`<body style="margin:0;background:transparent">${html}</body>`)}` });
  await sleep(400);
  await b.shot(file);
};
for (const [size, p] of Object.entries(presets)) {
  const svg = iconSvg(p);
  fs.writeFileSync(`${out}/icon-${size}.svg`, svg);
  await render(svg, +size, `${out}/icon-${size}.png`);
}
await render(iconSvg(presets[128]), 1024, `${out}/icon-1024.png`);
b.close();
