// sw.js — service worker for the installable (PWA) build.
//
// Two jobs only:
//   1. Make the app installable (a browser will not offer "add to home screen"
//      without a service worker that handles fetch).
//   2. Keep the app openable when the network is flaky — the *shell* only.
//
// It deliberately does NOT cache data.  Firebase Realtime Database is the source
// of truth and must always be live, so every Firebase/Google host is passed
// straight through, untouched.  Same-origin files are network-first (so a deploy
// lands on the very next load) with the cache purely as an offline fallback.

const VERSION = 'v1';
const SHELL_CACHE = `bm-shell-${VERSION}`;
const CDN_CACHE = `bm-cdn-${VERSION}`;

// The app shell — everything needed to boot with no network.
const SHELL = [
    './',
    './index.html',
    './style.css',
    './sync-guard.js',
    './schedule.js',
    './tournament.js',
    './known-names.js',
    './player-meta.js',
    './live-score.js',
    './pwa.js',
    './script.js',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/apple-touch-icon.png',
];

// Third-party scripts the page loads. Cached so a cold start offline still works.
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'www.gstatic.com'];

// Never touch these — live data must never be served from a cache.
const LIVE_HOSTS = /(^|\.)(firebaseio\.com|firebasedatabase\.app|googleapis\.com|google-analytics\.com)$/i;

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL_CACHE);
        // addAll is all-or-nothing; cache files individually so one 404 during a
        // partial deploy cannot leave the worker uninstalled.
        await Promise.all(SHELL.map(url =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => { /* skip */ })
        ));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter(k => k.startsWith('bm-') && k !== SHELL_CACHE && k !== CDN_CACHE)
            .map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

// Let the page ask a waiting worker to take over immediately.
self.addEventListener('message', event => {
    if (event.data === 'skip-waiting') self.skipWaiting();
});

async function networkFirst(request) {
    const cache = await caches.open(SHELL_CACHE);
    try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) cache.put(request, fresh.clone());
        return fresh;
    } catch (err) {
        const hit = await cache.match(request);
        if (hit) return hit;
        // A navigation with nothing cached for that exact URL still gets the shell.
        if (request.mode === 'navigate') {
            const shell = await cache.match('./index.html') || await cache.match('./');
            if (shell) return shell;
        }
        throw err;
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CDN_CACHE);
    const hit = await cache.match(request);
    const network = fetch(request)
        .then(res => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
            return res;
        })
        .catch(() => null);
    return hit || network.then(res => {
        if (res) return res;
        throw new Error('offline and not cached');
    });
}

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch { return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (LIVE_HOSTS.test(url.hostname)) return;           // Firebase: always live

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(req));
    } else if (CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(staleWhileRevalidate(req));
    }
});
