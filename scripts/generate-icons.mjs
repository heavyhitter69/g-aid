import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const sourcePng = path.join(root, "public", "g-aid logo.png");

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

if (!fs.existsSync(sourcePng)) {
  console.error("Missing source logo:", sourcePng);
  process.exit(1);
}

const src = PNG.sync.read(fs.readFileSync(sourcePng));
const trimmed = trimPadding(src);

const iconPng = makeSquircle(trimmed, 512, {
  margin: 0,
  radius: 0.22,
  outside: "transparent",
  logoInset: 0.16,
});
const iconPngPath = path.join(buildDir, "icon.png");
fs.writeFileSync(iconPngPath, PNG.sync.write(iconPng));
fs.writeFileSync(path.join(buildDir, "icon.ico"), await pngToIco(iconPngPath));

const linuxIcons = path.join(buildDir, "icons");
fs.mkdirSync(linuxIcons, { recursive: true });
for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
  const sized = scalePng(iconPng, size, size);
  fs.writeFileSync(path.join(linuxIcons, `${size}x${size}.png`), PNG.sync.write(sized));
}

const publicIcon = path.join(root, "public", "app-icon.png");
fs.writeFileSync(publicIcon, PNG.sync.write(scalePng(iconPng, 256, 256)));

const small = makeWizardSmall(trimmed, 110);
writeBmp24(path.join(buildDir, "wizard-small.bmp"), pngToBmp(small, 55, 55));
writeBmp24(path.join(buildDir, "wizard-small-200.bmp"), pngToBmp(small, 110, 110));

writeBmp24(path.join(buildDir, "wizard-big.bmp"), pngToBmp(makeFinishImage(trimmed, 164, 314), 164, 314));
writeBmp24(path.join(buildDir, "wizard-big-200.bmp"), pngToBmp(makeFinishImage(trimmed, 328, 628), 328, 628));

console.log("Generated icon.ico, Linux PNG set, splash, and Cursor-style wizard bitmaps");

function makeCanvas(width, height, fill = [11, 11, 11, 255]) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) << 2;
      png.data[i] = fill[0];
      png.data[i + 1] = fill[1];
      png.data[i + 2] = fill[2];
      png.data[i + 3] = fill[3] ?? 255;
    }
  }
  return png;
}

function isMarkPixel(png, x, y, threshold = 28) {
  const i = (png.width * y + x) << 2;
  const a = png.data[i + 3];
  if (a < 16) return false;
  return png.data[i] > threshold || png.data[i + 1] > threshold || png.data[i + 2] > threshold;
}

