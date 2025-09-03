/**
 * Timing Constants
 * Centralized timing values used throughout the application
 */

export const TIMING = {
  // Clerk authentication polling
  CLERK_POLL_INTERVAL: 50,           // 50ms between Clerk session checks
  
  // Firebase initialization delays
  FIREBASE_INIT_DELAY: 50,           // Minimal delay to prevent race conditions
  
  // DOM readiness delays
  DOM_READY_DELAY: 50,               // 50ms delay for DOM transition
  
  // Image loading timeouts
  IMAGE_LOAD_TIMEOUT: 5000,          // 5s timeout for recipe image loading
  
  // Authentication caching
  AUTH_CACHE_DURATION: 2 * 60 * 1000, // 2 minutes auth cache
  
  // Recipe caching
  RECIPE_CACHE_DURATION: 5 * 60 * 1000, // 5 minutes recipe cache
  
  // Connection timeouts
  FIREBASE_CONNECTION_TIMEOUT: 3000,  // 3s Firebase connection timeout
  
  // Max initialization attempts
  MAX_CLERK_INIT_ATTEMPTS: 100,     // 100 attempts (5s total at 50ms intervals)
  
  // Toast and UI durations
  TOAST_DURATION: 5000,             // 5s toast auto-dismiss duration
  SCROLL_DELAY: 1                   // 1ms delay for scroll behavior
};

/**
 * Performance Budget Configuration
 * Defines performance thresholds and limits for monitoring
 */
export const PERFORMANCE_BUDGET = {
  // Bundle size limits (in bytes)
  initialJSBundle: 150000,      // 150KB max initial JavaScript
  criticalPathCSS: 50000,       // 50KB max critical path CSS
  totalPageWeight: 2000000,     // 2MB max total page weight
  
  // Timing budgets (in milliseconds)
  domContentLoaded: 2000,       // 2s max for DOM ready
  loadEvent: 3000,              // 3s max for full page load
  firstContentfulPaint: 1500,   // 1.5s max for FCP
  largestContentfulPaint: 2500, // 2.5s max for LCP
  
  // Runtime budgets
  maxLazyModules: 10,           // Maximum lazy-loaded modules
  maxCacheSize: 50,             // Maximum cached recipes
  maxInflightRequests: 5        // Maximum concurrent requests
};