/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */

const CACHE = 'tap-v12';

// Only cache static assets -- never cache HTML files
const FILES = [
  '/app.js',
  '/style.css',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
  // Activate immediately without waiting
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Delete all old caches
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never cache HTML files -- always fetch fresh from server
  if (e.request.destination === 'document' ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Never cache API calls
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // For everything else use cache first then network
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});