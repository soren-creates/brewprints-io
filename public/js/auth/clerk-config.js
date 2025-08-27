/**
 * Clerk Authentication Configuration
 */

import { errorHandler } from '../utilities/errors/error-handler.js';
import { EVENTS } from '../core/constants.js';

const CLERK_PUBLISHABLE_KEY = "pk_test_Y2hhbXBpb24tbWluay0yNi5jbGVyay5hY2NvdW50cy5kZXYk";

class ClerkAuthManager {
  constructor() {
    this.user = null;
    this.isLoaded = false;
    this.isSignedIn = false;
    this.initPromise = null;
  }

  /**
   * Initialize Clerk and wait for it to be ready
   */
  async init() {
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = new Promise((resolve, reject) => {
      // Wait for Clerk to be available
      const checkClerk = () => {
        if (window.Clerk) {
          // First, check current authentication state (preserves original timing)
          const currentUser = window.Clerk.user;
          this.user = currentUser;
          this.isSignedIn = !!currentUser;
          
          // Notify of initial state using new event system
          this.notifyAuthStateChange();
          
          // Then set up authentication state change listener
          window.Clerk.addListener(({ user }) => {
            const wasSignedIn = this.isSignedIn;
            this.user = user;
            this.isSignedIn = !!user;
            
            // Notify if auth state changed
            if (wasSignedIn !== this.isSignedIn) {
              this.notifyAuthStateChange();
            }
          });
          
          this.isLoaded = true;
          resolve();
        } else {
          setTimeout(checkClerk, 100);
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
   * Sign out
   */
  async signOut() {
    if (!this.isLoaded) await this.init();
    
    try {
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