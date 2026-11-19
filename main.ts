// gta6-meme-x-01 entry program (Node 22, standard library only, no network).
// Draws the entry's meme picture — a GTA VI "loading screen" parody with the
// make.fun ghost mascot — into meme.png beside this file, with a hand-rolled
// PNG encoder (node:zlib) and a tiny 5x7 bitmap font. Deterministic: two
// runs write identical bytes.
//   node main.ts            -> writes meme.png
//   MAKEFUN_OUTPUT_DIR=out node main.ts   -> also copies meme.png and POST.json to out/

import { deflateSync } from 'node:zlib';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

// ---------- canvas (supersampled 2x, downsampled at encode time) ----------
const W = 1080, H = 1080, SS = 2, SW = W * SS, SH = H * SS;
const buf = new Uint8Array(SW * SH * 3);

type RGB = [number, number, number];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (c1: RGB, c2: RGB, t: number): RGB => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

function px(x: number, y: number, c: RGB, alpha = 1) {
  const xi = Math.round(x * SS), yi = Math.round(y * SS);
  if (xi < 0 || yi < 0 || xi >= SW || yi >= SH) return;
  const i = (yi * SW + xi) * 3;
  if (alpha >= 1) { buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; }
  else {
    buf[i] = lerp(buf[i], c[0], alpha); buf[i + 1] = lerp(buf[i + 1], c[1], alpha); buf[i + 2] = lerp(buf[i + 2], c[2], alpha);
  }
}
function rect(x: number, y: number, w: number, h: number, c: RGB, alpha = 1) {
  for (let j = y * SS; j < (y + h) * SS; j++) for (let i = x * SS; i < (x + w) * SS; i++) px(i / SS, j / SS, c, alpha);
}
function circle(cx: number, cy: number, r: number, c: RGB, alpha = 1) {
  const R = r * SS, CX = cx * SS, CY = cy * SS;
  for (let j = Math.floor(CY - R); j <= CY + R; j++) for (let i = Math.floor(CX - R); i <= CX + R; i++) {
    const d = Math.hypot(i - CX, j - CY);
    if (d <= R) px(i / SS, j / SS, c, alpha * Math.min(1, R - d + 0.5));
  }
}
function line(x1: number, y1: number, x2: number, y2: number, thick: number, c: RGB, alpha = 1) {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * SS * 2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    circle(lerp(x1, x2, t), lerp(y1, y2, t), thick / 2, c, alpha);
  }
}
function bezier(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, thick: number, c: RGB) {
  let lx = x1, ly = y1;
  for (let s = 1; s <= 24; s++) {
    const t = s / 24, u = 1 - t;
    const x = u * u * x1 + 2 * u * t * cx + t * t * x2;
    const y = u * u * y1 + 2 * u * t * cy + t * t * y2;
    line(lx, ly, x, y, thick, c); lx = x; ly = y;
  }
}
function roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB, alpha = 1) {
  rect(x + r, y, w - 2 * r, h, c, alpha); rect(x, y + r, w, h - 2 * r, c, alpha);
  circle(x + r, y + r, r, c, alpha); circle(x + w - r, y + r, r, c, alpha);
  circle(x + r, y + h - r, r, c, alpha); circle(x + w - r, y + h - r, r, c, alpha);
}

// ---------- 5x7 bitmap font (only the glyphs the meme uses) ----------
const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '01110', '00001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  f: ['00110', '01001', '01000', '11110', '01000', '01000', '01000'],
  k: ['10000', '10000', '10010', '10100', '11000', '10100', '10010'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  n: ['00000', '00000', '11110', '10001', '10001', '10001', '10001'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
};
function textWidth(s: string, scale: number, spacing = 1) {
  return s.length * (5 + spacing) * scale - spacing * scale;
}
function drawText(s: string, cx: number, y: number, scale: number, c: RGB, spacing = 1) {
  let x = cx - textWidth(s, scale, spacing) / 2;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++)
      if (g[r][col] === '1') rect(x + col * scale, y + r * scale, scale, scale, c);
    x += (5 + spacing) * scale;
  }
}
function drawTextLeft(s: string, x: number, y: number, scale: number, c: RGB, spacing = 1) {
  drawText(s, x + textWidth(s, scale, spacing) / 2, y, scale, c, spacing);
}

// ---------- scene ----------
const INK: RGB = [13, 5, 24];        // silhouette near-black violet
const WHITE: RGB = [255, 255, 255];
const CREAM: RGB = [255, 244, 214];
const MAGENTA: RGB = [232, 67, 147];
const ORANGE: RGB = [255, 140, 66];
const YELLOW: RGB = [255, 209, 102];
const DARKTXT: RGB = [26, 16, 48];

