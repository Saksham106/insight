#!/usr/bin/env node
/**
 * Generates the PWA icon set as real PNGs from the brand mark:
 *   - public/icons/icon-192.png       (manifest "any")
 *   - public/icons/icon-512.png       (manifest "any")
 *   - public/icons/icon-maskable-512.png (manifest "maskable", safe-zone padded)
 *   - public/icons/apple-touch-icon.png  (180px, iOS home screen)
 *
 * Run: node scripts/generate-icons.js
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

// Brand mark as SVG so sharp can rasterize at any size.
function iconSvg({ padding = 0 }) {
  // Content lives in the middle 70% for maskable icons (safe zone).
  const inner = 100 - padding * 2;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1b3560"/>
      <stop offset="100%" stop-color="#0f2347"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="${padding > 0 ? 0 : 18}" fill="url(#bg)"/>
  <g transform="translate(${padding} ${padding}) scale(${inner / 100})">
    <circle cx="50" cy="50" r="26" fill="#d4a017"/>
    <text x="50" y="50" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      font-size="40" font-weight="700" fill="#ffffff" text-anchor="middle"
      dominant-baseline="central">I</text>
  </g>
</svg>`);
}

const outDir = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, padding: 0 },
  { file: "icon-512.png", size: 512, padding: 0 },
  { file: "icon-maskable-512.png", size: 512, padding: 15 },
  { file: "apple-touch-icon.png", size: 180, padding: 0 },
];

(async () => {
  for (const { file, size, padding } of targets) {
    await sharp(iconSvg({ padding }))
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, file));
    console.log(`Created public/icons/${file} (${size}x${size})`);
  }
})();
