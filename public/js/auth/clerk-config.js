/**
 * Clerk Authentication Configuration
 */

import { errorHandler } from '../utilities/errors/error-handler.js';
import { EVENTS } from '../core/constants.js';
import { debug, DEBUG_CATEGORIES } from '../utilities/debug.js';
import { TIMING } from '../core/timing-constants.js';
import { environmentConfig } from '../config/environment.js';

class ClerkAuthManager {
  constructor() {
    this.user = null;
    this.isLoaded = false;
    this.isSignedIn = false;
    this.initPromise = null;
    
    // NEW: Session caching for performance optimization
    this.sessionCache = new Map();
    this.tokenCache = new Map();
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize Clerk and wait for it to be ready
   */
  async init() {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise(async (resolve, reject) => {
      // Configuration is now loaded in index.html before Clerk script loads
      let attempts = 0;
      const maxAttempts = TIMING.MAX_CLERK_INIT_ATTEMPTS;
      
      // Wait for Clerk to be available and session to be loaded
      const checkClerk = () => {
        attempts++;
        
        if (window.Clerk) {
          const session = window.Clerk.session;
          const user = window.Clerk.user;
          
          // Log initialization attempts in debug mode
          if (attempts === 1 || attempts % 5 === 0) {
            debug.log(DEBUG_CATEGORIES.AUTH, `Clerk init attempt ${attempts}: session=${session !== undefined ? 'loaded' : 'loading'}, user=${user ? user.id : 'null'}`);
          }
          
          // Check if session has loaded (undefined = still loading, null = not signed in, object = signed in)
          if (session !== undefined) {
            // Session has loaded (either null or an object)            
            this.user = user;
            this.isSignedIn = !!user && !!session;
            
            debug.log(DEBUG_CATEGORIES.AUTH, `Clerk session loaded: isSignedIn=${this.isSignedIn}, userId=${user ? user.id : 'null'}, attempts=${attempts}`);
            
            // Set up authentication state change listener for future changes
            window.Clerk.addListener(({ user }) => {
              const wasSignedIn = this.isSignedIn;
              this.user = user;
              this.isSignedIn = !!user;
              
              // Notify if auth state changed (not for initial state)
              if (wasSignedIn !== this.isSignedIn) {
                this.notifyAuthStateChange();
              }
            });
            
            this.isLoaded = true;
            resolve();
          } else if (attempts >= maxAttempts) {
            // Timeout - preserve timeout information
            debug.warn(DEBUG_CATEGORIES.AUTH, `Clerk init timeout after ${attempts} attempts`);
            
            // Set safe defaults but preserve timeout information
            this.user = null;
            this.isSignedIn = false;
            this.isLoaded = true;
            this.initTimedOut = true;
            
            resolve(); // Continue but mark that timeout occurred
          } else {
            // Session still loading (undefined), check again
            setTimeout(checkClerk, TIMING.CLERK_POLL_INTERVAL);
          }
        } else if (attempts >= maxAttempts) {
          // Clerk not available after timeout
          reject(new Error('Clerk failed to load'));
        } else {
          // Keep waiting for Clerk to be available
          setTimeout(checkClerk, TIMING.CLERK_POLL_INTERVAL);
        }
      };
      
      checkClerk();
    });
    
    return this.initPromise;
  }

  /**
   * Get current user information
   */
  getCurrentUser() {
    return this.user;
  }

  /**
   * Get current user ID
   */
  getUserId() {
    return this.user?.id || null;
  }

  /**
   * Check if user is signed in
   */
  isUserSignedIn() {
    return this.isSignedIn;
  }

  /**
   * Sign in with passkey
   */
  async signIn() {
    if (!this.isLoaded) await this.init();
    
    try {
      await window.Clerk.openSignIn();
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'ClerkAuth',
        method: 'signIn'
      });
      throw error;
    }
  }

  /**
   * Sign out (updated with cache clearing)
   */
  async signOut() {
    if (!this.isLoaded) await this.init();
    
    try {
      // Clear cached session data
      this.clearCache();
      
      await window.Clerk.signOut();
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'ClerkAuth',
        method: 'signOut'
      });
      throw error;
    }
  }

  /**
   * Open user profile
   */
  async openUserProfile() {
    if (!this.isLoaded) await this.init();
    
    try {
      await window.Clerk.openUserProfile();
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'ClerkAuth',
        method: 'openUserProfile'
      });
      throw error;
    }
  }

  /**
   * Check current authentication state and update internal state
   */
  async checkAuthState() {
    try {
      if (!this.isLoaded) {
        await this.init();
      }
      
      if (window.Clerk) {
        const session = await window.Clerk.session;
        const user = window.Clerk.user;
        
        const wasSignedIn = this.isSignedIn;
        this.isSignedIn = !!session && !!user;
        this.user = user;
        
        // Notify if auth state changed
        if (wasSignedIn !== this.isSignedIn) {
          this.notifyAuthStateChange();
        }
      }
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'ClerkAuth',
        method: 'checkAuthState',
        fallback: 'anonymous'
      });
      
      // Dispatch auth error event
      window.dispatchEvent(new CustomEvent(EVENTS.AUTH_ERROR, {
        detail: { error, component: 'ClerkAuth' }
      }));
    }
  }

  /**
   * Get Firebase custom token from Clerk session (NEW: Performance optimization with caching)
   * Eliminates the need for dual authentication and caches tokens for performance
   */
  async getFirebaseToken() {
    if (!this.isLoaded) await this.init();
    
    if (!this.isSignedIn || !window.Clerk.session) {
      return null;
    }
    
    // Check token cache first
    const userId = this.getUserId();
    const cacheKey = `firebase_token_${userId}`;
    const cachedToken = this.getCachedValue(cacheKey);
    
    if (cachedToken) {
      debug.log(DEBUG_CATEGORIES.AUTH, 'Using cached Firebase token');
      return cachedToken;
    }
    
    try {
      // Try Firebase custom token template first
      const customToken = await window.Clerk.session.getToken({ 
        template: 'firebase' // Requires JWT template configuration in Clerk Dashboard
      });
      
      if (customToken) {
        // Cache the custom token for future use
        this.setCachedValue(cacheKey, customToken);
        debug.log(DEBUG_CATEGORIES.AUTH, 'Generated and cached Firebase custom token from Clerk session');
        return customToken;
      }
      
    } catch (error) {
      // Expected if JWT template not configured - fallback to standard JWT
      if (error.message?.includes('404') || error.status === 404) {
        debug.log(DEBUG_CATEGORIES.AUTH, 'Firebase JWT template not configured, using standard JWT');
      } else {
        debug.warn(DEBUG_CATEGORIES.AUTH, 'Custom Firebase token failed, using standard JWT as fallback:', error.message);
      }
      
      try {
        // Use standard Clerk JWT as fallback
        const standardToken = await window.Clerk.session.getToken();
        if (standardToken) {
          // Cache standard token
          this.setCachedValue(`jwt_token_${userId}`, standardToken);
          debug.log(DEBUG_CATEGORIES.AUTH, 'Generated and cached standard Clerk JWT');
          return standardToken;
        }
      } catch (fallbackError) {
        debug.error(DEBUG_CATEGORIES.AUTH, 'Both custom token and standard JWT failed:', fallbackError);
        return null;
      }
    }
    
    return null;
  }

  /**
   * Cache management methods for performance optimization
   */
  setCachedValue(key, value) {
    this.sessionCache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  getCachedValue(key) {
    const cached = this.sessionCache.get(key);
    if (!cached) return null;
    
    // Check if cache is still valid
    if (Date.now() - cached.timestamp > this.CACHE_DURATION) {
      this.sessionCache.delete(key);
      return null;
    }
    
    return cached.value;
  }

  /**
   * Clear all cached session data (called on sign out)
   */
  clearCache() {
    this.sessionCache.clear();
    this.tokenCache.clear();
    debug.log(DEBUG_CATEGORIES.AUTH, 'Cleared authentication cache');
  }

  /**
   * Get user ID optimized for Firebase operations
   * Uses Clerk user ID directly instead of Firebase user mapping
   */
  getFirebaseUserId() {
    return this.getUserId(); // Direct mapping, no Firebase user needed
  }

  /**
   * Notify listeners of auth state changes
   */
  notifyAuthStateChange() {
    window.dispatchEvent(new CustomEvent(EVENTS.AUTH_STATE_CHANGED, {
      detail: { 
        user: this.user, 
        isSignedIn: this.isSignedIn,
        userId: this.getUserId(),
        userEmail: this.user?.primaryEmailAddress?.emailAddress || null
      }
    }));
  }
}

// Create and export singleton instance
export const clerkAuth = new ClerkAuthManager();