function trimPadding(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (!isMarkPixel(png, x, y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return png;
  const pad = 4;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(png.width - 1, maxX + pad);
  maxY = Math.min(png.height - 1, maxY + pad);
  const out = new PNG({ width: maxX - minX + 1, height: maxY - minY + 1 });
  PNG.bitblt(png, out, minX, minY, out.width, out.height, 0, 0);
  return out;
}

function pixel(png, x, y) {
  const i = (png.width * y + x) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sample(png, x, y) {
  const sx = Math.max(0, Math.min(png.width - 1, x));
  const sy = Math.max(0, Math.min(png.height - 1, y));
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(png.width - 1, x0 + 1);
  const y1 = Math.min(png.height - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;
  const p00 = pixel(png, x0, y0);
  const p10 = pixel(png, x1, y0);
  const p01 = pixel(png, x0, y1);
  const p11 = pixel(png, x1, y1);
  return [
    lerp(lerp(p00[0], p10[0], tx), lerp(p01[0], p11[0], tx), ty),
    lerp(lerp(p00[1], p10[1], tx), lerp(p01[1], p11[1], tx), ty),
    lerp(lerp(p00[2], p10[2], tx), lerp(p01[2], p11[2], tx), ty),
    lerp(lerp(p00[3], p10[3], tx), lerp(p01[3], p11[3], tx), ty),
  ];
}

function scalePng(png, width, height) {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const sy = ((y + 0.5) * png.height) / height - 0.5;
    for (let x = 0; x < width; x++) {
      const sx = ((x + 0.5) * png.width) / width - 0.5;
      const [r, g, b, a] = sample(png, sx, sy);
      const i = (width * y + x) << 2;
      out.data[i] = Math.round(r);
      out.data[i + 1] = Math.round(g);
      out.data[i + 2] = Math.round(b);
      out.data[i + 3] = Math.round(a);
    }
  }
  return out;
}

function sdRoundBox(px, py, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(px - cx) - (halfW - radius);
  const dy = Math.abs(py - cy) - (halfH - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

function blitContain(srcPng, destPng, x, y, w, h) {
  const scale = Math.min(w / srcPng.width, h / srcPng.height);
  const dw = Math.max(1, srcPng.width * scale);
  const dh = Math.max(1, srcPng.height * scale);
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  const x0 = Math.max(0, Math.floor(dx));
  const y0 = Math.max(0, Math.floor(dy));
  const x1 = Math.min(destPng.width, Math.ceil(dx + dw));
  const y1 = Math.min(destPng.height, Math.ceil(dy + dh));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const sx = (px + 0.5 - dx) / scale - 0.5;
      const sy = (py + 0.5 - dy) / scale - 0.5;
      if (sx < -0.5 || sy < -0.5 || sx > srcPng.width - 0.5 || sy > srcPng.height - 0.5) continue;
      const [r, g, b, a] = sample(srcPng, sx, sy);
      const alpha = a / 255;
      const di = (destPng.width * py + px) << 2;
      destPng.data[di] = Math.round(r * alpha + destPng.data[di] * (1 - alpha));
      destPng.data[di + 1] = Math.round(g * alpha + destPng.data[di + 1] * (1 - alpha));
      destPng.data[di + 2] = Math.round(b * alpha + destPng.data[di + 2] * (1 - alpha));
    }
  }
}

function makeSquircle(logo, size, { margin = 0, radius = 0.22, outside = "transparent", logoInset = 0.14 }) {
  const outsideRgba = outside === "transparent" ? [0, 0, 0, 0] : [...outside, 255];
  const canvas = makeCanvas(size, size, outsideRgba);
  const inner = size - margin * 2;
  const cx = size / 2;
  const cy = size / 2;
  const half = inner / 2;
  const rad = inner * radius;
  const fill = [11, 11, 11];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = sdRoundBox(x + 0.5, y + 0.5, cx, cy, half, half, rad);
      const cover = Math.max(0, Math.min(1, 0.55 - d));
      if (cover <= 0) continue;
      const i = (size * y + x) << 2;
      const [or, og, ob, oa] = [canvas.data[i], canvas.data[i + 1], canvas.data[i + 2], canvas.data[i + 3]];
      canvas.data[i] = Math.round(fill[0] * cover + or * (1 - cover));
      canvas.data[i + 1] = Math.round(fill[1] * cover + og * (1 - cover));
      canvas.data[i + 2] = Math.round(fill[2] * cover + ob * (1 - cover));
      canvas.data[i + 3] = Math.round(255 * cover + oa * (1 - cover));
    }
  }
  const pad = margin + inner * logoInset;
  blitContain(logo, canvas, pad, pad, size - pad * 2, size - pad * 2);
  return canvas;
}

function makeWizardSmall(logo, size) {
  const canvas = makeCanvas(size, size, [255, 255, 255, 255]);
  const iconSize = Math.floor(size * 0.68);
  const icon = makeSquircle(logo, iconSize, {
    margin: 0,
    radius: 0.22,
    outside: [255, 255, 255],
    logoInset: 0.16,
  });
  const dx = Math.max(2, Math.floor(size * 0.04));
  const dy = Math.max(2, Math.floor(size * 0.04));
  PNG.bitblt(icon, canvas, 0, 0, iconSize, iconSize, dx, dy);
  return canvas;
}

function makeFinishImage(logo, width, height) {
  const canvas = makeCanvas(width, height, [255, 255, 255, 255]);
  const iconSize = Math.floor(Math.min(width * 0.7, height * 0.38));
  const icon = makeSquircle(logo, iconSize, {
    margin: 0,
    radius: 0.22,
    outside: [255, 255, 255],
    logoInset: 0.16,
  });
  const dx = Math.max(10, Math.floor(width * 0.06));
  const dy = Math.floor(height * 0.14);
  PNG.bitblt(icon, canvas, 0, 0, iconSize, iconSize, dx, dy);
  return canvas;
}

function pngToBmp(png, width, height) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const sy = ((y + 0.5) * png.height) / height - 0.5;
    for (let x = 0; x < width; x++) {
      const sx = ((x + 0.5) * png.width) / width - 0.5;
      const [r, g, b, a] = sample(png, sx, sy);
      const alpha = a / 255;
      const di = (y * width + x) * 3;
      pixels[di] = Math.round(r * alpha + 255 * (1 - alpha));
      pixels[di + 1] = Math.round(g * alpha + 255 * (1 - alpha));
      pixels[di + 2] = Math.round(b * alpha + 255 * (1 - alpha));
    }
  }
  return { width, height, pixels };
}

function writeBmp24(file, { width, height, pixels }) {
  const rowSize = Math.floor((width * 3 + 3) / 4) * 4;
  const pixelSize = rowSize * height;
  const headerSize = 54;
  const buf = Buffer.alloc(headerSize + pixelSize);
  buf.write("BM", 0);
  buf.writeUInt32LE(headerSize + pixelSize, 2);
  buf.writeUInt32LE(headerSize, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelSize, 34);
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const si = (srcY * width + x) * 3;
      const di = headerSize + y * rowSize + x * 3;
      buf[di] = pixels[si + 2];
      buf[di + 1] = pixels[si + 1];
      buf[di + 2] = pixels[si];
    }
  }
  fs.writeFileSync(file, buf);
}
