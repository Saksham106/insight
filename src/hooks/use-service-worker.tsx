'use client';

import { useEffect, useRef } from 'react';

export function useServiceWorker() {
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    if (typeof window === 'undefined') return;
    const nav = (window as unknown as { navigator: Navigator & { serviceWorker?: ServiceWorkerContainer } }).navigator;
    if (!nav.serviceWorker) return;

    nav.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('ServiceWorker registered:', registration.scope);
        registered.current = true;

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && nav.serviceWorker?.controller) {
                console.log('New service worker available');
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error('ServiceWorker registration failed:', error);
      });
  }, []);
}
