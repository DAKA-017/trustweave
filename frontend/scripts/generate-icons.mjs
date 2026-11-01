// Generates the TrustWeave app icons from the brand mark (two crossing waves)
// with no image dependencies: a small RGBA rasteriser plus a PNG encoder.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUT_DIR = fileURLToPath(new URL("../public/icons/", import.meta.url));
const APPLE_ICON = fileURLToPath(
  new URL("../public/apple-touch-icon.png", import.meta.url),
);

const SS = 4;
const BG = [0x14, 0x16, 0x19];
const TEAL = [0x38, 0xd4, 0xbb];
const MUTED = [0x9b, 0xa1, 0xa0];
const INK = [0xec, 0xe9, 0xe1];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function insideRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x >= size || y >= size) return false;
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function paint(buffer, size, x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const index = (y * size + x) * 4;
  const srcAlpha = alpha * (color[3] ?? 1);
  if (srcAlpha >= 1) {
    buffer[index] = color[0];
    buffer[index + 1] = color[1];
    buffer[index + 2] = color[2];
    buffer[index + 3] = 255;
    return;
  }
  const dstAlpha = buffer[index + 3] / 255;
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
  if (outAlpha === 0) return;
  for (let channel = 0; channel < 3; channel += 1) {
    const src = color[channel] * srcAlpha;
    const dst = buffer[index + channel] * dstAlpha * (1 - srcAlpha);
    buffer[index + channel] = Math.round((src + dst) / outAlpha);
  }
  buffer[index + 3] = Math.round(outAlpha * 255);
}

function stamp(buffer, size, x, y, radius, color) {
  const minX = Math.floor(x - radius);
  const maxX = Math.ceil(x + radius);
  const minY = Math.floor(y - radius);
  const maxY = Math.ceil(y + radius);
  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const distance = Math.hypot(px + 0.5 - x, py + 0.5 - y);
      if (distance <= radius) {
        paint(buffer, size, px, py, color, 1);
      } else if (distance <= radius + 1) {
        paint(buffer, size, px, py, color, radius + 1 - distance);
      }
    }
  }
}

function drawWave(buffer, size, { from, to, amplitude, phase, colour, stroke }) {
  const steps = Math.max(2, Math.round((to - from) * 1.5));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = from + (to - from) * t;
    const y = size / 2 + amplitude * Math.sin(2 * Math.PI * t + phase);
    stamp(buffer, size, x, y, stroke / 2, colour);
  }
}

function drawIcon(size, { maskable = false } = {}) {
  const canvas = size * SS;
  const buffer = Buffer.alloc(canvas * canvas * 4);
  const radius = maskable ? 0 : canvas * 0.21;

  for (let y = 0; y < canvas; y += 1) {
    for (let x = 0; x < canvas; x += 1) {
      if (insideRoundedRect(x + 0.5, y + 0.5, canvas, radius)) {
        paint(buffer, canvas, x, y, BG);
      }
    }
  }

  const extent = maskable ? 0.56 : 0.68;
  const span = canvas * extent;
  const from = (canvas - span) / 2;
  const to = from + span;
  const amplitude = span * 0.22;
  const stroke = canvas * (maskable ? 0.064 : 0.058);

  drawWave(buffer, canvas, {
    from,
    to,
    amplitude,
    phase: 0,
    colour: TEAL,
    stroke,
  });
  drawWave(buffer, canvas, {
    from,
    to,
    amplitude,
    phase: Math.PI,
    colour: MUTED,
    stroke,
  });

  stamp(buffer, canvas, canvas / 2, canvas / 2, stroke * 0.62, INK);

  const out = Buffer.alloc(size * size * 4);
  const samples = SS * SS;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const index = ((y * SS + sy) * canvas + (x * SS + sx)) * 4;
          const alpha = buffer[index + 3] / 255;
          r += buffer[index] * alpha;
          g += buffer[index + 1] * alpha;
          b += buffer[index + 2] * alpha;
          a += alpha;
        }
      }
      const index = (y * size + x) * 4;
      if (a > 0) {
        out[index] = Math.round(r / a);
        out[index + 1] = Math.round(g / a);
        out[index + 2] = Math.round(b / a);
      }
      out[index + 3] = Math.round((a / samples) * 255);
    }
  }
  return encodePng(size, size, out);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["maskable-192.png", 192, { maskable: true }],
  ["maskable-512.png", 512, { maskable: true }],
];

for (const [name, size, options] of targets) {
  writeFileSync(`${OUT_DIR}${name}`, drawIcon(size, options));
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}

writeFileSync(APPLE_ICON, drawIcon(180, { maskable: true }));
console.log("wrote public/apple-touch-icon.png (180x180)");
