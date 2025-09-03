/**
 * Storage Manager for Recipe Persistence
 * Handles saving and loading recipes from Firebase
 */

import { loadFirebaseConfig } from '../core/firebase-config.js';
import { errorHandler } from '../utilities/errors/error-handler.js';
import { clerkAuth } from '../auth/clerk-config.js';
import { loadingManager } from '../ui/components/loading-manager.js';
import { EVENTS } from '../core/constants.js';
import { TIMING } from '../core/timing-constants.js';
import { debug, DEBUG_CATEGORIES } from '../utilities/debug.js';
import { shareTokenCache, performanceMonitor } from '../utilities/performance/sharing-performance.js';
import { LucideIcons } from '../ui/components/lucide-icons.js';

class StorageManager {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.initPromise = null;
    
    // Firebase Connection Pool
    this.connectionState = 'unknown';
    this.heartbeatInterval = null;
    this.connectionTestTimeout = 3000; // 3 seconds for connection tests
    this.lastConnectionCheck = 0;
    this.connectionCheckInterval = 30000; // 30 seconds between checks
    
    // Recipe Cache Management - LRU implementation
    this.recipeCache = new Map();
    this.recipeSummaryCache = new Map();
    this.recipeSummaryAccessOrder = new Map(); // Track access order for LRU
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.maxCacheSize = 50; // Maximum recipes to keep in memory
    
    // Request deduplication to prevent concurrent identical requests
    this.inflightRequests = new Map();
    
    // Offline support
    this.offlineQueue = [];
    this.isProcessingQueue = false;
    this.setupOfflineSupport();
    
    // Rate limiting
    this.saveDebounceTimer = null;
    this.saveDebounceDelay = 2000; // 2 seconds default
    this.pendingSave = null;
    this.rateLimitConfig = {
      enabled: true,
      delay: 2000,
      maxRetries: 3
    };
    
