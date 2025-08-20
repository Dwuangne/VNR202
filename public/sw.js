/**
 * Service Worker for PDF Audio Storybook
 * Provides offline caching for static assets
 */

const CACHE_NAME = 'pdf-storybook-v1.0.0';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// URLs to cache on install
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './vendor/pdfjs/pdf.min.js',
    './vendor/pdfjs/pdf.worker.min.js',
    './assets/config.json'
];

// Install event - cache static assets
self.addEventListener('install', event => {
    console.log('[SW] Installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // Delete old caches
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Activated');
                return self.clients.claim();
            })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    const requestURL = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip chrome-extension requests
    if (requestURL.protocol === 'chrome-extension:') {
        return;
    }
    
    event.respondWith(
        handleFetch(event.request)
    );
});

async function handleFetch(request) {
    const requestURL = new URL(request.url);
    
    try {
        // For static assets, try cache first
        if (isStaticAsset(requestURL.pathname)) {
            return await cacheFirst(request, STATIC_CACHE);
        }
        
        // For PDF and audio files, try cache first but update in background
        if (isMediaFile(requestURL.pathname)) {
            return await staleWhileRevalidate(request, DYNAMIC_CACHE);
        }
        
        // For other requests, network first
        return await networkFirst(request, DYNAMIC_CACHE);
        
    } catch (error) {
        console.error('[SW] Fetch failed:', error);
        
        // Try to return from any cache as fallback
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('./index.html');
        }
        
        throw error;
    }
}

// Cache first strategy - good for static assets
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        console.log('[SW] Serving from cache:', request.url);
        return cachedResponse;
    }
    
    console.log('[SW] Fetching and caching:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
}

// Network first strategy - good for dynamic content
async function networkFirst(request, cacheName) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        throw error;
    }
}

// Stale while revalidate - good for media files
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    // Fetch in background
    const fetchPromise = fetch(request)
        .then(networkResponse => {
            if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        })
        .catch(error => {
            console.log('[SW] Background fetch failed:', error);
        });
    
    // Return cached version immediately if available
    if (cachedResponse) {
        console.log('[SW] Serving stale content:', request.url);
        return cachedResponse;
    }
    
    // If no cache, wait for network
    console.log('[SW] No cache, waiting for network:', request.url);
    return fetchPromise;
}

// Helper functions
function isStaticAsset(pathname) {
    return pathname.endsWith('.css') ||
           pathname.endsWith('.js') ||
           pathname.endsWith('.html') ||
           pathname.endsWith('.json') ||
           pathname === '/';
}

function isMediaFile(pathname) {
    return pathname.includes('/assets/pdf/') ||
           pathname.includes('/assets/audio/') ||
           pathname.endsWith('.pdf') ||
           pathname.endsWith('.mp3') ||
           pathname.endsWith('.wav') ||
           pathname.endsWith('.ogg') ||
           pathname.endsWith('.m4a');
}

// Message handling for cache management
self.addEventListener('message', event => {
    const { action, data } = event.data;
    
    switch (action) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'GET_CACHE_INFO':
            getCacheInfo().then(info => {
                event.ports[0].postMessage(info);
            });
            break;
            
        case 'CLEAR_CACHE':
            clearCache(data.cacheName).then(success => {
                event.ports[0].postMessage({ success });
            });
            break;
            
        case 'PREFETCH_ASSETS':
            prefetchAssets(data.urls).then(result => {
                event.ports[0].postMessage(result);
            });
            break;
    }
});

// Get cache information
async function getCacheInfo() {
    const cacheNames = await caches.keys();
    const info = {};
    
    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        info[cacheName] = {
            count: keys.length,
            urls: keys.map(key => key.url)
        };
    }
    
    return info;
}

// Clear specific cache
async function clearCache(cacheName) {
    try {
        const success = await caches.delete(cacheName);
        console.log('[SW] Cache cleared:', cacheName, success);
        return success;
    } catch (error) {
        console.error('[SW] Failed to clear cache:', error);
        return false;
    }
}

// Prefetch assets
async function prefetchAssets(urls) {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const promises = urls.map(url => {
            return fetch(url)
                .then(response => {
                    if (response.ok) {
                        return cache.put(url, response.clone());
                    }
                })
                .catch(error => {
                    console.log('[SW] Prefetch failed for:', url, error);
                });
        });
        
        await Promise.all(promises);
        return { success: true, count: urls.length };
    } catch (error) {
        console.error('[SW] Prefetch batch failed:', error);
        return { success: false, error: error.message };
    }
}

// Background sync for offline analytics
self.addEventListener('sync', event => {
    if (event.tag === 'analytics-sync') {
        event.waitUntil(syncAnalytics());
    }
});

async function syncAnalytics() {
    // Placeholder for offline analytics sync
    console.log('[SW] Background sync triggered');
}

// Push notifications (if needed)
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        
        const options = {
            body: data.body,
            icon: './icon-192.png',
            badge: './icon-72.png',
            vibrate: [200, 100, 200],
            actions: [
                {
                    action: 'open',
                    title: 'Mở sách',
                    icon: './icon-72.png'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

// Notification click handling
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow('./')
        );
    }
});

console.log('[SW] Service Worker loaded');
