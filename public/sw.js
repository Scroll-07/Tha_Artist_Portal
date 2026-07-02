/*
 * Copyright © 2026 BOLAJI B ADEEKO LLC
 * Unauthorized copying prohibited
 */

const CACHE = 'tap-v15';

// Only cache static assets — never HTML or API
const FILES = [
  '/app.js',
  '/style.css',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json'
];

// ── Install ───────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(FILES))
  );
  self.skipWaiting();
});

// ── Activate — clear old caches ───────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch — never cache HTML or API ──────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (
    e.request.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    url.pathname.startsWith('/api/')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// ── Push notification received ────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Tha Artist Portal', body: 'You have a new notification.', url: '/dashboard.html' };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch (_) {}

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url },
      actions: [
        { action: 'view',    title: 'View' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

// ── Notification click — open the app ────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;

  const targetUrl = e.notification.data?.url || '/dashboard.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If TAP is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
