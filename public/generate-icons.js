/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// Generate simple icons as PNGs using canvas
const ICON_SIZES = [192, 512];

async function generateIcons() {
  const canvas = new OffscreenCanvas(512, 512);
  const ctx = canvas.getContext('2d')!;

  for (const size of ICON_SIZES) {
    const iconCanvas = new OffscreenCanvas(size, size);
    const iconCtx = iconCanvas.getContext('2d')!;

    // Background - navy color
    iconCtx.fillStyle = '#1b3560';
    iconCtx.beginPath();
    iconCtx.roundRect(0, 0, size, size, size * 0.2);
    iconCtx.fill();

    // Accent circle
    iconCtx.fillStyle = '#d4a017';
    iconCtx.beginPath();
    iconCtx.arc(size / 2, size / 2, size * 0.25, 0, Math.PI * 2);
    iconCtx.fill();

    // "I" letter
    iconCtx.fillStyle = '#ffffff';
    iconCtx.font = `bold ${size * 0.4}px Bricolage Grotesque, sans-serif`;
    iconCtx.textAlign = 'center';
    iconCtx.textBaseline = 'middle';
    iconCtx.fillText('I', size / 2, size / 2);

    const blob = await iconCanvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await blob.arrayBuffer();

    const cache = await caches.open('icons-v1');
    const url = `/icons/icon-${size}.png`;
    const response = new Response(arrayBuffer, {
      headers: { 'Content-Type': 'image/png' }
    });
    await cache.put(url, response);
  }
}

self.addEventListener('install', () => {
  generateIcons();
  self.skipWaiting();
});
