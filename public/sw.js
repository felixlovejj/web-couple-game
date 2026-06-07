const CACHE_NAME = 'scratch-off-v3'
const BASE = '/scratch-off'

const PRECACHE_URLS = [
  BASE + '/',
  BASE + '/manifest.json',
  BASE + '/icon-192.svg',
  BASE + '/icon-512.svg',
  BASE + '/icon-192-maskable.svg',
  BASE + '/icon-512-maskable.svg',
  BASE + '/vite.svg',
]

// Install: pre-cache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS)
    }).then(() => self.skipWaiting())
  )
})

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch: cache-first for assets, network-only for API, network-first for HTML
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle requests within our scope
  if (!url.pathname.startsWith(BASE + '/') && url.pathname !== BASE + '/') {
    return
  }

  // API calls: network only
  if (url.pathname.startsWith('/api/')) {
    return
  }

  // Static assets (JS, CSS, images, SVG): cache-first
  if (/\.(js|css|png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        }).catch(() => cached)
        return cached || fetchPromise
      })
    )
    return
  }

  // HTML / root: network-first with cache fallback
  if (url.pathname === BASE + '/' || url.pathname === BASE + '/index.html') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      }).catch(() => caches.match(request))
    )
    return
  }

  // Everything else within scope: cache-first
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  )
})
