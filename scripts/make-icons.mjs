// Genera los iconos PNG de la extension (16/32/48/128) y icons/logo.svg sin dependencias externas.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT } from './lib/config.mjs';

const BARS = [
  { x: 0.2, h: 0.22 },
  { x: 0.35, h: 0.44 },
  { x: 0.5, h: 0.64 },
  { x: 0.65, h: 0.36 },
  { x: 0.8, h: 0.2 },
];
const BAR_W = 0.095;
const RADIUS = 0.23;

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function sample(x, y) {
  if (!inRoundRect(x, y, 0, 0, 1, 1, RADIUS)) return [0, 0, 0, 0];
  for (const b of BARS) {
    if (inRoundRect(x, y, b.x - BAR_W / 2, 0.5 - b.h / 2, b.x + BAR_W / 2, 0.5 + b.h / 2, BAR_W / 2)) return [255, 255, 255, 1];
  }
  const t = y;
  return [Math.round(47 + (22 - 47) * t), Math.round(123 + (88 - 123) * t), Math.round(255 + (214 - 255) * t), 1];
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const S = 4;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const [cr, cg, cb, ca] = sample((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      const n = S * S;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const dir = path.join(ROOT, 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(dir, `icon-${s}.png`), png(s));

const bars = BARS.map((b) => `<rect x="${((b.x - BAR_W / 2) * 128).toFixed(1)}" y="${((0.5 - b.h / 2) * 128).toFixed(1)}" width="${(BAR_W * 128).toFixed(1)}" height="${(b.h * 128).toFixed(1)}" rx="${((BAR_W / 2) * 128).toFixed(1)}" fill="#fff"/>`).join('');
fs.writeFileSync(
  path.join(dir, 'logo.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F7BFF"/><stop offset="1" stop-color="#1658D6"/></linearGradient></defs><rect width="128" height="128" rx="${RADIUS * 128}" fill="url(#g)"/>${bars}</svg>\n`,
);
console.log('Iconos generados en icons/');