// sky: Vice City sunset gradient down to the sea line
const skyStops: [number, RGB][] = [
  [0.0, [26, 5, 51]], [0.35, [123, 45, 139]], [0.62, [232, 67, 147]], [0.8, [255, 140, 66]], [1.0, [255, 183, 71]],
];
const seaY = Math.round(H * 0.78);
for (let y = 0; y < seaY; y++) {
  const t = y / seaY;
  let c = skyStops[skyStops.length - 1][1];
  for (let s = 0; s < skyStops.length - 1; s++) {
    if (t >= skyStops[s][0] && t <= skyStops[s + 1][0]) { c = mix(skyStops[s][1], skyStops[s + 1][1], (t - skyStops[s][0]) / (skyStops[s + 1][0] - skyStops[s][0])); break; }
  }
  rect(0, y, W, 1, c);
}
// sea
rect(0, seaY, W, H - seaY, [18, 8, 38]);
// sun with synthwave slices, sitting on the sea line
const sunX = W * 0.5, sunY = seaY - 40, sunR = 235;
for (let y = -sunR; y < sunR; y++) {
  const t = (y + sunR) / (2 * sunR);
  if (sunY + y >= seaY) continue; // the sea clips the sun
  if (y > 40 && (Math.floor((y - 40) / 14) % 2 === 0) && y % 14 < 6) continue; // slice gaps low on the sun
  const half = Math.sqrt(sunR * sunR - y * y);
  rect(sunX - half, sunY + y, half * 2, 1, mix(YELLOW, ORANGE, t));
}
// sun reflections on the sea (deterministic dashes)
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (let i = 0; i < 46; i++) {
  const y = seaY + 12 + rnd() * 120;
  const wdt = 30 + rnd() * 130 * (1 - (y - seaY) / 260);
  const x = sunX - wdt / 2 + (rnd() - 0.5) * 160;
  rect(x, y, wdt, 3, mix(ORANGE, MAGENTA, rnd()), 0.5);
}
// palm silhouettes
function palm(baseX: number, baseY: number, hgt: number, lean: number) {
  const topX = baseX + lean, topY = baseY - hgt;
  bezier(baseX, baseY, baseX + lean * 0.2, baseY - hgt * 0.6, topX, topY, 13, INK);
  const fronds: [number, number, number, number][] = [
    [-120, -58, -190, 6], [-80, -84, -120, 26], [-26, -98, -30, 40],
    [30, -96, 66, 34], [84, -80, 140, 16], [118, -50, 178, 42],
  ];
  for (const [cx, cy, ex, ey] of fronds)
    bezier(topX, topY, topX + cx, topY + cy, topX + ex, topY + ey, 9, INK);
  circle(topX - 12, topY + 10, 13, INK); circle(topX + 14, topY + 12, 11, INK);
}
palm(88, seaY + 26, 330, 52);
palm(W - 92, seaY + 30, 356, -58);

// title block
drawText('GTA VI', W / 2 + 5, 63, 21, MAGENTA);
drawText('GTA VI', W / 2, 58, 21, WHITE);
drawText('LOADING SCREEN', W / 2, 232, 7, CREAM, 3);

// make.fun pill, top-right
roundRect(800, 26, 254, 52, 26, [10, 6, 24], 0.72);
drawTextLeft('make.fun', 822, 41, 4.6, WHITE);

// loading bar
const barX = 108, barY = 742, barW = 864, barH = 40;
roundRect(barX - 6, barY - 6, barW + 12, barH + 12, 16, WHITE);
roundRect(barX, barY, barW, barH, 11, [30, 12, 54]);
const fillW = Math.floor(barW * 0.99);
for (let x = 0; x < fillW; x++) rect(barX + x, barY, 1, barH, mix(MAGENTA, ORANGE, x / barW));
drawTextLeft('99%', barX + barW - 150, barY + 4, 6, DARKTXT);
drawText('SINCE 2013', W / 2, 806, 6, CREAM, 2);

// the ghost (make.fun mascot, drawn for this meme): standing on the bar
const gx = 796, gy = 566; // hem lands exactly on the bar's top edge
circle(gx + 62, gy + 58, 62, WHITE);                       // head dome
rect(gx, gy + 58, 124, 96, WHITE);                        // body
for (let i = 0; i < 4; i++) circle(gx + 16 + i * 31, gy + 154, 16, WHITE); // wavy hem
circle(gx + 40, gy + 62, 10, DARKTXT); circle(gx + 84, gy + 62, 10, DARKTXT); // eyes
circle(gx + 43, gy + 59, 3.5, WHITE); circle(gx + 87, gy + 59, 3.5, WHITE);
for (let a = 0.15; a < Math.PI - 0.1; a += 0.12) circle(gx + 62 + Math.cos(a) * 22, gy + 78 + Math.sin(a) * 13, 3.4, DARKTXT); // smile
circle(gx + 20, gy + 88, 10, MAGENTA, 0.55); circle(gx + 104, gy + 88, 10, MAGENTA, 0.55); // blush
line(gx + 8, gy + 100, gx - 22, gy + 54, 11, WHITE);      // raised left arm
// sign the ghost holds up
line(758, 560, 776, 618, 7, [90, 60, 30]);
roundRect(560, 440, 400, 120, 18, WHITE);
drawText('I GOT PAID', 760, 460, 6, DARKTXT);
drawTextLeft('make.fun', 760 - textWidth('make.fun', 6) / 2, 508, 6, MAGENTA);

// caption band
rect(0, 906, W, H - 906, [8, 4, 16]);
rect(0, 906, W, 4, MAGENTA);
drawText('MY AGENT EARNED REAL USDC ON MAKE.FUN', W / 2, 950, 4.6, YELLOW);
drawText('BEFORE THIS LOADING SCREEN FINISHED', W / 2, 1012, 4.6, WHITE);

// ---------- PNG encode (downsample + zlib) ----------
const out = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let r = 0, g = 0, b = 0;
  for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
    const i = ((y * SS + dy) * SW + x * SS + dx) * 3;
    r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
  }
  const o = (y * W + x) * 4, n = SS * SS;
  out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
}
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  Buffer.from(out.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
}
const crcTable: number[] = [];
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
function crc32(b: Buffer) { let c = 0xffffffff; for (const byte of b) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
const pngPath = join(here, 'meme.png');
writeFileSync(pngPath, png);
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
copyFileSync(pngPath, join(outDir, 'meme.png'));
// The gate reads /output/POST.json (kit starter contract): POST.json names the X post.
copyFileSync(join(here, 'POST.json'), join(outDir, 'POST.json'));
console.log(`meme.png written: ${png.length} bytes (${W}x${H}) exists=${existsSync(pngPath)}`);
