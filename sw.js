const CACHE_NAME = 'location-tracker-v2';
const TILE_CACHE_NAME = 'map-tiles-v1';
const urlsToCache = [
    './',
    './index.html',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Maximum number of tiles to cache (to prevent unlimited storage)
const MAX_TILE_CACHE = 500;

self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching app shell');
                return cache.addAll(urlsToCache);
            })
            .catch(err => console.error('Cache installation failed:', err))
    );
});

self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== TILE_CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Check if it's a tile request
    const isTileRequest =
        url.hostname.includes('tile.openstreetmap.org') ||
        url.hostname.includes('arcgisonline.com') ||
        url.hostname.includes('opentopomap.org');

    if (isTileRequest) {
        // Tile caching strategy: Cache first, then network
        event.respondWith(
            caches.open(TILE_CACHE_NAME).then(cache => {
                return cache.match(event.request).then(response => {
                    if (response) {
                        // Return cached tile
                        return response;
                    }

                    // Fetch from network and cache
                    return fetch(event.request).then(networkResponse => {
                        // Only cache successful responses
                        if (networkResponse && networkResponse.ok) {
                            // Clone the response before caching
                            cache.put(event.request, networkResponse.clone());

                            // Limit cache size
                            cache.keys().then(keys => {
                                if (keys.length > MAX_TILE_CACHE) {
                                    // Remove oldest entries (FIFO)
                                    const toDelete = keys.slice(0, keys.length - MAX_TILE_CACHE);
                                    toDelete.forEach(key => cache.delete(key));
                                }
                            });
                        }
                        return networkResponse;
                    }).catch(() => {
                        // Network failed, return nothing (map will show gray tiles)
                        return new Response('', { status: 404, statusText: 'Tile not found' });
                    });
                });
            })
        );
    } else {
        // Regular caching strategy: Network first, then cache
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Cache successful responses
                    if (response && response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Network failed, try cache
                    return caches.match(event.request);
                })
        );
    }
});
