#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function createIconSVG(size, text) {
  const fontSize = Math.round(size * 0.4);
  const rx = Math.round(size * 0.15);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="grad${size}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1b3560;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0f2347;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#grad${size})"/>
  <circle cx="${Math.round(size/2)}" cy="${Math.round(size/2)}" r="${Math.round(size * 0.28)}" fill="#d4a017"/>
  <text x="${Math.round(size/2)}" y="${Math.round(size/2)}" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="${fontSize}px" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${text}</text>
</svg>`.trim();
}

const sizes = [192, 512];
const outputDir = path.join(__dirname, 'public', 'icons');

fs.mkdirSync(outputDir, { recursive: true });

for (const size of sizes) {
  fs.writeFileSync(
    path.join(outputDir, `icon-${size}.svg`),
    createIconSVG(size, 'I')
  );
  console.log(`Created icons/icon-${size}.svg`);
}

fs.writeFileSync(
  path.join(outputDir, 'apple-touch-icon.svg'),
  createIconSVG(180, 'I')
);
console.log('Created icons/apple-touch-icon.svg');
