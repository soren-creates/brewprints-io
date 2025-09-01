/**
 * Service Worker for Brewprints Performance Optimization
 * Provides aggressive caching for static assets and API responses
 */

// Dynamic cache versioning - Build process should replace CACHE_VERSION
const CACHE_VERSION = 'v' + (window.BUILD_TIMESTAMP || Date.now());
const CACHE_NAME = `brewprints-${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `brewprints-static-${CACHE_VERSION}`;
const API_CACHE_NAME = `brewprints-api-${CACHE_VERSION}`;

// Critical assets to cache immediately
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/js/core/main.js',
  '/js/auth/clerk-config.js',
  '/js/core/timing-constants.js',
  '/js/storage/storage-manager.js',
  '/js/ui/components/navigation-manager.js',
  '/js/ui/components/header-manager.js',
  '/js/ui/pages/my-recipes.js',
  '/js/utilities/debug.js',
  '/js/utilities/errors/error-handler.js',
  '/styles/base.css',
  '/styles/utilities.css',
  '/favicon/favicon.svg',
  '/favicon/favicon.ico'
];

// Lazy-loaded modules (cache when loaded)
const LAZY_MODULES = [
  '/js/parsers/parser-manager.js',
  '/js/core/recipe-validator.js',
  '/js/core/calculation-orchestrator.js',
  '/js/core/formatter.js',
  '/js/ui/recipe-renderer.js',
  '/js/ui/components/section-manager.js',
  '/js/ui/components/print-controls.js',
  '/js/ui/pages/data-preview.js',
  '/js/ui/components/debug-toggle.js',
  '/js/utilities/performance/sharing-performance.js'
];

// CSS files to cache
const CSS_ASSETS = [
  '/styles/components.css',
  '/styles/my-recipes.css',
  '/styles/recipe.css',
  '/styles/print.css'
];

/**
 * Install event - Cache critical assets immediately
 */
self.addEventListener('install', event => {
  console.log('Service Worker: Installing');
  
  event.waitUntil(
    Promise.all([
      // Cache critical assets
      caches.open(STATIC_CACHE_NAME).then(cache => {
        return cache.addAll(CRITICAL_ASSETS);
      }),
      // Cache CSS assets
      caches.open(STATIC_CACHE_NAME).then(cache => {
        return cache.addAll(CSS_ASSETS);
      })
    ]).then(() => {
      console.log('Service Worker: Critical assets cached');
      return self.skipWaiting(); // Activate immediately
    })
  );
});

/**
 * Activate event - Enhanced cache cleanup with versioning
 */
self.addEventListener('activate', event => {
  console.log('Service Worker: Activating');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const currentCaches = [STATIC_CACHE_NAME, API_CACHE_NAME, CACHE_NAME];
      
      return Promise.all(
        cacheNames
          .filter(cacheName => 
            // Delete brewprints caches that don't match current version
            cacheName.startsWith('brewprints-') && 
            !currentCaches.includes(cacheName)
          )
          .map(cacheName => {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      console.log('Service Worker: Activated with cache version:', CACHE_VERSION);
      return self.clients.claim(); // Take control of all pages immediately
    })
  );
});

/**
 * Fetch event - Implement caching strategies
 */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Only handle HTTP/HTTPS requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Different strategies for different types of requests
  if (isCriticalAsset(request)) {
    event.respondWith(cacheFirstStrategy(request));
  } else if (isLazyModule(request)) {
    event.respondWith(cacheFirstStrategy(request));
  } else if (isCSSAsset(request)) {
    event.respondWith(cacheFirstStrategy(request));
  } else if (isFirebaseAPI(request)) {
    event.respondWith(networkFirstWithCache(request));
  } else if (isClerkAPI(request)) {
    event.respondWith(networkOnlyStrategy(request));
  } else if (isStaticAsset(request)) {
    event.respondWith(cacheFirstStrategy(request));
  } else {
    // Default: Network first for dynamic content
    event.respondWith(networkFirstStrategy(request));
  }
});

/**
 * Cache-first strategy: Check cache first, fallback to network
 */
async function cacheFirstStrategy(request) {
  try {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      // Update cache in background (stale-while-revalidate)
      updateCacheInBackground(request);
      return cachedResponse;
    }
    
    // Not in cache, fetch from network and cache
    const response = await fetch(request);
    
    if (response.status === 200) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
    
  } catch (error) {
    console.warn('Service Worker: Cache-first failed:', error);
    return new Response('Service Unavailable', { status: 503 });
  }
}

/**
 * Network-first strategy: Try network, fallback to cache
 */
async function networkFirstStrategy(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response('Offline', { status: 503 });
  }
}

/**
 * Network-first with caching for API responses
 */
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    
    if (response.status === 200) {
      // Cache successful API responses
      const cache = await caches.open(API_CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
    
  } catch (error) {
    // Fallback to cached API response
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('Service Worker: Using cached API response');
      return cachedResponse;
    }
    
    throw error;
  }
}

/**
 * Network-only strategy: Always fetch from network (for authentication)
 */
async function networkOnlyStrategy(request) {
  return fetch(request);
}

/**
 * Update cache in background without blocking response
 */
function updateCacheInBackground(request) {
  // Don't await this - run in background
  setTimeout(async () => {
    try {
      const response = await fetch(request);
      if (response.status === 200) {
        const cache = await caches.open(STATIC_CACHE_NAME);
        cache.put(request, response.clone());
      }
    } catch (error) {
      // Silent fail - background update
    }
  }, 100);
}

/**
 * Helper functions to categorize requests
 */
function isCriticalAsset(request) {
  return CRITICAL_ASSETS.some(asset => request.url.endsWith(asset));
}

function isLazyModule(request) {
  return LAZY_MODULES.some(module => request.url.includes(module));
}

function isCSSAsset(request) {
  return request.url.includes('.css') || CSS_ASSETS.some(asset => request.url.includes(asset));
}

function isFirebaseAPI(request) {
  return request.url.includes('firebaseio.com') || 
         request.url.includes('googleapis.com');
}

function isClerkAPI(request) {
  return request.url.includes('clerk.accounts.dev');
}

function isStaticAsset(request) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf)$/i.test(request.url);
}

/**
 * Background sync for offline support (future enhancement)
 */
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Future: Sync offline actions when connection restored
  console.log('Service Worker: Background sync triggered');
}

/**
 * Push notifications (future enhancement)
 */
self.addEventListener('push', event => {
  // Future: Handle push notifications
  console.log('Service Worker: Push notification received');
});

console.log('Service Worker: Loaded and ready');