    // Testing flags
    this._forceOffline = false;
    this._forceTimeout = false; // Simulate slow/hanging Firebase operations
  }

  /**
   * Initialize Firebase connection
   */
  async init() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initializeFirebase();
    await this.initPromise;
    this.isInitialized = true;
  }

  async _initializeFirebase() {
    try {
      // Check if Firebase is already initialized
      if (!window.firebase) {
        errorHandler.handleError(new Error('Firebase SDK not loaded. Please add Firebase scripts to index.html'), {
          component: 'StorageManager',
          method: '_initializeFirebase',
          fallback: 'local'
        });
        return;
      }

      // Load Firebase configuration and initialize app
      if (!firebase.apps.length) {
        const config = await loadFirebaseConfig();
        firebase.initializeApp(config);
      }

      // Get database reference
      this.db = firebase.database();
      
      // Set up Firebase auth state listener
      firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          // Firebase user authenticated successfully
        } else {
          // Firebase user signed out
          // Clear auth mapping when Firebase session ends
          localStorage.removeItem('auth_mapping');
        }
      });
      
      // Initialize connection monitoring
      this.initializeConnectionPool();
      
      // Firebase initialized successfully
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: '_initializeFirebase'
      });
    }
  }

  /**
   * Clean recipe data for Firebase storage
   * Removes undefined values and converts them to null
   * @param {any} obj - Object to clean
   * @returns {any} - Cleaned object
   */
  cleanForFirebase(obj) {
    if (obj === undefined) return null;
    if (obj === null) return null;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanForFirebase(item));
    }
    
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = this.cleanForFirebase(value);
      // Only include non-undefined values
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
      }
    }
    return cleaned;
  }

  /**
   * Initialize Firebase connection pool
   */
  initializeConnectionPool() {
    if (!this.db) return;
    
    debug.log(DEBUG_CATEGORIES.STORAGE, 'Initializing Firebase connection pool');
    
    // Set up periodic connection health monitoring
    this.heartbeatInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, this.connectionCheckInterval);
    
    // Initial connection check
    this.checkConnectionHealth();
  }

  /**
   * Check Firebase connection health with caching
   */
  async checkConnectionHealth() {
    const now = Date.now();
    
    // Skip check if we recently verified connection
    if (this.connectionState === 'connected' && 
        (now - this.lastConnectionCheck) < this.connectionCheckInterval) {
      debug.log(DEBUG_CATEGORIES.STORAGE, 'Connection recently verified, skipping check');
      return true;
    }
    
    try {
      const connectedRef = this.db.ref('.info/connected');
      const snapshot = await Promise.race([
        connectedRef.once('value'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection check timeout')), 
                   this.connectionTestTimeout))
      ]);
      
      const isConnected = snapshot.val();
      this.connectionState = isConnected ? 'connected' : 'disconnected';
      this.lastConnectionCheck = now;
      
      debug.log(DEBUG_CATEGORIES.STORAGE, `Firebase connection: ${this.connectionState}`);
      
      return isConnected;
    } catch (error) {
      this.connectionState = 'disconnected';
      this.lastConnectionCheck = now;
      debug.warn(DEBUG_CATEGORIES.STORAGE, 'Firebase connection check failed:', error);
      return false;
    }
  }

  /**
   * Connection verification - skips expensive tests when possible
   */
  async ensureConnection() {
    // Fast path: If we recently verified connection, trust it
    if (this.connectionState === 'connected' && 
        (Date.now() - this.lastConnectionCheck) < (this.connectionCheckInterval / 2)) {
      return true;
    }
    
    // Need to verify connection
    return this.checkConnectionHealth();
  }

  /**
   * STREAMING SOLUTION: Fast connection check for streaming performance
   * Reduces timeout from 3s to 1s for reliable speed optimization
   */
  async ensureUltraFastConnection() {
    // Skip expensive connection checks - assume connected if recently verified
    if (this.connectionState === 'connected' && 
        (Date.now() - this.lastConnectionCheck) < 1000) { // 1s cache vs 30s
      return true;
    }
    
    // Fast connection verification with reasonable timeout
    try {
      const connectedRef = this.db.ref('.info/connected');
      const snapshot = await Promise.race([
        connectedRef.once('value'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection verification timeout')), 1000)) // 1s timeout for fast checks
      ]);
      
      const isConnected = snapshot.val();
      this.connectionState = isConnected ? 'connected' : 'disconnected';
      this.lastConnectionCheck = Date.now();
      
      debug.log(DEBUG_CATEGORIES.STORAGE, `Fast Firebase connection check: ${this.connectionState}`);
      return isConnected;
      
    } catch (error) {
      // On timeout, mark as unknown and let normal connection check handle it
      this.connectionState = 'unknown';
      debug.log(DEBUG_CATEGORIES.STORAGE, 'Fast connection check failed, will use fallback verification');
      return false;
    }
  }

  /**
   * Cleanup connection pool resources
   */
  destroyConnectionPool() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      debug.log(DEBUG_CATEGORIES.STORAGE, 'Firebase connection pool destroyed');
    }
  }

  /**
   * Complete cleanup of all StorageManager resources
   * Enhanced memory management and leak prevention
   */
  destroy() {
    debug.log(DEBUG_CATEGORIES.STORAGE, 'StorageManager cleanup starting...');

    // Clear intervals and timers
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    // Clear pending operations
    this.pendingSave = null;

    // Performance monitoring cleanup is handled by the main app destroy method
    // Removed window.brewLogApp access to prevent circular dependency during cleanup

    // Clear caches with proper memory cleanup
    if (this.recipeCache) {
      this.recipeCache.clear();
    }
    if (this.recipeSummaryCache) {
      this.recipeSummaryCache.clear();
    }
    if (this.recipeSummaryAccessOrder) {
      this.recipeSummaryAccessOrder.clear();
    }
    if (this.inflightRequests) {
      this.inflightRequests.clear();
    }

    // Clear offline queue
    if (this.offlineQueue) {
      this.offlineQueue.length = 0;
    }

    // Reset state flags
    this.isInitialized = false;
    this.initPromise = null;
    this.isProcessingQueue = false;
    this.connectionState = 'unknown';

    debug.log(DEBUG_CATEGORIES.STORAGE, 'StorageManager destroyed and cleaned up');
  }

  /**
   * Request deduplication to prevent concurrent identical requests
   */
  async deduplicateRequest(key, requestFn) {
    // If request is already in flight, return the existing promise
    if (this.inflightRequests.has(key)) {
      debug.log(DEBUG_CATEGORIES.STORAGE, `Deduplicating concurrent request: ${key}`);
      return this.inflightRequests.get(key);
    }
    
    // Execute the request and track it
    const promise = requestFn();
    this.inflightRequests.set(key, promise);
    
    try {
      const result = await promise;
      return result;
    } finally {
      // Clean up after request completes (success or failure)
      this.inflightRequests.delete(key);
    }
  }

  /**
   * Intelligent Recipe Cache - Memory-based caching with smart invalidation
   */
  getCachedRecipeSummaries(userId, forceRefresh = false) {
    if (forceRefresh) {
      this.recipeSummaryCache.delete(userId);
      this.recipeSummaryAccessOrder.delete(userId);
      return null;
    }
    
    const cached = this.recipeSummaryCache.get(userId);
    if (!cached) return null;
    
    // Check if cache is still valid
    if ((Date.now() - cached.timestamp) > this.cacheExpiry) {
      this.recipeSummaryCache.delete(userId);
      this.recipeSummaryAccessOrder.delete(userId);
      return null;
    }
    
    // Update access order for LRU tracking
    this.recipeSummaryAccessOrder.set(userId, Date.now());
    
    debug.log(DEBUG_CATEGORIES.STORAGE, `Cache hit for recipe summaries: ${userId}`);
    return cached.data;
  }

  setCachedRecipeSummaries(userId, recipes) {
    // Enforce cache size limits with LRU eviction
    if (this.recipeSummaryCache.size >= this.maxCacheSize && !this.recipeSummaryCache.has(userId)) {
      // Find least recently used entry
      let lruKey = null;
      let lruTime = Date.now();
      
      for (const [key, accessTime] of this.recipeSummaryAccessOrder) {
        if (accessTime < lruTime) {
          lruTime = accessTime;
          lruKey = key;
        }
      }
      
      // Remove least recently used entry
      if (lruKey) {
        this.recipeSummaryCache.delete(lruKey);
        this.recipeSummaryAccessOrder.delete(lruKey);
        debug.log(DEBUG_CATEGORIES.STORAGE, `Evicted LRU cache entry: ${lruKey}`);
      }
    }
    
    this.recipeSummaryCache.set(userId, {
      data: recipes,
      timestamp: Date.now()
    });
    
    // Track access time for LRU
    this.recipeSummaryAccessOrder.set(userId, Date.now());
    
    debug.log(DEBUG_CATEGORIES.STORAGE, `Cached ${recipes.length} recipe summaries for: ${userId}`);
  }

  getCachedFullRecipe(userId, recipeId, forceRefresh = false) {
    const cacheKey = `${userId}_${recipeId}`;
    
    if (forceRefresh) {
      this.recipeCache.delete(cacheKey);
      return null;
    }
    
    const cached = this.recipeCache.get(cacheKey);
    if (!cached) return null;
    
    // Check if cache is still valid
    if ((Date.now() - cached.timestamp) > this.cacheExpiry) {
      this.recipeCache.delete(cacheKey);
      return null;
    }
    
    debug.log(DEBUG_CATEGORIES.STORAGE, `Cache hit for full recipe: ${recipeId}`);
    return cached.data;
  }

  setCachedFullRecipe(userId, recipeId, recipe) {
    const cacheKey = `${userId}_${recipeId}`;
    
    // Enforce cache size limits
    if (this.recipeCache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const firstKey = this.recipeCache.keys().next().value;
      this.recipeCache.delete(firstKey);
    }
    
    this.recipeCache.set(cacheKey, {
      data: recipe,
      timestamp: Date.now()
    });
    
    debug.log(DEBUG_CATEGORIES.STORAGE, `Cached full recipe: ${recipeId}`);
  }

  invalidateRecipeCache(userId, recipeId = null) {
    // Smart cache invalidation
    if (recipeId) {
      // Invalidate specific recipe
      const cacheKey = `${userId}_${recipeId}`;
      this.recipeCache.delete(cacheKey);
      debug.log(DEBUG_CATEGORIES.STORAGE, `Invalidated cache for recipe: ${recipeId}`);
    }
    
    // Always invalidate summaries when any recipe changes
    this.recipeSummaryCache.delete(userId);
    this.recipeSummaryAccessOrder.delete(userId);
    debug.log(DEBUG_CATEGORIES.STORAGE, `Invalidated summary cache for user: ${userId}`);
  }

  /**
   * Progressive Data Loading - Load summaries first, full data on-demand
   */
  async loadRecipesSummaryOnly(userId) {
    debug.log(DEBUG_CATEGORIES.STORAGE, `Loading recipe summaries for: ${userId}`);
    
    // Check cache first
    const cached = this.getCachedRecipeSummaries(userId);
    if (cached) return cached;

    // Use deduplication to prevent concurrent requests for the same user
    return this.deduplicateRequest(`summary_${userId}`, async () => {
      // Check cache again in case it was populated during deduplication wait
      const recentCache = this.getCachedRecipeSummaries(userId);
      if (recentCache) return recentCache;
    
      try {
        // Load minimal data for list display
        const snapshot = await this.db.ref(`users/${userId}/recipes`)
          .orderByChild('savedAt')
          .limitToLast(20) // Progressive loading - only recent recipes
          .once('value');
          
        const recipes = snapshot.val() || {};
        
        // Transform to summary format (minimal data transfer)
        const summaries = Object.values(recipes).map(recipe => ({
          id: recipe.id,
          name: recipe.name || 'Unnamed Recipe',
          style: recipe.style || 'Unknown Style',
          savedAt: recipe.savedAt,
          privacy: recipe.privacy || this.getDefaultPrivacyLevel(),
          // Key stats only
          og: recipe.og,
          fg: recipe.fg,
          abv: recipe.abv,
          ibu: recipe.ibu
          // Note: Full recipe data loaded on-demand when needed
        }));
        
        // Cache the summaries
        this.setCachedRecipeSummaries(userId, summaries);
        
        return summaries;
      } catch (error) {
        errorHandler.handleError(error, {
          component: 'StorageManager',
          method: 'loadRecipesSummaryOnly',
          userId
        });
        return [];
      }
    }); // End deduplication wrapper
  }

  async loadFullRecipeOptimized(userId, recipeId) {
    debug.log(DEBUG_CATEGORIES.STORAGE, `Loading full recipe: ${recipeId} for user: ${userId}`);
    
    // Check cache first
    const cached = this.getCachedFullRecipe(userId, recipeId);
    if (cached) return cached;

    // Use deduplication to prevent concurrent requests for the same recipe
    return this.deduplicateRequest(`recipe_${userId}_${recipeId}`, async () => {
      // Check cache again in case it was populated during deduplication wait
      const recentCache = this.getCachedFullRecipe(userId, recipeId);
      if (recentCache) return recentCache;
      
      try {
        const snapshot = await this.db.ref(`users/${userId}/recipes/${recipeId}`).once('value');
        const recipe = snapshot.val();
        
        if (recipe) {
          // Cache the full recipe
          this.setCachedFullRecipe(userId, recipeId, recipe);
        }
        
        return recipe;
      } catch (error) {
        errorHandler.handleError(error, {
          component: 'StorageManager',
          method: 'loadFullRecipeOptimized',
          userId,
          recipeId
        });
        return null;
      }
    }); // End deduplication wrapper
  }

  /**
   * STREAMING SOLUTION: Load recipes progressively for immediate interactivity
   * Each recipe becomes interactive as soon as it loads (vs waiting for all recipes)
   */
  async loadRecipesStreaming(userId, onRecipeLoaded) {
    debug.log(DEBUG_CATEGORIES.STORAGE, `Starting streaming load for: ${userId}`);
    const startTime = performance.now();
    
    try {
      // CRITICAL FIX: Ensure Firebase is initialized before streaming
      await this.init();
      
      // Ensure user is authenticated for streaming
      await this.ensureValidSessionFast();
      
      // STREAMING OPTIMIZATION: Use ultra-fast connection check
      const connectionStart = performance.now();
      await this.ensureUltraFastConnection();
      const connectionTime = performance.now() - connectionStart;
      debug.log(DEBUG_CATEGORIES.STORAGE, `Ultra-fast connection verified in ${connectionTime.toFixed(1)}ms`);

      // Phase 1: Get recipe data in single query (no shallow query needed - already have full data)
      debug.log(DEBUG_CATEGORIES.STORAGE, 'Phase 1: Loading recipe data with optimized query...');
      const idsSnapshot = await this.db.ref(`users/${userId}/recipes`)
        .orderByChild('savedAt')
        .limitToLast(20)
        .once('value');
      
      if (!idsSnapshot.val()) {
        debug.log(DEBUG_CATEGORIES.STORAGE, 'No recipes found for user');
        return [];
      }
      
      const recipes = idsSnapshot.val();
      const recipeEntries = Object.entries(recipes);
      const results = [];
      
      debug.log(DEBUG_CATEGORIES.STORAGE, `Phase 2: Streaming ${recipeEntries.length} recipes progressively...`);
      
      // Phase 2: Stream individual recipes for progressive interactivity
      const streamPromises = recipeEntries.map(async ([recipeId, recipeData], index) => {
        // Stagger requests by 25ms to avoid overwhelming Firebase
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        
        try {
          const loadStartTime = performance.now();
          
          // Create minimal interactive summary from existing data (no additional Firebase call needed!)
          const summary = {
            id: recipeData.id || recipeId,
            name: recipeData.name || 'Unnamed Recipe',
            style: recipeData.style || 'Unknown Style',
            savedAt: recipeData.savedAt,
            privacy: recipeData.privacy || this.getDefaultPrivacyLevel(),
            og: recipeData.og,
            fg: recipeData.fg,
            abv: recipeData.abv,
            ibu: recipeData.ibu,
            // CRITICAL: Mark as interactive immediately
            _interactive: true,
            _loadTime: performance.now(),
            _index: index
          };
          
          const loadTime = performance.now() - loadStartTime;
          debug.log(DEBUG_CATEGORIES.STORAGE, `Recipe ${index + 1}/${recipeEntries.length} ready for interaction: ${summary.name} (${loadTime.toFixed(1)}ms)`);
          
          // Make recipe interactive IMMEDIATELY when loaded
          if (onRecipeLoaded) {
            onRecipeLoaded(summary, index);
          }
          
          results.push(summary);
          return summary;
          
        } catch (error) {
          debug.warn(DEBUG_CATEGORIES.STORAGE, `Failed to process recipe ${recipeId}:`, error);
          return null;
        }
      });
      
      // Wait for all recipes to complete streaming
      const loadedRecipes = await Promise.all(streamPromises);
      const validRecipes = loadedRecipes.filter(recipe => recipe !== null);
      
      // Cache final results
      this.setCachedRecipeSummaries(userId, validRecipes);
      
      // HYPER-OPTIMIZATION: Cache in localStorage for instant subsequent loads
      const localKey = `quick_cache_recipes_${userId}`;
      try {
        localStorage.setItem(localKey, JSON.stringify({
          recipes: validRecipes,
          timestamp: Date.now()
        }));
        debug.log(DEBUG_CATEGORIES.STORAGE, `Cached ${validRecipes.length} recipes in localStorage for instant access`);
      } catch (e) {
        debug.warn(DEBUG_CATEGORIES.STORAGE, 'Failed to cache recipes in localStorage:', e);
      }
      
      const totalTime = performance.now() - startTime;
      debug.log(DEBUG_CATEGORIES.STORAGE, `Streaming complete: ${validRecipes.length} recipes loaded in ${totalTime.toFixed(1)}ms`);
      
      return validRecipes;
      
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'loadRecipesStreaming',
        userId
      });
      return [];
    }
  }

  /**
   * Get recipe image from localStorage (legacy support)
   * @param {string} recipeId - The recipe ID
   * @returns {string|null} - The image data URL or null
   */
  getRecipeImage(recipeId) {
    if (!recipeId) return null;
    
    // Check temporary storage first (for editing)
    const tempKey = `temp_recipe_image_${recipeId}`;
    const tempImage = localStorage.getItem(tempKey);
    if (tempImage) return tempImage;
    
    // Check permanent storage (legacy)
    const permanentKey = `recipe_image_${recipeId}`;
    return localStorage.getItem(permanentKey);
  }

  /**
   * Get recipe image from Firebase for saved recipes
   * @param {string} recipeId - The recipe ID
   * @param {string} [ownerId] - Optional owner ID for shared recipes
   * @returns {Promise<string|null>} - The image data URL or null
   */
  async getRecipeImageFromFirebase(recipeId, ownerId = null) {
    if (!recipeId) return null;
    
    try {
      await this.init();
      
      // Get current user ID or use provided ownerId
      let currentUserId = this.getEffectiveUserId();
      let targetUserId = ownerId || currentUserId;
      
      // If no user ID and we're not using a provided ownerId, wait for Clerk auth to complete
      if (!targetUserId && !ownerId) {
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ No user ID yet, waiting for Clerk auth to complete...`);
        
        // Wait up to 3 seconds for authentication to complete
        for (let attempts = 0; attempts < 60; attempts++) {
          await new Promise(resolve => setTimeout(resolve, 50));
          currentUserId = this.getEffectiveUserId();
          if (currentUserId) {
            targetUserId = currentUserId;
            debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Auth completed after ${(attempts + 1) * 50}ms, got userId: ${targetUserId}`);
            break;
          }
        }
      }
      
      debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Firebase image lookup: recipeId=${recipeId}, targetUserId=${targetUserId}`);
      
      if (!targetUserId) {
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ No target user ID available for image lookup after waiting`);
        return null;
      }
      
      // Get recipe from Firebase to extract image data
      const firebasePath = `users/${targetUserId}/recipes/${recipeId}`;
      debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Firebase path: ${firebasePath}`);
      
      const recipeSnapshot = await this.db.ref(firebasePath).once('value');
      if (!recipeSnapshot.exists()) {
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Recipe not found at path: ${firebasePath}`);
        return null;
      }
      
      const recipe = recipeSnapshot.val();
      debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Recipe data retrieved:`, {
        hasImageData: !!recipe.imageData,
        imageDataLength: recipe.imageData ? recipe.imageData.length : 0,
        recipeKeys: Object.keys(recipe).slice(0, 10) // First 10 keys
      });
      
      return recipe.imageData || null;
      
    } catch (error) {
      debug.error(DEBUG_CATEGORIES.STORAGE, `🖼️ Firebase image load error for ${recipeId}:`, error);
      return null;
    }
  }

  /**
   * Save recipe image to localStorage
   * @param {string} recipeId - The recipe ID
   * @param {string} imageData - The image data URL
   */
  saveRecipeImage(recipeId, imageData) {
    if (!recipeId || !imageData) return;
    const key = `recipe_image_${recipeId}`;
    localStorage.setItem(key, imageData);
  }

  /**
   * Generate a deterministic Firebase UID from Clerk user ID (LEGACY - Only used by fallback auth)
   * This ensures consistent mapping between Clerk and Firebase users
   * NOTE: This method is deprecated in favor of direct Clerk user ID usage
   */
  generateFirebaseUid(clerkUserId) {
    // Use a cryptographic approach to generate consistent UID
    // This is more secure than simple base64 encoding
    const encoder = new TextEncoder();
    const data = encoder.encode(`firebase_uid_${clerkUserId}_brew_log_2024`);
    
    // Generate a hash and convert to valid Firebase UID format
    return crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
      const hashArray = new Uint8Array(hashBuffer);
      const hashHex = Array.from(hashArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Firebase UIDs are 28 characters, alphanumeric
      // Convert hex to base64-like format and trim to 28 chars
      return hashHex.substring(0, 28);
    });
  }

  /**
   * Optimized Firebase authentication (SIMPLIFIED: Focus on performance gains)
   * Skip custom token complexity, optimize existing anonymous auth pattern
   */
  async authenticateFirebaseOptimized() {
    if (!clerkAuth.isUserSignedIn()) {
      return false; // Not signed in, skip auth
    }

    const currentUser = firebase.auth().currentUser;
    const clerkUserId = clerkAuth.getFirebaseUserId();
    
    // Check if already authenticated (skip redundant auth calls)
    if (currentUser && currentUser.uid) {
      debug.log(DEBUG_CATEGORIES.AUTH, 'Firebase already authenticated, skipping auth');
      return true;
    }
    
    try {
      // Use anonymous auth (faster than complex token logic)
      await firebase.auth().signInAnonymously();
      
      // Store Firebase auth mapping
      const firebaseUser = firebase.auth().currentUser;
      if (firebaseUser) {
        // Use sessionStorage instead of localStorage for faster access
        sessionStorage.setItem('auth_mapping', JSON.stringify({
          clerkUserId: clerkUserId,
          firebaseUid: firebaseUser.uid,
          timestamp: Date.now()
        }));
        
        debug.log(DEBUG_CATEGORIES.AUTH, 'Firebase authenticated with optimized anonymous auth');
        return true;
      }
      
    } catch (error) {
      debug.warn(DEBUG_CATEGORIES.AUTH, 'Optimized auth failed, falling back to legacy:', error);
      return await this.authenticateFirebaseLegacy();
    }
    
    return false;
  }

  /**
   * Legacy Firebase authentication (fallback method)
   */
  async authenticateFirebaseLegacy() {
    if (!clerkAuth.isUserSignedIn()) {
      throw new Error('User must be signed in');
    }

    const clerkUserId = clerkAuth.getUserId();
    const expectedFirebaseUid = await this.generateFirebaseUid(clerkUserId);
    const currentUser = firebase.auth().currentUser;
    
    try {
      // Check if we're already authenticated with the correct deterministic UID
      if (currentUser && currentUser.uid === expectedFirebaseUid) {
        return true; // Already properly authenticated
      }

      // For this hybrid approach, we'll use a workaround:
      // Sign in anonymously and then use the Clerk user ID for database paths
      // The security comes from using Clerk user IDs in the database structure
      if (!currentUser) {
        await firebase.auth().signInAnonymously();
      }
      
      // Store the mapping for verification
      const firebaseUser = firebase.auth().currentUser;
      if (firebaseUser) {
        localStorage.setItem('auth_mapping', JSON.stringify({
          clerkUserId: clerkUserId,
          firebaseUid: firebaseUser.uid,
          expectedUid: expectedFirebaseUid,
          timestamp: Date.now()
        }));
        
        debug.log(DEBUG_CATEGORIES.AUTH, 'Firebase authenticated with legacy method');
        return true;
      }
      
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'authenticateFirebaseLegacy'
      });
      throw error;
    }
  }

  /**
   * Get the effective user ID for database operations (OPTIMIZED)
   * Uses Clerk user ID directly - no Firebase user mapping needed
   * Returns null if user is not authenticated
   */
  getEffectiveUserId() {
    return clerkAuth.getFirebaseUserId() || null;
  }

  /**
   * Verify user has permission to access specific user data
   */
  verifyUserAccess(targetUserId) {
    const currentUserId = this.getEffectiveUserId();
    if (!currentUserId) {
      throw new Error('User not authenticated');
    }
    
    if (currentUserId !== targetUserId) {
      throw new Error('Unauthorized access to user data');
    }
    
    return true;
  }

  /**
   * Check if Firebase session is still valid and re-authenticate if needed (OPTIMIZED)
   * Uses new optimized authentication to eliminate dual auth overhead
   */
  async ensureValidSession() {
    const currentUser = firebase.auth().currentUser;
    const clerkUserId = clerkAuth.getUserId();
    
    debug.log(DEBUG_CATEGORIES.STORAGE, `ensureValidSession - Firebase user: ${currentUser ? currentUser.uid : 'null'}, Clerk user: ${clerkUserId}`);
    
    if (!currentUser && clerkUserId) {
      // Session expired, need to re-authenticate
      debug.log(DEBUG_CATEGORIES.STORAGE, `No Firebase user, using optimized authentication...`);
      const success = await this.authenticateFirebaseOptimized();
      
      if (!success) {
        debug.warn(DEBUG_CATEGORIES.STORAGE, 'Authentication failed');
        return false;
      }
    }
    
    return true;
  }

  /**
   * Optimized session check for initial load - uses optimized auth pattern
   */
  async ensureValidSessionFast() {
    // For initial loads, use anonymous authentication
    const clerkUserId = clerkAuth.getUserId();
    if (!clerkUserId) {
      return false;
    }
    
    const currentUser = firebase.auth().currentUser;
    if (!currentUser) {
      // Use anonymous authentication for fast initial load
      try {
        const success = await this.authenticateFirebaseOptimized();
        debug.log(DEBUG_CATEGORIES.STORAGE, success ? 'Fast optimized Firebase auth successful' : 'Fast auth failed');
        return success;
      } catch (error) {
        debug.log(DEBUG_CATEGORIES.STORAGE, 'Fast auth failed, falling back to legacy');
        return await this.authenticateFirebaseLegacy();
      }
    }
    
    return true;
  }

  /**
   * Save a recipe to Firebase
   * @param {Object} recipe - The recipe data to save
   * @param {Object} options - Save options
   * @param {string} options.privacy - Privacy level: 'public' | 'unlisted' | 'private'
   * @returns {Promise<string>} - The ID of the saved recipe
   */
  async saveRecipe(recipe, options = {}) {
    // Skip offline check if we're processing the queue (options.fromQueue)
    if (!options.fromQueue && (!navigator.onLine || this._forceOffline)) {
      // Handle offline save without loading overlay
      const queueId = this.queueOfflineAction({
        type: 'saveRecipe',
        data: { recipe, options }
      });
      // Don't show toast here - let the caller handle it
      return { id: queueId, offline: true };
    }
    
    const loadingId = 'saveRecipe';
    loadingManager.showLoading('Saving recipe...', loadingId);
    
    try {
      await this.init();
      
      // Use connection verification instead of expensive tests
      if (!this._forceTimeout) {
        const isConnected = await this.ensureConnection();
        if (!isConnected) {
          // Firebase reports we're not connected
          loadingManager.hideLoading(loadingId);
          const queueId = this.queueOfflineAction({
            type: 'saveRecipe',
            data: { recipe, options }
          });
          return { id: queueId, offline: true };
        }
      }
      
      await this.ensureValidSession();
      
      // Check if user is authenticated
      const userId = this.getEffectiveUserId();
      debug.log(DEBUG_CATEGORIES.STORAGE, 'Saving with user ID:', userId);
      
      if (!userId) {
        throw new Error('User must be signed in to save recipes');
      }
      
      // Verify user access (client-side security layer)
      this.verifyUserAccess(userId);
      // Generate a unique ID if not provided
      const recipeId = recipe.id || this.generateRecipeId(recipe);
      
      // Get recipe image from localStorage if it exists
      const imageData = this.getRecipeImage(window.currentRecipeId || recipeId);
      
      // Check if image was explicitly removed
      const removalKey = `recipe_image_removed_${window.currentRecipeId || recipeId}`;
      const wasImageRemoved = localStorage.getItem(removalKey) === 'true';
      
      // Only include image data if it's not too large (Firebase has limits)
      const includeImage = imageData && imageData.length < 1000000; // 1MB limit for images
      
      // Determine privacy level
      const privacy = (options.privacy && this.isValidPrivacyLevel(options.privacy)) 
        ? options.privacy 
        : this.getDefaultPrivacyLevel();

      // Add metadata including user ownership and privacy settings
      const recipeWithMeta = {
        ...recipe,
        id: recipeId,
        owner: userId,
        ownerName: clerkAuth.getCurrentUser()?.firstName || 'Anonymous',
        privacy: privacy,
        savedAt: new Date().toISOString(),
        updatedAt: firebase.database.ServerValue.TIMESTAMP,
        version: '1.0'
      };

      // Handle image data explicitly
      if (includeImage) {
        recipeWithMeta.imageData = imageData;
      } else if (wasImageRemoved) {
        // Image was explicitly removed - set to null to remove from Firebase
        recipeWithMeta.imageData = null;
      }
      // If no image data at all (undefined), don't set the field

      if (imageData && !includeImage) {
        this.showToast('Image too large for cloud storage (1MB limit)', 'warning');
      }

      // Clean the data for Firebase (remove undefined values)
      const cleanedRecipe = this.cleanForFirebase(recipeWithMeta);

      // Save to user's recipes collection with timeout
      loadingManager.updateLoadingMessage('Uploading to cloud...', loadingId);
      
      // Create a timeout promise that rejects after 10 seconds (or 3 seconds in test mode)
      const timeoutDelay = this._forceTimeout ? 3000 : 10000;
      
      if (this._forceTimeout) {
        debug.log(DEBUG_CATEGORIES.OFFLINE, 'Timeout test: Starting 3-second countdown...');
      }
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          if (this._forceTimeout) {
            debug.log(DEBUG_CATEGORIES.OFFLINE, 'Timeout test: Timeout triggered!');
          }
          reject(new Error('Save timeout - check your connection'));
        }, timeoutDelay);
      });
      
      // Log the save path
      const savePath = `users/${userId}/recipes/${recipeId}`;
      debug.log(DEBUG_CATEGORIES.STORAGE, 'Saving to Firebase path:', savePath);
      
      // If forcing timeout for testing, create a promise that never resolves
      const savePromise = this._forceTimeout 
        ? new Promise(() => { debug.log(DEBUG_CATEGORIES.OFFLINE, 'Timeout test: Creating hanging promise...'); }) // This promise never resolves, forcing timeout
        : this.db.ref(savePath).set(cleanedRecipe);
      
      // Race between Firebase save and timeout
      await Promise.race([
        savePromise,
        timeoutPromise
      ]);
      
      // Recipe saved successfully - don't show toast, let caller handle it
      
      // Clear cache for this recipe since it was updated
      shareTokenCache.clear(`recipe_${recipeId}`);
      shareTokenCache.clear(`recipe_${recipeId}_${userId}`);
      
      // Use intelligent cache invalidation
      this.invalidateRecipeCache(userId, recipeId);
      
      // Clear recipes list cache since it was updated (legacy support)
      const recipeCacheKey = `recipes_cache_${userId}`;
      localStorage.removeItem(`cache_${recipeCacheKey}`);
      debug.log(DEBUG_CATEGORIES.STORAGE, `Cleared recipe and list cache after save: ${recipeId}`);
      
      // Clean up localStorage image after successful save to Firebase
      if (window.recipeImageManager && window.recipeImageManager.clearImageAfterSave) {
        window.recipeImageManager.clearImageAfterSave();
      }
      
      // Clean up image removal flag after successful save
      if (wasImageRemoved) {
        const removalKey = `recipe_image_removed_${window.currentRecipeId || recipeId}`;
        localStorage.removeItem(removalKey);
      }
      
      return { id: recipeId, offline: false };
    } catch (error) {
      // Check if this is a timeout or network error
      if (error.message.includes('timeout') || error.message.includes('network')) {
        // Queue for offline save
        const queueId = this.queueOfflineAction({
          type: 'saveRecipe',
          data: { recipe, options }
        });
        // Don't show toast here - let the caller handle it
        loadingManager.hideLoading(loadingId); // Make sure loading is hidden
        return { id: queueId, offline: true };
      }
      
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'saveRecipe'
      });
      this.showToast('Failed to save recipe', 'error');
      throw error;
    } finally {
      loadingManager.hideLoading(loadingId);
    }
  }

  /**
   * Load a recipe from Firebase
   * @param {string} recipeId - The ID of the recipe to load
   * @param {string} [ownerId] - Optional owner ID for shared recipes
   * @returns {Promise<Object>} - The recipe data
   */
  async loadRecipe(recipeId, ownerId = null) {
    const loadingId = 'loadRecipe';
    loadingManager.showLoading('Loading recipe...', loadingId);
    
    // Check cache first (use ownerId in cache key for shared recipes)
    const cacheKey = ownerId ? `recipe_${recipeId}_${ownerId}` : `recipe_${recipeId}`;
    const cached = shareTokenCache.get(cacheKey);
    if (cached) {
      debug.log(DEBUG_CATEGORIES.STORAGE, `Cache hit for recipe: ${recipeId}${ownerId ? ` (owner: ${ownerId})` : ''}`);
      loadingManager.hideLoading(loadingId);
      return cached;
    }
    
    try {
      await this.init();
      
      // Authenticate if user is signed in
      if (clerkAuth.isUserSignedIn()) {
        await this.ensureValidSession();
      }
      let recipe = null;
      // Get current user ID
      const currentUserId = this.getEffectiveUserId();
      
      // If ownerId is provided, load from that user's recipes (for sharing)
      if (ownerId) {
        try {
          loadingManager.updateLoadingMessage('Accessing shared recipe...', loadingId);
          // Use streaming load for shared recipes
          recipe = await this.loadFullRecipeOptimized(ownerId, recipeId);
          
          // For shared recipes, check access permissions
          if (recipe) {
            // If recipe is private and user is not the owner
            const recipePrivacy = recipe.privacy || this.getDefaultPrivacyLevel();
            if (recipePrivacy === StorageManager.PRIVACY_LEVELS.PRIVATE && ownerId !== currentUserId) {
              const privateError = new Error('PRIVATE_RECIPE_ACCESS');
              privateError.isPrivateAccess = true;
              privateError.userMessage = 'This recipe is private and can only be viewed by its owner.';
              throw privateError;
            }
          }
        } catch (error) {
          // Handle Firebase permission errors gracefully
          if (error.code === 'PERMISSION_DENIED' || error.message.includes('permission_denied')) {
            // This means the recipe exists but is private and user is not the owner
            const privateError = new Error('PRIVATE_RECIPE_ACCESS');
            privateError.isPrivateAccess = true;
            privateError.userMessage = 'This recipe is private and can only be viewed by its owner.';
            throw privateError;
          }
          // Re-throw other errors (but handle private access errors differently)
          if (error.isPrivateAccess) {
            throw error;
          }
          throw error;
        }
      } else {
        // Try to load from current user's recipes first
        if (currentUserId) {
          loadingManager.updateLoadingMessage('Loading your recipe...', loadingId);
          // Use streaming load for user's own recipes
          recipe = await this.loadFullRecipeOptimized(currentUserId, recipeId);
        }
      }
      
      if (!recipe) {
        throw new Error(`Recipe not found: ${recipeId}`);
      }

      // Restore image to memory cache if it exists in the recipe
      if (recipe.imageData && recipe.id) {
        // Set the current recipe ID so the image manager can find it
        window.currentRecipeId = recipe.id;
        
        // Load image into memory cache instead of localStorage
        if (window.recipeImageManager && window.recipeImageManager.imageCache) {
          window.recipeImageManager.imageCache.set(recipe.id, recipe.imageData);
        }
      }
      
      // Cache the loaded recipe
      shareTokenCache.set(cacheKey, recipe);
      debug.log(DEBUG_CATEGORIES.STORAGE, `Cached recipe: ${recipeId}${ownerId ? ` (owner: ${ownerId})` : ''}`);
      
      return recipe;
    } catch (error) {
      // Handle private access errors differently - don't log them as application errors
      if (error.isPrivateAccess) {
        throw error; // Re-throw without error handler logging
      }
      
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'loadRecipe',
        recipeId,
        ownerId
      });
      throw error;
    } finally {
      loadingManager.hideLoading(loadingId);
    }
  }

  /**
   * List all saved recipes for the current user - OPTIMIZED with Phase 3 caching
   * @param {boolean} fastMode - Use optimized session check for initial load
   * @returns {Promise<Array>} - Array of recipe summaries
   */
  async listRecipes(fastMode = false) {
    await this.init();
    
    // Use faster session check for initial loads
    if (fastMode) {
      await this.ensureValidSessionFast();
    } else {
      await this.ensureValidSession();
    }
    
    // Check if user is authenticated
    const userId = this.getEffectiveUserId();
    if (!userId) {
      return []; // Return empty array if not signed in
    }
    
    // Use summary loading with intelligent caching
    return this.loadRecipesSummaryOnly(userId);
  }

  /**
   * Delete a recipe from Firebase
   * @param {string} recipeId - The ID of the recipe to delete
   */
  async deleteRecipe(recipeId) {
    await this.init();
    await this.ensureValidSession();
    
    // Check if user is authenticated
    const userId = this.getEffectiveUserId();
    if (!userId) {
      throw new Error('User must be signed in to delete recipes');
    }
    
    try {
      await this.db.ref(`users/${userId}/recipes/${recipeId}`).remove();
      
      // Also remove the recipe image from localStorage
      const imageKey = `recipe_image_${recipeId}`;
      localStorage.removeItem(imageKey);
      
      // Use intelligent cache invalidation
      this.invalidateRecipeCache(userId, recipeId);
      
      // Clear recipes list cache since it was updated (legacy support)
      const recipeCacheKey = `recipes_cache_${userId}`;
      localStorage.removeItem(`cache_${recipeCacheKey}`);
      debug.log(DEBUG_CATEGORIES.STORAGE, `Cleared recipes cache after delete: ${recipeId}`);
      
      // Recipe deleted successfully
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'deleteRecipe',
        recipeId
      });
      throw error;
    }
  }

  /**
   * Generate a shareable URL for a recipe
   * @param {string} recipeId - The recipe ID
   * @returns {string} - The shareable URL
   */
  getShareableUrl(recipeId) {
    // Get the base URL, handling both development and production
    let baseUrl = window.location.origin + window.location.pathname;
    
    // Include owner ID for proper recipe access
    const userId = this.getEffectiveUserId();
    
    // For development, show a note about localhost
    if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
      // Still generate the URL, but it will only work locally
      this.showToast('⚠️ Localhost URL generated - this will only work on your local machine', 'warning');
    }
    
    return `${baseUrl}?recipe=${recipeId}&owner=${userId}`;
  }

  /**
   * Get the production-ready shareable URL (for display purposes)
   * @param {string} recipeId - The recipe ID
   * @returns {string} - The shareable URL with production domain placeholder
   */
  getProductionShareableUrl(recipeId) {
    const currentUrl = window.location.origin + window.location.pathname;
    
    // If we're on localhost, show what the production URL would look like
    if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
      return `https://your-domain.com/?recipe=${recipeId}`;
    }
    
    // If we're on a real domain, use it
    return `${currentUrl}?recipe=${recipeId}`;
  }

  /**
   * Check if URL has a recipe ID parameter
   * @returns {Object|null} - Object with recipeId and ownerId, or null
   */
  getRecipeInfoFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const recipeId = params.get('recipe');
    const ownerId = params.get('owner');
    
    if (recipeId) {
      return { recipeId, ownerId };
    }
    
    return null;
  }

  /**
   * Legacy method for backward compatibility
   * @returns {string|null} - The recipe ID from URL or null
   */
  getRecipeIdFromUrl() {
    const info = this.getRecipeInfoFromUrl();
    return info ? info.recipeId : null;
  }

  /**
   * Generate a unique recipe ID
   */
  generateRecipeId(recipe) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const namePart = (recipe.name || 'recipe')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 10);
    
    return `${namePart}-${timestamp}-${random}`;
  }
  
  /**
   * Check if a recipe already exists and if it's different
   * @param {Object} recipe - The recipe to check
   * @returns {Promise<Object>} - {exists: boolean, existingId: string, isDifferent: boolean}
   */
  async checkForExistingRecipe(recipe) {
    const userId = this.getEffectiveUserId();
    if (!userId) {
      return { exists: false };
    }
    
    try {
      // Get all user's recipes
      const snapshot = await this.db.ref(`users/${userId}/recipes`).once('value');
      const recipes = snapshot.val() || {};
      
      // Look for recipes with the same name
      for (const [id, existingRecipe] of Object.entries(recipes)) {
        if (existingRecipe.name === recipe.name) {
          // Get current image data to include in comparison
          const currentImageData = this.getRecipeImage(window.currentRecipeId || recipe.id || id);
          
          // Create recipe with current image data for comparison
          const recipeWithImage = {
            ...recipe,
            imageData: currentImageData
          };
          
          // Check if the recipes are actually different
          const isDifferent = this.areRecipesDifferent(recipeWithImage, existingRecipe);
          
          return {
            exists: true,
            existingId: id,
            existingRecipe: existingRecipe,
            isDifferent: isDifferent
          };
        }
      }
      
      return { exists: false };
    } catch (error) {
      debug.error(DEBUG_CATEGORIES.DUPLICATE, 'Error checking for existing recipe:', error);
      return { exists: false };
    }
  }
  
  /**
   * Compare two recipes to see if they're different
   * @param {Object} recipe1 - First recipe
   * @param {Object} recipe2 - Second recipe
   * @returns {boolean} - True if recipes are different
   */
  areRecipesDifferent(recipe1, recipe2) {
    // Compare key fields that would indicate the recipe has changed
    const keysToCompare = [
      'og', 'fg', 'abv', 'ibu', 'srm',
      'batchSize', 'boilSize', 'boilTime',
      'efficiency', 'notes', 'style.name'
    ];
    
    for (const key of keysToCompare) {
      const val1 = this.getNestedValue(recipe1, key);
      const val2 = this.getNestedValue(recipe2, key);
      
      // Convert to string for comparison to handle numbers
      if (String(val1) !== String(val2)) {
        debug.log(DEBUG_CATEGORIES.DUPLICATE, `Recipe differs at ${key}: "${val1}" vs "${val2}"`);
        return true;
      }
    }
    
    // Compare ingredients counts
    const fermentables1 = recipe1.ingredients?.fermentables?.length || 0;
    const fermentables2 = recipe2.ingredients?.fermentables?.length || 0;
    const hops1 = recipe1.ingredients?.hops?.length || 0;
    const hops2 = recipe2.ingredients?.hops?.length || 0;
    
    if (fermentables1 !== fermentables2 || hops1 !== hops2) {
      debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Recipe differs in ingredients count');
      return true;
    }
    
    // Compare image data - check if image was added, removed, or changed
    const image1 = recipe1.imageData || null;
    const image2 = recipe2.imageData || null;
    
    if (image1 !== image2) {
      debug.log(DEBUG_CATEGORIES.DUPLICATE, `Recipe differs in imageData: image1=${image1 ? 'present' : 'null'}, image2=${image2 ? 'present' : 'null'}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Get nested object value by dot notation path
   * @param {Object} obj - Object to search
   * @param {string} path - Dot notation path (e.g., 'style.name')
   * @returns {*} - Value at path or undefined
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, part) => current?.[part], obj);
  }

  /**
   * Privacy level constants
   */
  static PRIVACY_LEVELS = {
    PUBLIC: 'public',
    UNLISTED: 'unlisted', 
    PRIVATE: 'private'
  };

  /**
   * Validate privacy level
   * @param {string} privacy - Privacy level to validate
   * @returns {boolean} - True if valid
   */
  isValidPrivacyLevel(privacy) {
    return Object.values(StorageManager.PRIVACY_LEVELS).includes(privacy);
  }

  /**
   * Get default privacy level for new recipes
   * @returns {string} - Default privacy level
   */
  getDefaultPrivacyLevel() {
    return StorageManager.PRIVACY_LEVELS.UNLISTED;
  }


  /**
   * Update recipe privacy settings
   * @param {string} recipeId - The recipe ID
   * @param {string} privacy - Privacy level: 'public' | 'unlisted' | 'private'
   */
  async updateRecipePrivacy(recipeId, privacy) {
    await this.init();
    await this.ensureValidSession();
    
    // Validate privacy level
    if (!this.isValidPrivacyLevel(privacy)) {
      throw new Error(`Invalid privacy level: ${privacy}. Must be one of: ${Object.values(StorageManager.PRIVACY_LEVELS).join(', ')}`);
    }
    
    const userId = this.getEffectiveUserId();
    if (!userId) {
      throw new Error('User must be signed in to update recipes');
    }
    
    try {
      // Update privacy field
      const updates = {
        [`users/${userId}/recipes/${recipeId}/privacy`]: privacy,
        [`users/${userId}/recipes/${recipeId}/updatedAt`]: firebase.database.ServerValue.TIMESTAMP
      };
      
      await this.db.ref().update(updates);
      
      // If making recipe private, revoke all share tokens
      if (privacy === StorageManager.PRIVACY_LEVELS.PRIVATE) {
        await this.revokeAllShareTokens(recipeId);
      }
      
      // Clear cache for this recipe since privacy changed
      shareTokenCache.clear(`token_${recipeId}`);
      shareTokenCache.clear(`recipe_${recipeId}`);
      
      // Clear recipes list cache since privacy was updated
      const recipeCacheKey = `recipes_cache_${userId}`;
      localStorage.removeItem(`cache_${recipeCacheKey}`);
      debug.log(DEBUG_CATEGORIES.STORAGE, `Cleared cache for recipe after privacy change: ${recipeId}`);
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'updateRecipePrivacy',
        recipeId,
        privacy
      });
      throw error;
    }
  }

  /**
   * Migrate existing recipes to include privacy field
   * Run once per user to update legacy recipes
   */
  async migrateRecipePrivacy() {
    try {
      await this.init();
      const userId = this.getEffectiveUserId();
      if (!userId) return;

      const recipesSnapshot = await this.db.ref(`users/${userId}/recipes`).once('value');
      if (!recipesSnapshot.exists()) return;

      const updates = {};
      let migrationCount = 0;

      recipesSnapshot.forEach(child => {
        const recipe = child.val();
        const recipeId = child.key;
        
        // Only migrate recipes that don't already have privacy field
        if (!recipe.privacy) {
          // Use default privacy for unmigrated recipes
          const privacy = this.getDefaultPrivacyLevel();
          
          updates[`users/${userId}/recipes/${recipeId}/privacy`] = privacy;
          updates[`users/${userId}/recipes/${recipeId}/_migrated`] = true;
          updates[`users/${userId}/recipes/${recipeId}/_migratedAt`] = Date.now();
          migrationCount++;
        }
      });

      if (Object.keys(updates).length > 0) {
        await this.db.ref().update(updates);
        debug.log(DEBUG_CATEGORIES.STORAGE, `Migrated ${migrationCount} recipes to include privacy settings`);
      }

      return migrationCount;
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'migrateRecipePrivacy'
      });
      // Don't throw - migration failure shouldn't break the app
      return 0;
    }
  }


  /**
   * Find existing share token for a recipe
   * @param {string} recipeId - Recipe ID  
   * @returns {Object|null} - Existing token data or null
   */
  async findExistingShareToken(recipeId) {
    const userId = this.getEffectiveUserId();
    if (!userId) return null;
    
    // Check cache first
    const cached = shareTokenCache.get(`token_${recipeId}`);
    if (cached) {
      debug.log(DEBUG_CATEGORIES.STORAGE, `Cache hit for share token: ${recipeId}`);
      return cached;
    }
    
    try {
      const tokensSnapshot = await this.db.ref('shareTokens')
        .orderByChild('recipeId')
        .equalTo(recipeId)
        .once('value');
      
      if (!tokensSnapshot.exists()) {
        // Cache the null result to avoid repeated queries
        shareTokenCache.set(`token_${recipeId}`, null);
        return null;
      }
      
      // Find token owned by current user
      let existingToken = null;
      tokensSnapshot.forEach(child => {
        const tokenData = child.val();
        if (tokenData.clerkUserId === userId || tokenData.ownerId === userId) {
          existingToken = {
            token: child.key,
            data: tokenData
          };
        }
      });
      
      // Cache the result (even if null)
      shareTokenCache.set(`token_${recipeId}`, existingToken);
      debug.log(DEBUG_CATEGORIES.STORAGE, `Cached share token result for: ${recipeId}`);
      
      return existingToken;
    } catch (error) {
      debug.log(DEBUG_CATEGORIES.STORAGE, 'Error finding existing share token:', error);
      // If we can't query for existing tokens, just return null and create a new one
      return null;
    }
  }

  /**
   * Create or reuse secure share token for recipe
   * @param {string} recipeId - Recipe ID
   * @param {Object} options - Sharing options (forceNew: boolean, expiresAt: timestamp)
   * @returns {Object} - Share result with URL and status
   */
  async createShareToken(recipeId, options = {}) {
    const startTime = performanceMonitor.startTiming('shareTokenGeneration');
    
    await this.init();
    await this.ensureValidSession();
    
    const userId = this.getEffectiveUserId();
    if (!userId) {
      throw new Error('Authentication required to create share tokens');
    }
    
    debug.log(DEBUG_CATEGORIES.STORAGE, `Creating share token - User ID: ${userId}, Recipe ID: ${recipeId}, Force new: ${options.forceNew}`);
    
    try {
      // Get recipe to check privacy
      const recipeSnapshot = await this.db.ref(`users/${userId}/recipes/${recipeId}`).once('value');
      if (!recipeSnapshot.exists()) {
        throw new Error('Recipe not found');
      }
      
      const recipe = recipeSnapshot.val();
      const privacy = recipe.privacy || this.getDefaultPrivacyLevel();
      
      if (privacy === StorageManager.PRIVACY_LEVELS.PRIVATE) {
        throw new Error('Cannot share private recipes');
      }
      
      // Check for existing token unless forcing new
      if (!options.forceNew) {
        const existingToken = await this.findExistingShareToken(recipeId);
        if (existingToken) {
          const baseUrl = window.location.origin + window.location.pathname;
          return {
            url: `${baseUrl}?share=${existingToken.token}`,
            isExisting: true,
            token: existingToken.token,
            createdAt: existingToken.data.createdAt
          };
        }
      }
      
      // If forcing new token, revoke existing ones first
      if (options.forceNew) {
        await this.revokeAllShareTokens(recipeId);
        debug.log(DEBUG_CATEGORIES.STORAGE, `Revoked existing tokens for new share link`);
      }
      
      // Generate new token
      const token = this.generateShortToken();
      
      // Use Firebase UID for security rules, but keep Clerk ID for data access
      const firebaseUser = firebase.auth().currentUser;
      const firebaseUid = firebaseUser ? firebaseUser.uid : userId;
      
      const shareData = {
        recipeId,
        ownerId: firebaseUid, // Use Firebase UID for security rules
        clerkUserId: userId, // Keep Clerk ID for recipe access
        privacy: privacy, // Snapshot current privacy level
        createdAt: Date.now(),
        expiresAt: options.expiresAt || null,
        accessCount: 0,
        lastAccessed: null,
        createdBy: firebaseUid
      };
      
      debug.log(DEBUG_CATEGORIES.STORAGE, `Creating new share token:`, shareData);
      
      await this.db.ref(`shareTokens/${token}`).set(shareData);
      
      const baseUrl = window.location.origin + window.location.pathname;
      const result = {
        url: `${baseUrl}?share=${token}`,
        isExisting: false,
        token: token,
        createdAt: Date.now()
      };
      
      // Cache the newly created token
      shareTokenCache.set(`token_${recipeId}`, {
        token: token,
        data: shareData
      });
      debug.log(DEBUG_CATEGORIES.STORAGE, `Cached new share token for: ${recipeId}`);
      
      performanceMonitor.endTiming('shareTokenGeneration', startTime);
      return result;
      
    } catch (error) {
      performanceMonitor.endTiming('shareTokenGeneration', startTime);
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'createShareToken',
        recipeId
      });
      throw error;
    }
  }

  /**
   * Load recipe via share token
   * @param {string} shareToken - Share token from URL
   * @returns {Object} - Recipe data
   */
  async loadSharedRecipe(shareToken) {
    if (!shareToken) {
      throw new Error('Share token required');
    }
    
    try {
      await this.init();
      
      // For shared recipes, we need to ensure anonymous authentication at minimum
      const currentUser = firebase.auth().currentUser;
      if (!currentUser) {
        try {
          await firebase.auth().signInAnonymously();
          debug.log(DEBUG_CATEGORIES.STORAGE, 'Signed in anonymously for shared recipe access');
        } catch (authError) {
          debug.log(DEBUG_CATEGORIES.STORAGE, 'Failed to sign in anonymously:', authError);
          // Continue anyway - the Firebase rules should allow reading shareTokens without auth
        }
      }
      
      // Get share token data
      let shareSnapshot;
      try {
        shareSnapshot = await this.db.ref(`shareTokens/${shareToken}`).once('value');
      } catch (firebaseError) {
        debug.log(DEBUG_CATEGORIES.STORAGE, 'Firebase permission error accessing share token:', firebaseError);
        // If we get a permission denied error, treat it as an invalid/removed token
        if (firebaseError.code === 'PERMISSION_DENIED') {
          const invalidError = new Error('INVALID_SHARE_LINK');
          invalidError.isInvalidShare = true;
          invalidError.userMessage = 'This share link is invalid or has been removed.';
          throw invalidError;
        }
        // Re-throw other Firebase errors
        throw firebaseError;
      }
      
      if (!shareSnapshot.exists()) {
        const invalidError = new Error('INVALID_SHARE_LINK');
        invalidError.isInvalidShare = true;
        invalidError.userMessage = 'This share link is invalid or has been removed.';
        throw invalidError;
      }
      
      const shareData = shareSnapshot.val();
      
      // Note: Revoked tokens are now deleted entirely instead of marked as revoked
      
      // Check expiration (if set)
      if (shareData.expiresAt && Date.now() > shareData.expiresAt) {
        const expiredError = new Error('EXPIRED_SHARE_LINK');
        expiredError.isExpiredShare = true;
        expiredError.userMessage = 'This share link has expired.';
        throw expiredError;
      }
      
      // Load the actual recipe using Clerk user ID for data access
      const { recipeId, clerkUserId, ownerId } = shareData;
      const recipeOwnerId = clerkUserId || ownerId; // Fallback to ownerId for backwards compatibility
      const recipeSnapshot = await this.db.ref(`users/${recipeOwnerId}/recipes/${recipeId}`).once('value');
      
      if (!recipeSnapshot.exists()) {
        throw new Error('Recipe not found');
      }
      
      const recipe = recipeSnapshot.val();
      
      // Additional access control based on current privacy
      const currentUserId = this.getEffectiveUserId();
      const isOwner = recipeOwnerId === currentUserId;
      const privacy = recipe.privacy || this.getDefaultPrivacyLevel();
      
      if (privacy === StorageManager.PRIVACY_LEVELS.PRIVATE && !isOwner) {
        const privateError = new Error('PRIVATE_RECIPE_ACCESS');
        privateError.isPrivateAccess = true;
        privateError.userMessage = 'This recipe is private and can only be viewed by its owner.';
        throw privateError;
      }
      
      // Update access tracking (fire and forget)
      this.updateTokenAccess(shareToken).catch(error => {
        debug.warn(DEBUG_CATEGORIES.STORAGE, 'Failed to update token access tracking', error);
      });
      
      return recipe;
      
    } catch (error) {
      // Don't log share access errors as they are handled gracefully
      const isFirebasePermissionError = error.code === 'PERMISSION_DENIED';
      if (!error.isPrivateAccess && !error.isExpiredShare && !error.isInvalidShare && !isFirebasePermissionError) {
        errorHandler.handleError(error, {
          component: 'StorageManager',
          method: 'loadSharedRecipe',
          shareToken: shareToken.substring(0, 8) + '...' // Log partial token for debugging
        });
      }
      throw error;
    }
  }

  /**
   * Update token access tracking
   * @param {string} shareToken - Share token
   */
  async updateTokenAccess(shareToken) {
    try {
      const updates = {
        lastAccessed: Date.now(),
        accessCount: firebase.database.ServerValue.increment(1)
      };
      
      await this.db.ref(`shareTokens/${shareToken}`).update(updates);
    } catch (error) {
      // Non-critical operation - don't break the recipe loading
      debug.error(DEBUG_CATEGORIES.STORAGE, 'Failed to update token access:', error);
    }
  }

  /**
   * Revoke a specific share token
   * @param {string} shareToken - Share token to revoke
   */
  async revokeShareToken(shareToken) {
    try {
      await this.init();
      await this.ensureValidSession();
      
      const userId = this.getEffectiveUserId();
      if (!userId) {
        throw new Error('Authentication required');
      }
      
      // Verify token ownership before revoking
      const shareSnapshot = await this.db.ref(`shareTokens/${shareToken}`).once('value');
      if (!shareSnapshot.exists()) {
        throw new Error('Share token not found');
      }
      
      const shareData = shareSnapshot.val();
      const firebaseUser = firebase.auth().currentUser;
      const firebaseUid = firebaseUser ? firebaseUser.uid : null;
      
      // Check ownership using Firebase UID (for new tokens) or Clerk ID (for compatibility)
      const isOwner = shareData.ownerId === firebaseUid || shareData.clerkUserId === userId;
      if (!isOwner) {
        throw new Error('You can only revoke your own share tokens');
      }
      
      // Instead of marking as revoked, delete the token entirely for better security
      await this.db.ref(`shareTokens/${shareToken}`).remove();
      debug.log(DEBUG_CATEGORIES.STORAGE, `Successfully deleted share token: ${shareToken.substring(0, 8)}...`);
      
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'revokeShareToken',
        shareToken: shareToken.substring(0, 8) + '...'
      });
      throw error;
    }
  }

  /**
   * Generate a short, cryptographically secure token for share URLs
   * @returns {string} - 9-character random token
   */
  generateShortToken() {
    // Use URL-safe characters (no ambiguous characters like 0/O, 1/l)
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let result = '';
    
    // Generate 9 characters for good entropy (~1.5 × 10^14 combinations)
    const randomBytes = new Uint8Array(9);
    crypto.getRandomValues(randomBytes);
    
    for (let i = 0; i < 9; i++) {
      result += chars.charAt(randomBytes[i] % chars.length);
    }
    
    return result;
  }

  /**
   * Revoke all share tokens for a recipe
   * @param {string} recipeId - Recipe ID
   */
  async revokeAllShareTokens(recipeId) {
    try {
      await this.init();
      const userId = this.getEffectiveUserId();
      if (!userId) return;
      
      // Find all tokens for this recipe
      const tokensSnapshot = await this.db.ref('shareTokens')
        .orderByChild('recipeId')
        .equalTo(recipeId)
        .once('value');
      
      if (!tokensSnapshot.exists()) return;
      
      // Delete tokens instead of marking as revoked for better security
      const deletePromises = [];
      const firebaseUser = firebase.auth().currentUser;
      const firebaseUid = firebaseUser ? firebaseUser.uid : null;
      
      tokensSnapshot.forEach(child => {
        const tokenData = child.val();
        // Check ownership using both Firebase UID and Clerk ID for compatibility
        const isOwner = tokenData.ownerId === firebaseUid || tokenData.clerkUserId === userId;
        if (isOwner) {
          deletePromises.push(this.db.ref(`shareTokens/${child.key}`).remove());
          debug.log(DEBUG_CATEGORIES.STORAGE, `Queueing deletion of token: ${child.key.substring(0, 8)}...`);
        }
      });
      
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        debug.log(DEBUG_CATEGORIES.STORAGE, `Deleted ${deletePromises.length} share tokens for recipe ${recipeId}`);
        
        // Clear token cache since tokens were revoked
        shareTokenCache.clear(`token_${recipeId}`);
        debug.log(DEBUG_CATEGORIES.STORAGE, `Cleared token cache after revocation: ${recipeId}`);
      }
      
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'revokeAllShareTokens',
        recipeId
      });
      // Don't throw - this is often called as cleanup, shouldn't break main flow
    }
  }

  /**
   * Show toast notification (using existing pattern from app)
   * @param {string} message - The message to display
   * @param {string} type - The type of message (success, warning, error, info)
   */
  showToast(message, type = 'info') {
    // Dispatch custom event that will be handled by main app
    window.dispatchEvent(new CustomEvent('showToast', {
      detail: { message, type }
    }));
  }

  /**
   * Export recipe as JSON file
   */
  exportRecipeToFile(recipe) {
    try {
      const dataStr = JSON.stringify(recipe, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${recipe.name || 'recipe'}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'exportRecipeToFile'
      });
    }
  }

  /**
   * Check if the application is online and Firebase is accessible
   * @returns {boolean} - True if online and Firebase is initialized
   */
  isOnline() {
    // Check test flag first
    if (this._forceOffline) {
      return false;
    }
    
    // Check basic network connectivity
    if (!navigator.onLine) {
      return false;
    }
    
    // Check if Firebase is initialized
    if (!this.db) {
      return false;
    }
    
    // Additional check for Firebase connectivity could be added here
    // For now, trust navigator.onLine for immediate response
    return true;
  }
  
  /**
   * Set offline mode for testing
   * @param {boolean} offline - True to simulate offline mode
   */
  setTestOfflineMode(offline) {
    debug.log(DEBUG_CATEGORIES.OFFLINE, 'Setting test offline mode:', offline);
    this._forceOffline = offline;
    if (offline) {
      this.showToast('Test mode: Simulating offline', 'info');
      this.handleOffline();
    } else {
      this.showToast('Test mode: Back online', 'info');
      this.handleOnline();
    }
  }
  
  /**
   * Set timeout mode for testing - simulates slow/hanging Firebase operations
   * @param {boolean} timeout - True to force timeouts
   */
  setTestTimeoutMode(timeout) {
    debug.log(DEBUG_CATEGORIES.OFFLINE, 'Setting test timeout mode:', timeout);
    this._forceTimeout = timeout;
    if (timeout) {
      debug.warn(DEBUG_CATEGORIES.OFFLINE, 'Timeout test mode ENABLED - Firebase saves will timeout after 3 seconds');
      this.showToast('Test mode: Forcing timeouts (3s delay)', 'warning');
    } else {
      debug.log(DEBUG_CATEGORIES.OFFLINE, 'Timeout test mode DISABLED - Normal operation');
      this.showToast('Test mode: Normal operation restored', 'info');
    }
  }

  /**
   * Set up offline support with event listeners
   */
  setupOfflineSupport() {
    // Listen for online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // Load any queued actions from localStorage
    this.loadOfflineQueue();
  }

  /**
   * Handle when the application goes online
   */
  handleOnline() {
    this.showToast('Connection restored', 'success');
    // Process any queued offline actions
    this.processOfflineQueue();
  }

  /**
   * Handle when the application goes offline
   */
  handleOffline() {
    this.showToast('Working offline - changes will sync when reconnected', 'info');
  }

  /**
   * Queue an action for later processing when online
   * @param {Object} action - The action to queue
   */
  queueOfflineAction(action) {
    const queuedAction = {
      ...action,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now()
    };
    
    debug.log(DEBUG_CATEGORIES.OFFLINE, 'Queuing offline action:', queuedAction);
    
    this.offlineQueue.push(queuedAction);
    this.saveOfflineQueue();
    
    return queuedAction.id;
  }

  /**
   * Save the offline queue to localStorage
   */
  saveOfflineQueue() {
    try {
      localStorage.setItem('offlineQueue', JSON.stringify(this.offlineQueue));
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'saveOfflineQueue'
      });
    }
  }

  /**
   * Load the offline queue from localStorage
   */
  loadOfflineQueue() {
    try {
      const queueData = localStorage.getItem('offlineQueue');
      if (queueData) {
        this.offlineQueue = JSON.parse(queueData);
        // Clean up old entries (older than 7 days)
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        this.offlineQueue = this.offlineQueue.filter(action => 
          action.timestamp > sevenDaysAgo
        );
        this.saveOfflineQueue();
      }
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'StorageManager',
        method: 'loadOfflineQueue'
      });
      this.offlineQueue = [];
    }
  }

  /**
   * Process all queued offline actions
   */
  async processOfflineQueue() {
    debug.group(DEBUG_CATEGORIES.OFFLINE, 'Processing Offline Queue', () => {
      debug.log(DEBUG_CATEGORIES.OFFLINE, 'Queue length:', this.offlineQueue.length);
      debug.log(DEBUG_CATEGORIES.OFFLINE, 'Is processing?', this.isProcessingQueue);
      debug.log(DEBUG_CATEGORIES.OFFLINE, 'Is online?', this.isOnline());
      debug.log(DEBUG_CATEGORIES.OFFLINE, 'Navigator online?', navigator.onLine);
      debug.log(DEBUG_CATEGORIES.OFFLINE, 'Firebase DB?', this.db !== null);
    });
    
    if (this.isProcessingQueue || this.offlineQueue.length === 0) {
      debug.warn(DEBUG_CATEGORIES.OFFLINE, 'Queue empty or already processing');
      return;
    }
    
    if (!this.isOnline()) {
      debug.warn(DEBUG_CATEGORIES.OFFLINE, 'Not online, skipping queue processing');
      return;
    }
    
    // Make sure Firebase is initialized before processing
    if (!this.db) {
      debug.log(DEBUG_CATEGORIES.OFFLINE, 'Firebase not initialized, initializing now...');
      await this.init();
    }
    
    this.isProcessingQueue = true;
    const queue = [...this.offlineQueue];
    const loadingId = 'syncQueue';
    
    debug.log(DEBUG_CATEGORIES.OFFLINE, 'Processing queue with', queue.length, 'items');
    
    // Show loading for queue processing
    if (queue.length > 0) {
      try {
        loadingManager.showLoading(`Syncing ${queue.length} queued item(s)...`, loadingId);
      } catch (e) {
        debug.error(DEBUG_CATEGORIES.LOADING, 'Failed to show loading:', e);
      }
    }
    
    let successCount = 0;
    for (const action of queue) {
      try {
        debug.log(DEBUG_CATEGORIES.OFFLINE, `Processing action ${successCount + 1}/${queue.length}:`, action.type);
        
        if (loadingManager && loadingManager.updateLoadingMessage) {
          loadingManager.updateLoadingMessage(`Syncing item ${successCount + 1} of ${queue.length}...`, loadingId);
        }
        
        await this.processOfflineAction(action);
        successCount++;
        
        // Remove from queue after successful processing
        this.offlineQueue = this.offlineQueue.filter(a => a.id !== action.id);
        this.saveOfflineQueue();
        
        debug.log(DEBUG_CATEGORIES.OFFLINE, 'Action processed successfully');
      } catch (error) {
        debug.error(DEBUG_CATEGORIES.OFFLINE, 'Failed to process action:', error);
        errorHandler.handleError(error, {
          component: 'StorageManager',
          method: 'processOfflineQueue',
          action: action.type
        });
        // Keep failed actions in queue for retry
      }
    }
    
    // Hide loading
    try {
      loadingManager.hideLoading(loadingId);
    } catch (e) {
      debug.error(DEBUG_CATEGORIES.LOADING, 'Failed to hide loading:', e);
    }
    
    this.isProcessingQueue = false;
    
    debug.log(DEBUG_CATEGORIES.OFFLINE, `Queue processing complete. Success: ${successCount}/${queue.length}`);
    
    if (this.offlineQueue.length === 0 && successCount > 0) {
      const message = `✅ Successfully synced ${successCount} recipe(s) to cloud`;
      debug.log(DEBUG_CATEGORIES.OFFLINE, message);
      this.showToast(message, 'success');
      
      // Dispatch event to notify other components that recipes were synced
      window.dispatchEvent(new CustomEvent(EVENTS.OFFLINE_QUEUE_PROCESSED, {
        detail: { 
          syncedCount: successCount,
          totalProcessed: queue.length
        }
      }));
    } else if (this.offlineQueue.length > 0) {
      const message = `⚠️ Synced ${successCount} items, ${this.offlineQueue.length} still pending`;
      debug.log(DEBUG_CATEGORIES.OFFLINE, message);
      this.showToast(message, 'warning');
    }
  }

  /**
   * Process a single offline action
   * @param {Object} action - The action to process
   */
  async processOfflineAction(action) {
    switch (action.type) {
      case 'saveRecipe':
        debug.log(DEBUG_CATEGORIES.OFFLINE, 'Processing queued save:', action.data);
        // Force online save (we're processing queue so we must be online)
        // Make sure we're not in offline/timeout mode
        this._forceOffline = false;
        this._forceTimeout = false;
        
        // Pass fromQueue flag to prevent re-queuing
        const options = { ...action.data.options, fromQueue: true };
        const result = await this.saveRecipe(action.data.recipe, options);
        // Don't show individual toasts - processOfflineQueue will show summary
        debug.log(DEBUG_CATEGORIES.OFFLINE, 'Recipe synced:', result);
        break;
      case 'deleteRecipe':
        await this.deleteRecipe(action.data.recipeId);
        break;
      case 'updatePrivacy':
        await this.updateRecipePrivacy(action.data.recipeId, action.data.privacy);
        break;
      default:
        throw new Error(`Unknown offline action type: ${action.type}`);
    }
  }

  /**
   * Save recipe with offline support
   * @param {Object} recipe - The recipe to save
   * @param {Object} options - Save options
   * @returns {Promise<Object>} - Object with {id: string, offline: boolean}
   */
  async saveRecipeWithOfflineSupport(recipe, options = {}) {
    // Don't check isOnline if we're testing timeout - we want to reach the timeout logic
    if (!this._forceTimeout && !this.isOnline()) {
      const queueId = this.queueOfflineAction({
        type: 'saveRecipe',
        data: { recipe, options }
      });
      return { id: queueId, offline: true };
    }
    
    return this.saveRecipe(recipe, options);
  }
  
  /**
   * Save recipe with duplicate checking
   * @param {Object} recipe - The recipe to save
   * @param {Object} options - Save options
   * @returns {Promise<Object>} - Object with {id: string, offline: boolean, action: string}
   */
  async saveRecipeWithDuplicateCheck(recipe, options = {}) {
    try {
      debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Checking for duplicate recipe:', recipe.name);
      
      // Skip duplicate check if offline or if processing queue
      if (!navigator.onLine || this._forceOffline || options.fromQueue) {
        debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Skipping duplicate check (offline or from queue)');
        const result = await this.saveRecipeWithOfflineSupport(recipe, options);
        return { ...result, action: 'created' };
      }
      
      // Initialize Firebase if needed
      if (!this.db) {
        debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Initializing Firebase for duplicate check...');
        await this.init();
      }
      
      // Check for existing recipe with same name
      const duplicateCheck = await this.checkForExistingRecipe(recipe);
      debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Duplicate check result:', duplicateCheck);
      
      if (duplicateCheck.exists) {
        if (!duplicateCheck.isDifferent) {
          // Recipe is identical - no need to save
          debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Recipe identical, skipping save');
          this.showToast('Recipe already saved (no changes detected)', 'info');
          return { 
            id: duplicateCheck.existingId, 
            offline: false, 
            action: 'skipped' 
          };
        }
        
        debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Recipe exists with differences, prompting user...');
        // Recipe exists but is different - ask user what to do
        const userChoice = await this.promptDuplicateAction(recipe.name);
        debug.log(DEBUG_CATEGORIES.DUPLICATE, 'User choice:', userChoice);
        
        if (userChoice === 'update') {
          // Update existing recipe
          recipe.id = duplicateCheck.existingId; // Use existing ID
          const result = await this.saveRecipeWithOfflineSupport(recipe, options);
          return { ...result, action: 'updated' };
        } else if (userChoice === 'new') {
          // Save as new recipe with modified name
          recipe.name = this.generateUniqueName(recipe.name);
          const result = await this.saveRecipeWithOfflineSupport(recipe, options);
          return { ...result, action: 'created' };
        } else {
          // User cancelled
          return { id: null, offline: false, action: 'cancelled' };
        }
      }
      
      debug.log(DEBUG_CATEGORIES.DUPLICATE, 'No duplicate found, saving new recipe');
      // No duplicate - save normally
      const result = await this.saveRecipeWithOfflineSupport(recipe, options);
      return { ...result, action: 'created' };
    } catch (error) {
      debug.error(DEBUG_CATEGORIES.DUPLICATE, 'Error in saveRecipeWithDuplicateCheck:', error);
      // Fallback to normal save if duplicate check fails
      this.showToast('Warning: Could not check for duplicates', 'warning');
      const result = await this.saveRecipeWithOfflineSupport(recipe, options);
      return { ...result, action: 'created' };
    }
  }
  
  /**
   * Prompt user for duplicate action
   * @param {string} recipeName - Name of the duplicate recipe
   * @returns {Promise<string>} - 'update', 'new', or 'cancel'
   */
  async promptDuplicateAction(recipeName) {
    return new Promise((resolve, reject) => {
      try {
        debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Creating duplicate recipe modal for:', recipeName);
        
        // Create a custom modal with standardized classes
        const modal = document.createElement('div');
        modal.className = 'modal-base modal-standard duplicate-recipe-modal';
        modal.innerHTML = `
          <div class="modal-content">
            <h3>Recipe "${recipeName}" Already Exists</h3>
            <p>A recipe with this name already exists but has different content. What would you like to do?</p>
            <div class="modal-buttons">
              <button id="update-recipe" class="btn btn--primary icon-button">
                ${LucideIcons.createInline('alert-triangle', 'Update Existing Recipe', 18)}
              </button>
              <button id="save-as-new" class="btn btn--success icon-button">
                ${LucideIcons.createInline('copy-plus', 'Save as New Recipe', 18)}
              </button>
              <button id="cancel-save" class="btn">Cancel</button>
            </div>
          </div>
        `;
        
        debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Modal created, adding to DOM...');
        document.body.appendChild(modal);
        
        // Show the modal using standardized visibility classes
        requestAnimationFrame(() => {
          modal.classList.add('modal-visible');
          modal.classList.remove('modal-hidden');
        });
        
        debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Modal added to DOM successfully');
        
        // Render Lucide icons
        LucideIcons.render(modal);
        
        // Function to clean up and resolve
        const cleanupAndResolve = (value) => {
          debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Cleaning up modal, user chose:', value);
          try {
            // Hide modal with animation
            modal.classList.add('modal-hidden');
            modal.classList.remove('modal-visible');
            
            // Remove from DOM after animation
            setTimeout(() => {
              if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
              }
            }, 300);
            
            resolve(value);
          } catch (error) {
            debug.error(DEBUG_CATEGORIES.DUPLICATE, 'Error cleaning up modal:', error);
            resolve(value); // Still resolve even if cleanup fails
          }
        };
        
        // Add event listeners with error handling
        const updateBtn = document.getElementById('update-recipe');
        const newBtn = document.getElementById('save-as-new');
        const cancelBtn = document.getElementById('cancel-save');
        
        if (updateBtn) {
          updateBtn.addEventListener('click', () => cleanupAndResolve('update'));
        } else {
          debug.error(DEBUG_CATEGORIES.DUPLICATE, 'Update button not found');
        }
        
        if (newBtn) {
          newBtn.addEventListener('click', () => cleanupAndResolve('new'));
        } else {
          debug.error(DEBUG_CATEGORIES.DUPLICATE, 'New button not found');
        }
        
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => cleanupAndResolve('cancel'));
        } else {
          debug.error(DEBUG_CATEGORIES.DUPLICATE, 'Cancel button not found');
        }
        
        // Add click outside to cancel (click on modal background, not content)
        modal.addEventListener('click', (e) => {
          if (e.target === modal) {
            cleanupAndResolve('cancel');
          }
        });
        
        debug.log(DEBUG_CATEGORIES.DUPLICATE, 'Event listeners added successfully');
        
      } catch (error) {
        debug.error(DEBUG_CATEGORIES.DUPLICATE, 'Error creating duplicate modal:', error);
        // Fallback to confirm dialog
        const userWantsUpdate = confirm(
          `Recipe "${recipeName}" already exists with different content.\n\n` +
          'Click OK to update the existing recipe, or Cancel to save as a new recipe.'
        );
        resolve(userWantsUpdate ? 'update' : 'new');
      }
    });
  }
  
  /**
   * Generate a unique name for a duplicate recipe
   * @param {string} originalName - Original recipe name
   * @returns {string} - Unique name with suffix
   */
  generateUniqueName(originalName) {
    const timestamp = new Date().toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${originalName} (${timestamp})`;
  }

  /**
   * Debounced save recipe - delays saving to prevent rapid successive saves
   * @param {Object} recipe - The recipe to save
   * @param {Object} options - Save options
   * @returns {Promise<string>} - Promise that resolves with recipe ID
   */
  debouncedSave(recipe, options = {}) {
    // Clear any existing timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    
    // Store the pending save
    this.pendingSave = { recipe, options };
    
    // Show immediate feedback that save is pending
    this.showToast('Saving in progress...', 'info');
    
    // Return a promise that will resolve when the save completes
    return new Promise((resolve, reject) => {
      this.saveDebounceTimer = setTimeout(async () => {
        try {
          const result = await this.saveRecipeWithOfflineSupport(
            this.pendingSave.recipe,
            this.pendingSave.options
          );
          this.pendingSave = null;
          this.saveDebounceTimer = null;
          
          // Show appropriate toast based on save status
          if (result.offline) {
            this.showToast('Recipe saved locally - will sync when online', 'info');
          } else {
            this.showToast('Recipe saved successfully!', 'success');
          }
          
          resolve(result);
        } catch (error) {
          this.pendingSave = null;
          this.saveDebounceTimer = null;
          reject(error);
        }
      }, this.rateLimitConfig.enabled ? this.rateLimitConfig.delay : 0);
    });
  }

  /**
   * Configure rate limiting settings
   * @param {Object} config - Rate limit configuration
   * @param {boolean} config.enabled - Enable/disable rate limiting
   * @param {number} config.delay - Delay in milliseconds
   * @param {number} config.maxRetries - Maximum retry attempts
   */
  configureRateLimit(config) {
    this.rateLimitConfig = {
      ...this.rateLimitConfig,
      ...config
    };
    
    // Update debounce delay if provided
    if (config.delay !== undefined) {
      this.saveDebounceDelay = config.delay;
    }
  }

  /**
   * Cancel any pending debounced save
   */
  cancelPendingSave() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
      this.pendingSave = null;
      this.showToast('Save cancelled', 'info');
    }
  }

  /**
   * Force immediate save of any pending changes
   * @returns {Promise<Object|null>} - Save result if save was pending, null otherwise
   */
  async forceSave() {
    if (this.pendingSave && this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
      
      try {
        const result = await this.saveRecipeWithOfflineSupport(
          this.pendingSave.recipe,
          this.pendingSave.options
        );
        this.pendingSave = null;
        
        // Show appropriate toast based on save status
        if (result.offline) {
          this.showToast('Recipe saved locally - will sync when online', 'info');
        } else {
          this.showToast('Recipe saved successfully!', 'success');
        }
        
        return result;
      } catch (error) {
        this.pendingSave = null;
        throw error;
      }
    }
    return null;
  }

  /**
   * Check if there's a pending save
   * @returns {boolean} - True if save is pending
   */
  hasPendingSave() {
    return this.pendingSave !== null;
  }

  /**
   * Get cached data from localStorage with expiry check
   * @param {string} key - Cache key
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {any|null} - Cached data or null if expired/missing
   */
  getCachedData(key, maxAge) {
    try {
      const cached = localStorage.getItem(`cache_${key}`);
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp > maxAge) {
        localStorage.removeItem(`cache_${key}`);
        return null;
      }
      
      return data;
    } catch (error) {
      debug.warn(DEBUG_CATEGORIES.STORAGE, 'Failed to get cached data:', error);
      return null;
    }
  }

  /**
   * Set cached data in localStorage with timestamp
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   */
  setCachedData(key, data) {
    try {
      localStorage.setItem(`cache_${key}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      debug.warn(DEBUG_CATEGORIES.STORAGE, 'Cache storage failed:', error);
    }
  }

  /**
   * List all saved recipes for the current user with caching
   * @param {boolean} fastMode - Use optimized session check for initial load
   * @param {boolean} forceRefresh - Force refresh from Firebase, ignoring cache
   * @returns {Promise<Array>} - Array of recipe summaries
   */
  async listRecipesWithCache(fastMode = false, forceRefresh = false) {
    const userId = this.getEffectiveUserId();
    if (!userId) {
      return []; // Return empty array if not signed in
    }

    const cacheKey = `recipes_cache_${userId}`;
    const cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    // Check cache first unless forcing refresh
    if (!forceRefresh) {
      const cached = this.getCachedData(cacheKey, cacheExpiry);
      if (cached) {
        debug.log(DEBUG_CATEGORIES.STORAGE, 'Using cached recipes data');
        return cached;
      }
    }
    
    // Fetch from Firebase with summary-only data
    const recipes = await this.listRecipesSummaryOnly(fastMode);
    
    // Cache the results
    this.setCachedData(cacheKey, recipes);
    
    return recipes;
  }

  /**
   * List recipes with summary data only (optimized for performance)
   * @param {boolean} fastMode - Use optimized session check for initial load
   * @returns {Promise<Array>} - Array of recipe summaries
   */
  async listRecipesSummaryOnly(fastMode = false) {
    await this.init();
    
    if (fastMode) {
      await this.ensureValidSessionFast();
    } else {
      await this.ensureValidSession();
    }
    
    const userId = this.getEffectiveUserId();
    if (!userId) return [];
    
    try {
      // Fetch only summary fields to reduce data transfer
      const snapshot = await this.db.ref(`users/${userId}/recipes`)
        .orderByChild('savedAt')
        .limitToLast(50) // Limit initial load
        .once('value');
        
      const recipes = snapshot.val() || {};
      
      return Object.values(recipes).map(recipe => ({
        id: recipe.id,
        name: recipe.name || 'Unnamed Recipe',
        style: recipe.style || 'Unknown Style',
        savedAt: recipe.savedAt,
        privacy: recipe.privacy || this.getDefaultPrivacyLevel(),
        og: recipe.og,
        fg: recipe.fg,
        abv: recipe.abv,
        ibu: recipe.ibu
        // Note: Full recipe data loaded on-demand when needed
      }));
    } catch (error) {
      errorHandler.handleError(error, { component: 'StorageManager', method: 'listRecipesSummaryOnly' });
      return [];
    }
  }
}

// Export the class for testing
export { StorageManager };

// Create and export singleton instance
export const storageManager = new StorageManager();

// Expose to window for testing/debugging
if (typeof window !== 'undefined') {
  window.storageManager = storageManager;
  
  // Expose the duplicate check method for testing
  window.testDuplicateCheck = async (recipeName) => {
    const testRecipe = { name: recipeName, og: 1.050, fg: 1.010 };
    return await storageManager.checkForExistingRecipe(testRecipe);
  };
}