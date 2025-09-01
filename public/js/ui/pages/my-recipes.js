/**
 * My Recipes Page Component
 * Displays and manages saved recipes from Firebase
 */

import { storageManager } from '../../storage/storage-manager.js';
import { errorHandler } from '../../utilities/errors/error-handler.js';
import { EVENTS } from '../../core/constants.js';
import { clerkAuth } from '../../auth/clerk-config.js';
import { debug, DEBUG_CATEGORIES } from '../../utilities/debug.js';
import { domBatcher, modalManager, debounce, performanceMonitor } from '../../utilities/performance/sharing-performance.js';
import { UploadModal } from '../components/upload-modal.js';
import { LucideIcons } from '../components/lucide-icons.js';
import { TIMING } from '../../core/timing-constants.js';

export class MyRecipesPage {
  constructor() {
    this.recipes = [];
    this.container = null;
    this.floatingUploadBtn = null;
    this.uploadModal = new UploadModal();
    
    // Initialize image loading coordination variables
    this.loadedImages = new Map();
    this.expectedImageCount = 0;
    this.imagesRevealed = false;
    
    // Create debounced versions of performance-sensitive methods
    this.debouncedShareRecipe = debounce(this.shareRecipe.bind(this), 300);
    this.debouncedChangePrivacyAndShare = debounce(this.changePrivacyAndShare.bind(this), 500);
    this.debouncedGenerateNewLink = debounce(this.generateNewShareLink.bind(this), 300);
  }

  /**
   * Initialize the My Recipes page
   */
  init() {
    this.container = document.getElementById('my-recipes-page');
    this.createFloatingUploadButton();
    this.uploadModal.init();
    this.setupEventListeners();
  }

  /**
   * Create floating upload button
   */
  createFloatingUploadButton() {
    // Create floating upload button
    this.floatingUploadBtn = document.createElement('button');
    this.floatingUploadBtn.id = 'floatingUploadBtn';
    this.floatingUploadBtn.className = 'btn btn--primary btn--floating btn--upload no-print';
    this.floatingUploadBtn.innerHTML = LucideIcons.create('file-up', '', 28);
    this.floatingUploadBtn.classList.add('u-hidden');
    this.floatingUploadBtn.title = 'Upload Recipe';
    document.body.appendChild(this.floatingUploadBtn);
    
    // Render Lucide icons
    LucideIcons.render(this.floatingUploadBtn);
    
    // Add click event listener - open upload modal for logged-in users
    this.floatingUploadBtn.addEventListener('click', () => {
      if (clerkAuth.isUserSignedIn()) {
        this.uploadModal.show();
      } else {
        // Fallback to navigation for unauthenticated users
        window.dispatchEvent(new Event(EVENTS.BACK_TO_UPLOAD));
      }
    });
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Listen for offline queue processing completion
    window.addEventListener(EVENTS.OFFLINE_QUEUE_PROCESSED, (e) => {
      console.log('🔄 Offline queue processed, refreshing My Recipes page...', e.detail);
      // Only refresh if we're currently on the My Recipes page
      if (this.container && this.container.classList.contains('active')) {
        this.loadRecipes();
      }
    });
  }

  /**
   * Show the My Recipes page immediately with loading state, then load recipes in background
   */
  async showWithLoadingState() {
    if (!this.container) {
      this.init();
    }

    // Show floating upload button
    if (this.floatingUploadBtn) {
      this.floatingUploadBtn.classList.remove('u-hidden');
      this.floatingUploadBtn.classList.add('u-flex');
    }

    // Show loading state in the recipes container
    this.showLoadingState();

    // ENHANCED: Check for cached user data for optimistic loading
    if (clerkAuth.isUserSignedIn()) {
      await this.loadRecipes();
    } else {
      // Before showing sign-in prompt, check if we have cached recipes from previous session
      const userId = this.tryGetCachedUserId();
      if (userId) {
        debug.log(DEBUG_CATEGORIES.LOADING, 'showWithLoadingState: Found cached user ID, proceeding optimistically');
        await this.loadRecipes();
      } else {
        this.showSignInPrompt();
      }
    }
  }

  /**
   * Show loading state in the recipes container (using skeleton cards for better UX)
   */
  showLoadingState() {
    const recipesGrid = document.getElementById('recipesList');
    if (!recipesGrid) return;

    // Use skeleton cards instead of generic spinner to show structure while loading
    this.showSkeletonCards(recipesGrid);
  }

  /**
   * Show the My Recipes page and load recipes
   */
  async show(skipPageSwitching = false) {
    if (!this.container) {
      this.init();
    }

    // Show the page (unless page switching is already handled externally)
    if (!skipPageSwitching) {
      document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
      });
      this.container.classList.add('active');
    }
    
    // Show floating upload button
    if (this.floatingUploadBtn) {
      this.floatingUploadBtn.classList.remove('u-hidden');
      this.floatingUploadBtn.classList.add('u-flex');
    }

    // Check if user is signed in OR has cached recipes (optimistic loading)
    if (!clerkAuth.isUserSignedIn()) {
      // Before showing sign-in prompt, check if we have cached recipes from previous session
      const userId = this.tryGetCachedUserId();
      if (!userId) {
        this.showSignInPrompt();
        return;
      }
      // User has cached data, proceed optimistically and let auth catch up in background
      debug.log(DEBUG_CATEGORIES.LOADING, 'Proceeding optimistically with cached user data while auth loads');
    }

    // Load and display recipes
    await this.loadRecipes();
  }

  /**
   * Show sign-in prompt for unauthenticated users
   */
  showSignInPrompt() {
    const recipesList = document.getElementById('recipesList');
    const emptyState = document.getElementById('emptyState');
    
    if (recipesList) {
      recipesList.innerHTML = `
        <div class="sign-in-prompt">
          <h3>Sign In Required</h3>
          <p>Please sign in to view your saved recipes.</p>
          <button onclick="window.headerManager?.dropdown?.signIn?.click()" class="btn btn--primary">
            🔑 Sign In
          </button>
        </div>
      `;
    }
    
    if (emptyState) {
      emptyState.classList.add('u-hidden');
    }
  }

  /**
   * Hide the My Recipes page
   */
  hide() {
    if (this.container) {
      this.container.classList.remove('active');
    }
    
    // Hide floating upload button
    if (this.floatingUploadBtn) {
      this.floatingUploadBtn.classList.remove('u-flex');
      this.floatingUploadBtn.classList.add('u-hidden');
    }
  }

  /**
   * STREAMING SOLUTION: Progressive Data Loading with immediate interactivity
   * Each recipe becomes clickable as soon as it loads (vs waiting for all recipes)
   */
  async loadRecipes() {
    const recipesList = document.getElementById('recipesList');
    const emptyState = document.getElementById('emptyState');

    if (!recipesList) return;

    // Show skeleton cards for perceived performance
    this.showSkeletonCards(recipesList);
    emptyState.classList.add('u-hidden');

    let recipeCount = 0;
    let firstRecipeTime = null;
    this.recipes = []; // Reset recipes array

    try {
      let userId = clerkAuth.getFirebaseUserId();
      
      // If Clerk isn't ready yet, try to get user ID from cache for optimistic loading
      if (!userId) {
        userId = this.tryGetCachedUserId();
        if (!userId) {
          this.showSignInPrompt();
          return;
        }
        debug.log(DEBUG_CATEGORIES.LOADING, `Using cached user ID for optimistic loading: ${userId}`);
      }

      const loadStartTime = performance.now();

      // HYPER-OPTIMIZED: Try cache-first approach with progressive display
      const cachedRecipes = this.tryLoadFromCache(userId);
      if (cachedRecipes && cachedRecipes.length > 0) {
        // Show cached recipes PROGRESSIVELY for smooth user experience
        firstRecipeTime = performance.now() - loadStartTime;
        debug.log(DEBUG_CATEGORIES.STORAGE, `⚡ CACHE HIT - PROGRESSIVE DISPLAY FROM CACHE: ${firstRecipeTime.toFixed(1)}ms`);
        
        // CRITICAL: Set recipes array immediately to prevent empty state flash
        this.recipes = [...cachedRecipes];
        
        // Initialize image coordination for streaming recipes
        this.loadedImages.clear();
        this.expectedImageCount = cachedRecipes.length;
        this.imagesRevealed = false;
        
        // Set up fallback timeout for coordinated image reveal
        setTimeout(() => {
          if (!this.imagesRevealed && this.loadedImages.size > 0) {
            debug.log(DEBUG_CATEGORIES.UI, `🖼️ ⏰ Timeout reached, revealing ${this.loadedImages.size}/${this.expectedImageCount} loaded images`);
            this.imagesRevealed = true;
            this.revealAllImagesInSequence();
          }
        }, 3000);
        
        // Hide empty state immediately since we have cached recipes
        const emptyState = document.getElementById('emptyState');
        if (emptyState) {
          emptyState.classList.add('u-hidden');
        }
        
        // Display recipes progressively with slight delay for smooth animation
        cachedRecipes.forEach((recipe, index) => {
          setTimeout(() => {
            const replaceStartTime = performance.now();
            this.replaceSkeletonWithRecipe(recipe, index);
            const replaceEndTime = performance.now();
            
            recipeCount++;
            
            const displayTime = performance.now() - loadStartTime;
            debug.log(DEBUG_CATEGORIES.STORAGE, `Cache recipe ${recipeCount} displayed at ${displayTime.toFixed(1)}ms: ${recipe.name} (replace took ${(replaceEndTime - replaceStartTime).toFixed(1)}ms)`);
            
            // Log first meaningful interaction
            if (recipeCount === 1) {
              debug.log(DEBUG_CATEGORIES.STORAGE, `🎯 FIRST CACHED RECIPE INTERACTIVE: ${displayTime.toFixed(1)}ms`);
            }
          }, index * 50); // 50ms stagger between recipes for smooth progressive loading
        });
        
        // Start Intersection Observer for Firebase image loading after DOM elements are created
        setTimeout(() => {
          this.loadRecipeImages();
        }, Math.max(50, cachedRecipes.length * 50 + 50)); // Wait for all staggered cards to be created
        
        // Load fresh data in background to update any changes
        storageManager.loadRecipesStreaming(userId, null).then(freshRecipes => {
          // Only update if recipe count or IDs changed (ignore timestamp differences)
          const cacheIds = cachedRecipes.map(r => r.id).sort();
          const freshIds = freshRecipes.map(r => r.id).sort();
          const hasStructuralChanges = JSON.stringify(cacheIds) !== JSON.stringify(freshIds);
          
          if (hasStructuralChanges) {
            debug.log(DEBUG_CATEGORIES.STORAGE, 'Recipe structure changed, updating with fresh data');
            this.updateWithFreshRecipes(freshRecipes);
          } else {
            debug.log(DEBUG_CATEGORIES.STORAGE, 'Fresh data identical to cache, no DOM update needed');
          }
        }).catch(error => {
          debug.warn(DEBUG_CATEGORIES.STORAGE, 'Background fresh data load failed:', error);
        });
      } else {
        // No cache - use streaming approach
        const streamedRecipes = await storageManager.loadRecipesStreaming(userId, (recipe, index) => {
          recipeCount++;
          
          // Track time to first interactive recipe
          if (recipeCount === 1) {
            firstRecipeTime = performance.now() - loadStartTime;
            debug.log(DEBUG_CATEGORIES.STORAGE, `🎯 FIRST RECIPE INTERACTIVE: ${firstRecipeTime.toFixed(1)}ms`);
          }
          
          // Add recipe to our array
          this.recipes.push(recipe);
          
          // Replace skeleton with interactive recipe card IMMEDIATELY
          this.replaceSkeletonWithRecipe(recipe, index);
          
          // Performance monitoring
          const totalLoadTime = performance.now() - loadStartTime;
          debug.log(DEBUG_CATEGORIES.STORAGE, `Recipe ${recipeCount} interactive at ${totalLoadTime.toFixed(1)}ms: ${recipe.name}`);
        });
      }

      // Sort recipes by saved date (newest first) 
      this.recipes.sort((a, b) => {
        const dateA = new Date(a.savedAt || 0);
        const dateB = new Date(b.savedAt || 0);
        return dateB - dateA;
      });

      // Remove any remaining skeletons
      this.clearRemainingSkeletons();

      const totalTime = performance.now() - loadStartTime;
      debug.log(DEBUG_CATEGORIES.STORAGE, `🚀 STREAMING COMPLETE: ${recipeCount} recipes, first interactive in ${firstRecipeTime?.toFixed(1) || 0}ms, total ${totalTime.toFixed(1)}ms`);

      // Only show empty state if we truly have no recipes (check actual recipes array, not display count)
      if (this.recipes.length === 0) {
        // Show empty state
        recipesList.innerHTML = '';
        emptyState.classList.remove('u-hidden');
        emptyState.classList.add('u-block');
      } else {
        // Ensure empty state stays hidden when we have recipes
        emptyState.classList.add('u-hidden');
        emptyState.classList.remove('u-block');
      }

    } catch (error) {
      this.showErrorState(recipesList);
      errorHandler.handleError(error, {
        component: 'MyRecipesPage',
        method: 'loadRecipes'
      });
    }
  }

  /**
   * Phase 3: Show skeleton loading cards for better perceived performance
   */
  showSkeletonCards(container) {
    const skeletonHTML = Array(6).fill(0).map(() => `
      <div class="recipe-card skeleton-card">
        <div class="skeleton-content">
          <div class="skeleton-header">
            <div class="skeleton-title"></div>
            <div class="skeleton-date"></div>
          </div>
          <div class="skeleton-body">
            <div class="skeleton-style"></div>
            <div class="skeleton-actions">
              <div class="skeleton-button"></div>
              <div class="skeleton-button"></div>
            </div>
          </div>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = skeletonHTML;
  }

  /**
   * Try to get user ID from cached recipe data (for optimistic loading)
   */
  tryGetCachedUserId() {
    try {
      const recipeCachePattern = /^quick_cache_recipes_(user_.+)$/;
      for (const key of Object.keys(localStorage)) {
        const match = key.match(recipeCachePattern);
        if (match) {
          const userId = match[1];
          const cached = localStorage.getItem(key);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (parsed.recipes && parsed.recipes.length > 0) {
                debug.log(DEBUG_CATEGORIES.AUTH, `Found cached user ID from recipes: ${userId}`);
                return userId;
              }
            } catch (e) {
              // Ignore invalid cache entries
            }
          }
        }
      }
      return null;
    } catch (error) {
      debug.warn(DEBUG_CATEGORIES.AUTH, 'Failed to get cached user ID:', error);
      return null;
    }
  }

  /**
   * HYPER-OPTIMIZATION: Try to load recipes from in-memory cache for instant display
   */
  tryLoadFromCache(userId) {
    try {
      // DEBUG: Check what image keys are in localStorage
      const imageKeys = Object.keys(localStorage).filter(key => key.startsWith('recipe_image_'));
      if (imageKeys.length > 0) {
        debug.log(DEBUG_CATEGORIES.STORAGE, `📷 Found ${imageKeys.length} cached images: ${imageKeys.join(', ')}`);
      }
      
      // Try to get recipes from storage manager's memory cache
      const cached = storageManager.getCachedRecipeSummaries(userId);
      if (cached && cached.length > 0) {
        debug.log(DEBUG_CATEGORIES.STORAGE, `Found ${cached.length} recipes in memory cache`);
        return cached;
      }
      
      // Try localStorage cache as fallback
      const localKey = `quick_cache_recipes_${userId}`;
      const localCached = localStorage.getItem(localKey);
      if (localCached) {
        try {
          const parsed = JSON.parse(localCached);
          if (parsed.timestamp && (Date.now() - parsed.timestamp) < 30000) { // 30 second cache
            debug.log(DEBUG_CATEGORIES.STORAGE, `Found ${parsed.recipes.length} recipes in localStorage cache`);
            return parsed.recipes;
          }
        } catch (e) {
          localStorage.removeItem(localKey);
        }
      }
      
      return null;
    } catch (error) {
      debug.warn(DEBUG_CATEGORIES.STORAGE, 'Cache lookup failed:', error);
      return null;
    }
  }

  /**
   * HYPER-OPTIMIZATION: Update with fresh recipes if cache was stale
   */
  updateWithFreshRecipes(freshRecipes) {
    // Clear current recipes and rebuild with fresh data
    this.recipes = [];
    const recipesList = document.getElementById('recipesList');
    recipesList.innerHTML = '';
    
    // Show fresh recipes
    freshRecipes.forEach((recipe, index) => {
      this.recipes.push(recipe);
      const recipeElement = this.createInteractiveRecipeCard(recipe);
      recipesList.appendChild(recipeElement);
      this.attachRecipeCardEvents(recipe.id);
      this.loadSingleRecipeImageById(recipe.id);
    });
  }

  /**
   * STREAMING SOLUTION: Replace specific skeleton with interactive recipe card
   */
  replaceSkeletonWithRecipe(recipe, index) {
    const skeletonCards = document.querySelectorAll('.skeleton-card');
    const targetSkeleton = skeletonCards[index];
    
    if (!targetSkeleton) {
      // No skeleton to replace, append to container
      const recipesList = document.getElementById('recipesList');
      const recipeElement = this.createInteractiveRecipeCard(recipe);
      recipesList.appendChild(recipeElement);
    } else {
      // Replace skeleton with interactive recipe
      const recipeElement = this.createInteractiveRecipeCard(recipe);
      
      // ANIMATION FIX: Use requestAnimationFrame to ensure consistent rendering
      requestAnimationFrame(() => {
        targetSkeleton.replaceWith(recipeElement);
      });
    }
    
    // Add event listeners immediately for interactivity
    this.attachRecipeCardEvents(recipe.id);
    
    // Load recipe image on-demand
    this.loadSingleRecipeImageById(recipe.id);
  }

  /**
   * STREAMING SOLUTION: Create immediately interactive recipe card
   */
  createInteractiveRecipeCard(recipe) {
    const cardElement = document.createElement('div');
    cardElement.className = 'recipe-card recipe-card--interactive';
    cardElement.dataset.recipeId = recipe.id;
    cardElement.dataset.needsImage = 'true';
    cardElement.innerHTML = this.createRecipeCardHTML(recipe);
    
    // Mark as interactive immediately with visual feedback
    cardElement.classList.add('recipe--interactive', 'recipe--stream-loaded');
    
    // Start with hidden state for fade-in transition
    cardElement.style.opacity = '0';
    cardElement.style.transform = 'translateY(20px)';
    
    // Mark as animated immediately to prevent conflicts
    cardElement.dataset.animated = 'true';
    
    // Use double requestAnimationFrame for more reliable timing
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        debug.log(DEBUG_CATEGORIES.UI, `🎬 Triggering fade-in for ${recipe.name} (${recipe.id})`);
        cardElement.classList.add('card-fade-in');
        // Force style recalculation to ensure animation triggers
        cardElement.offsetHeight;
        
        // Verify animation state
        setTimeout(() => {
          const computedOpacity = window.getComputedStyle(cardElement).opacity;
          debug.log(DEBUG_CATEGORIES.UI, `🎬 Animation check for ${recipe.name}: opacity=${computedOpacity}, classes=${cardElement.className}`);
        }, 100);
      });
    });
    
    return cardElement;
  }

  /**
   * STREAMING SOLUTION: Attach event listeners to specific recipe card
   */
  attachRecipeCardEvents(recipeId) {
    const card = document.querySelector(`.recipe-card[data-recipe-id="${recipeId}"]`);
    if (!card) return;
    
    const recipe = this.recipes.find(r => r.id === recipeId);
    
    // Share button
    card.querySelector('.share-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.debouncedShareRecipe(recipeId);
    });

    // Delete button
    card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.deleteRecipe(recipeId);
    });

    // Privacy status click - open privacy modal
    card.querySelector('.recipe-privacy-status')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPrivacyDialog(recipeId);
    });

    // Card click - load recipe (but not when clicking action buttons or privacy status)
    card.addEventListener('click', (e) => {
      // Don't load recipe if clicking on action buttons or privacy status
      if (e.target.closest('.recipe-actions') || e.target.closest('.recipe-privacy-status')) return;
      this.loadRecipe(recipeId);
    });
    
    // Render Lucide icons for this specific card
    LucideIcons.render(card);
  }

  /**
   * STREAMING SOLUTION: Clear any remaining skeleton cards after streaming
   */
  clearRemainingSkeletons() {
    const remainingSkeletons = document.querySelectorAll('.skeleton-card');
    remainingSkeletons.forEach(skeleton => skeleton.remove());
  }

  /**
   * STREAMING SOLUTION: Show error state when loading fails
   */
  showErrorState(container) {
    container.innerHTML = '<div class="error-message">Failed to load recipes. Please try again.</div>';
  }

  /**
   * STREAMING SOLUTION: Load recipe image for specific recipe ID
   */
  async loadSingleRecipeImageById(recipeId) {
    const card = document.querySelector(`.recipe-card[data-recipe-id="${recipeId}"]`);
    if (card) {
      // Skip if image is already loaded
      if (card.classList.contains('has-background-image')) {
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Image already loaded for ${recipeId} (via ID), skipping`);
        return;
      }
      await this.loadSingleRecipeImage(card);
    }
  }

  /**
   * Create recipe card HTML content (extracted from createRecipeCard for reuse)
   */
  createRecipeCardHTML(recipe) {
    const savedDate = recipe.savedAt ? new Date(recipe.savedAt).toLocaleDateString() : 'Unknown';
    
    // Handle privacy levels
    const privacy = recipe.privacy || 'unlisted';
    
    const privacyInfo = {
      'public': { icon: 'globe', label: 'Public', color: getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim() },
      'unlisted': { icon: 'link', label: 'Unlisted', color: getComputedStyle(document.documentElement).getPropertyValue('--warning-color').trim() }, 
      'private': { icon: 'lock', label: 'Private', color: getComputedStyle(document.documentElement).getPropertyValue('--gray-300').trim() }
    }[privacy];
    
    return `
      <div class="recipe-card-overlay"></div>
      <div class="recipe-card-content">
        <div class="recipe-header-row">
          <h3 class="recipe-name">${this.escapeHtml(recipe.name)}</h3>
          <div class="recipe-top-section">
            <div class="recipe-date">${savedDate}</div>
            <div class="recipe-privacy-status privacy-status-${privacy.toLowerCase()}" style="font-size: 0.85rem;">
              ${LucideIcons.createInline(privacyInfo.icon, privacyInfo.label, 14)}
            </div>
          </div>
        </div>
        
        <div class="recipe-bottom-row">
          <div class="recipe-style">
            ${this.escapeHtml(recipe.style?.name || recipe.style || 'Unknown Style')}
            ${recipe.abv || recipe.ibu ? ' • ' : ''}${recipe.abv ? `${recipe.abv.toFixed(1)}% ABV` : ''}${recipe.abv && recipe.ibu ? ' • ' : ''}${recipe.ibu ? `${Math.round(recipe.ibu)} IBU` : ''}
          </div>
          
          <div class="recipe-actions">
            ${privacy !== 'private' ? '<button class="btn btn--share-card share-btn" data-recipe-id="' + recipe.id + '">' + LucideIcons.create('send', '', 18) + '</button>' : ''}
            <button class="btn btn--delete-card delete-btn" data-recipe-id="${recipe.id}">${LucideIcons.create('trash', '', 18)}</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render recipe cards
   */
  renderRecipes() {
    const recipesList = document.getElementById('recipesList');
    if (!recipesList) return;

    // Batch DOM updates for better performance
    domBatcher.schedule(() => {
      // Generate all HTML at once to minimize DOM manipulation
      recipesList.innerHTML = this.recipes.map(recipe => this.createRecipeCard(recipe)).join('');
    });
    
    // Batch event listener setup
    domBatcher.schedule(() => {
      // Add event listeners to cards
      recipesList.querySelectorAll('.recipe-card').forEach(card => {
        const recipeId = card.dataset.recipeId;
        const recipe = this.recipes.find(r => r.id === recipeId);
        
        // Share button
        card.querySelector('.share-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.debouncedShareRecipe(recipeId);
        });

        // Delete button
        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteRecipe(recipeId);
        });

        // Privacy status click - open privacy modal
        card.querySelector('.recipe-privacy-status')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showPrivacyDialog(recipeId);
        });

        // Card click - load recipe (but not when clicking action buttons or privacy status)
        card.addEventListener('click', (e) => {
          // Don't load recipe if clicking on action buttons or privacy status
          if (e.target.closest('.recipe-actions') || e.target.closest('.recipe-privacy-status')) return;
          this.loadRecipe(recipeId);
        });
      });
      
      // Load recipe images on-demand after DOM is ready
      this.loadRecipeImages();
      
      // Render Lucide icons
      LucideIcons.render(recipesList);
    });
  }

  /**
   * Create HTML for a recipe card with streamlined actions (legacy method for renderRecipes)
   */
  createRecipeCard(recipe) {
    // Images will be loaded on-demand after rendering
    return `
      <div class="recipe-card" data-recipe-id="${recipe.id}" data-needs-image="true">
        ${this.createRecipeCardHTML(recipe)}
      </div>
    `;
  }

  /**
   * Phase 3: Load a recipe with optimized caching and navigate to recipe view
   */
  async loadRecipe(recipeId) {
    try {
      // Show loading toast for user feedback
      this.showToast('Loading recipe...', 'info');
      
      // Phase 3: Pre-cache the full recipe data for faster navigation
      const userId = clerkAuth.getFirebaseUserId();
      if (userId) {
        // Load full recipe data in background and cache it
        storageManager.loadFullRecipeOptimized(userId, recipeId).catch(error => {
          debug.log(DEBUG_CATEGORIES.STORAGE, 'Background recipe caching failed:', error);
        });
      }
      
      // Dispatch event to load the saved recipe
      window.dispatchEvent(new CustomEvent(EVENTS.LOAD_SAVED_RECIPE, {
        detail: { recipeId }
      }));
    } catch (error) {
      this.showToast('Failed to load recipe', 'error');
      errorHandler.handleError(error, {
        component: 'MyRecipesPage',
        method: 'loadRecipe',
        recipeId
      });
    }
  }


  /**
   * Show privacy change dialog
   */
  showPrivacyDialog(recipeId, action = 'change') {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    // Get current privacy status
    const currentPrivacy = recipe.privacy || 'unlisted';
    
    const actionText = action === 'share' ? 'to share' : '';
    
    const content = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Privacy Settings</h3>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="privacy-options">
            <button class="privacy-option ${currentPrivacy === 'public' ? 'privacy-option--current' : ''}" data-privacy="public" disabled>
              <div class="privacy-icon">🌐</div>
              <div class="privacy-info">
                <h3>Public (COMING SOON)</h3>
                <p>Anyone can discover and view this recipe</p>
              </div>
            </button>
            <button class="privacy-option ${currentPrivacy === 'unlisted' ? 'privacy-option--current' : ''}" data-privacy="unlisted">
              <div class="privacy-icon">🔗</div>
              <div class="privacy-info">
                <h3>Unlisted</h3>
                <p>Only people with the link can view this recipe</p>
              </div>
            </button>
            <button class="privacy-option ${currentPrivacy === 'private' ? 'privacy-option--current' : ''}" data-privacy="private">
              <div class="privacy-icon">🔒</div>
              <div class="privacy-info">
                <h3>Private</h3>
                <p>Only you can view this recipe</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    `;
    
    const modal = modalManager.showModal('privacy-dialog', content);
    
    // Render Lucide icons
    LucideIcons.render(modal);
    
    // Batch event listener setup
    domBatcher.schedule(() => {
      // Handle privacy selection
      modal.querySelectorAll('.privacy-option').forEach(btn => {
        btn.addEventListener('click', async () => {
          // Skip if button is disabled
          if (btn.disabled) return;
          
          const newPrivacy = btn.dataset.privacy;
          modalManager.closeModal(modal);
          
          // Only update if privacy is actually changing
          if (newPrivacy !== currentPrivacy) {
            await this.debouncedChangePrivacyAndShare(recipeId, newPrivacy, action);
          }
        });
      });
      
      // Handle close
      modal.querySelector('.modal-close').addEventListener('click', () => {
        modalManager.closeModal(modal);
      });
    });
  }

  /**
   * Change privacy and optionally share
   */
  async changePrivacyAndShare(recipeId, newPrivacy, action) {
    const startTime = performanceMonitor.startTiming('privacyChange');
    
    try {
      // Update privacy using new system
      await storageManager.updateRecipePrivacy(recipeId, newPrivacy);
      
      this.showToast(`Recipe privacy updated to ${newPrivacy}`, 'success');
      
      // If action was share, generate share link
      if (action === 'share') {
        const shareResult = await storageManager.createShareToken(recipeId);
        this.showShareModal(shareResult, newPrivacy, recipeId);
      }
      
      // Update the recipe privacy in memory and refresh just this card
      this.updateRecipePrivacyInList(recipeId, newPrivacy);
      
      performanceMonitor.endTiming('privacyChange', startTime);
      
    } catch (error) {
      performanceMonitor.endTiming('privacyChange', startTime);
      this.showToast('Failed to update privacy', 'error');
      errorHandler.handleError(error, {
        component: 'MyRecipesPage',
        method: 'changePrivacyAndShare',
        recipeId,
        newPrivacy
      });
    }
  }

  /**
   * Share a recipe using new token-based system
   */
  async shareRecipe(recipeId) {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) return;


    try {
      const privacy = recipe.privacy || 'unlisted';
      
      if (privacy === 'private') {
        // Show privacy change dialog for private recipes
        this.showPrivacyDialog(recipeId, 'share');
        return;
      }
      
      // Generate share token  
      this.showToast('Loading share link...', 'info');
      const shareResult = await storageManager.createShareToken(recipeId);
      
      // Show share modal with result
      this.showShareModal(shareResult, privacy, recipeId);
      
    } catch (error) {
      this.showToast('Failed to create share link', 'error');
      errorHandler.handleError(error, {
        component: 'MyRecipesPage',
        method: 'shareRecipe',
        recipeId
      });
    }
  }

  /**
   * Show share modal with hybrid token system
   */
  showShareModal(shareResult, privacy, recipeId = null) {
    const startTime = performanceMonitor.startTiming('modalOpenTime');
    
    const privacyInfo = {
      'public': {
        icon: 'globe',
        message: 'This public recipe can be discovered and shared freely.'
      },
      'unlisted': {
        icon: 'link', 
        message: 'This unlisted recipe is only accessible via this share link.'
      }
    }[privacy];
    
    const content = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Share Recipe</h3>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="privacy-info">
            ${LucideIcons.createInline(privacyInfo.icon, privacyInfo.message, 16)}
          </div>
          <div class="share-url-container">
            <button class="generate-new-btn icon-button">
              ${LucideIcons.create('refresh-cw', '', 16)}
            </button>
            <input type="text" class="share-url-input" value="${shareResult.url}" readonly>
            <button class="btn btn--primary">
              ${LucideIcons.createInline('copy', 'Copy', 16)}
            </button>
          </div>
          <div class="share-help">
            <strong>Tip:</strong> To stop all sharing, change the recipe privacy to "Private" instead.
          </div>
        </div>
      </div>
    `;
    
    const modal = modalManager.showModal('share', content);
    
    performanceMonitor.endTiming('modalOpenTime', startTime);
    
    // Render Lucide icons
    LucideIcons.render(modal);
    
    // Batch event listener setup
    domBatcher.schedule(() => {
      // Handle copy button
      const copyBtn = modal.querySelector('.btn.btn--primary');
      const input = modal.querySelector('.share-url-input');
      
      copyBtn.addEventListener('click', () => {
      input.select();
      navigator.clipboard.writeText(input.value); // Always copy current input value
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
      }, 2000);
    });
    
      // Handle generate new link
      modal.querySelector('.generate-new-btn').addEventListener('click', () => {
        this.debouncedGenerateNewLink(recipeId, modal);
      });
      
      // Handle close
      modal.querySelector('.modal-close').addEventListener('click', () => {
        modalManager.closeModal(modal);
      });
      
      // Handle backdrop click (click outside modal content)
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modalManager.closeModal(modal);
        }
      });
    });
  }

  /**
   * Update recipe privacy in memory and refresh the specific recipe card
   */
  updateRecipePrivacyInList(recipeId, newPrivacy) {
    // Update the recipe in memory
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (recipe) {
      recipe.privacy = newPrivacy;
    }
    
    // Find and update just this recipe card
    const card = document.querySelector(`.recipe-card[data-recipe-id="${recipeId}"]`);
    if (card) {
      // Use DOM batcher for smooth update
      domBatcher.schedule(() => {
        // Update the privacy indicator
        const privacyStatus = card.querySelector('.recipe-privacy-status');
        if (privacyStatus) {
          const privacyInfo = {
            'public': { icon: 'globe', label: 'Public', color: getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim() },
            'unlisted': { icon: 'link', label: 'Unlisted', color: getComputedStyle(document.documentElement).getPropertyValue('--warning-color').trim() }, 
            'private': { icon: 'lock', label: 'Private', color: getComputedStyle(document.documentElement).getPropertyValue('--gray-300').trim() }
          }[newPrivacy];
          
          privacyStatus.innerHTML = `${LucideIcons.createInline(privacyInfo.icon, privacyInfo.label, 16)}`;
          privacyStatus.className = `recipe-privacy-status privacy-status-${newPrivacy.toLowerCase()}`;
          
          // Render Lucide icons
          LucideIcons.render(privacyStatus);
        }
        
        // Update the share button visibility for private recipes
        const shareBtn = card.querySelector('.share-btn');
        if (shareBtn) {
          if (newPrivacy === 'private') {
            shareBtn.classList.remove('u-flex');
            shareBtn.classList.add('u-hidden');
          } else {
            shareBtn.classList.remove('u-hidden');
            shareBtn.classList.add('u-flex');
          }
        } else if (newPrivacy !== 'private') {
          // If share button doesn't exist and privacy is not private, add it
          const actionsContainer = card.querySelector('.recipe-actions');
          const deleteBtn = actionsContainer.querySelector('.delete-btn');
          if (actionsContainer && deleteBtn) {
            const newShareBtn = document.createElement('button');
            newShareBtn.className = 'btn btn--share-card share-btn';
            newShareBtn.setAttribute('data-recipe-id', card.dataset.recipeId);
            newShareBtn.innerHTML = LucideIcons.create('send', '', 18);
            newShareBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.debouncedShareRecipe(card.dataset.recipeId);
            });
            actionsContainer.insertBefore(newShareBtn, deleteBtn);
            
            // Render Lucide icons for the new button
            LucideIcons.render(newShareBtn);
          }
        }
      });
    }
  }

  /**
   * Generate a new share link with confirmation
   */
  async generateNewShareLink(recipeId, modal) {
    if (confirm('Generate a new share link? This will revoke the current link and anyone with the old link will lose access.')) {
      try {
        this.showToast('Generating new link...', 'info');
        
        if (!recipeId) {
          this.showToast('Recipe ID not available. Please close and reopen the share dialog.', 'error');
          return;
        }
        
        // Force creation of new token
        const newShareResult = await storageManager.createShareToken(recipeId, { forceNew: true });
        
        // Update the modal with new link
        const input = modal.querySelector('.share-url-input');
        input.value = newShareResult.url;
        
        this.showToast('New share link generated!', 'success');
        
      } catch (error) {
        this.showToast('Failed to generate new link', 'error');
        errorHandler.handleError(error, {
          component: 'MyRecipesPage',
          method: 'generateNewShareLink',
          context: { recipeId: modal.dataset.recipeId }
        });
      }
    }
  }

  /**
   * Duplicate a recipe (placeholder for future implementation)
   */
  duplicateRecipe(recipeId) {
    // TODO: Implement recipe duplication
    this.showToast('Recipe duplication coming soon!', 'info');
  }

  /**
   * Delete a recipe
   */
  async deleteRecipe(recipeId) {
    if (!confirm('Are you sure you want to delete this recipe? This action cannot be undone.')) {
      return;
    }

    try {
      await storageManager.deleteRecipe(recipeId);
      this.showToast('Recipe deleted successfully', 'success');
      
      // Reload the recipes list
      await this.loadRecipes();
    } catch (error) {
      this.showToast('Failed to delete recipe', 'error');
      errorHandler.handleError(error, {
        component: 'MyRecipesPage',
        method: 'deleteRecipe',
        recipeId
      });
    }
  }

  /**
   * Show a toast notification
   */
  showToast(message, type = 'info') {
    // Remove any existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
      this.removeToast(existingToast);
    }

    // Create toast with unified classes
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.className = 'toast-close';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.onclick = () => this.removeToast(toast);
    toast.appendChild(closeButton);

    // Add to DOM
    document.body.appendChild(toast);
    
    // Auto-dismiss after 5 seconds
    const autoRemoveTimer = setTimeout(() => this.removeToast(toast), TIMING.TOAST_DURATION || 5000);
    
    // Store timer reference to cancel if manually closed
    toast.dataset.timer = autoRemoveTimer;
    
    // Force browser to recognize the element before animating
    // This ensures the transition works properly
    void toast.offsetHeight;

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('toast--visible');
    });
  }
  
  /**
   * Remove toast with animation
   */
  removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    
    // Clear auto-remove timer if exists
    if (toast.dataset.timer) {
      clearTimeout(toast.dataset.timer);
    }
    
    // Animate out
    toast.classList.add('toast--hidden');
    toast.classList.remove('toast--visible');
    
    // Remove from DOM after animation
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  /**
   * Load recipe images on-demand using Intersection Observer for optimal performance
   */
  async loadRecipeImages() {
    debug.log(DEBUG_CATEGORIES.UI, '🖼️ loadRecipeImages() called');
    
    if (!('IntersectionObserver' in window)) {
      debug.log(DEBUG_CATEGORIES.UI, '🖼️ No IntersectionObserver, using legacy method');
      return this.loadRecipeImagesLegacy();
    }

    const cards = document.querySelectorAll('.recipe-card[data-needs-image="true"]');
    debug.log(DEBUG_CATEGORIES.UI, `🖼️ Found ${cards.length} cards with data-needs-image="true" for Intersection Observer`);
    
    // Reset image coordination variables for new image load cycle
    this.loadedImages.clear();
    this.expectedImageCount = cards.length;
    this.imagesRevealed = false;
    
    // Set a fallback timeout to reveal images even if some fail to load (3 seconds)
    setTimeout(() => {
      if (!this.imagesRevealed && this.loadedImages.size > 0) {
        debug.log(DEBUG_CATEGORIES.UI, `🖼️ ⏰ Timeout reached, revealing ${this.loadedImages.size}/${this.expectedImageCount} loaded images`);
        this.imagesRevealed = true;
        this.revealAllImagesInSequence();
      }
    }, 3000);
    
    const imageObserver = new IntersectionObserver((entries) => {
      debug.log(DEBUG_CATEGORIES.UI, `🖼️ Intersection Observer triggered with ${entries.length} entries`);
      entries.forEach(entry => {
        debug.log(DEBUG_CATEGORIES.UI, `🖼️ Entry for ${entry.target.dataset.recipeId}: isIntersecting=${entry.isIntersecting}`);
        if (entry.isIntersecting) {
          // Skip if image is already loaded
          if (entry.target.classList.contains('has-background-image')) {
            debug.log(DEBUG_CATEGORIES.UI, `🖼️ Image already loaded for ${entry.target.dataset.recipeId} (via observer), skipping`);
            imageObserver.unobserve(entry.target);
            return;
          }
          debug.log(DEBUG_CATEGORIES.UI, `🖼️ Loading image via Intersection Observer for ${entry.target.dataset.recipeId}`);
          this.loadSingleRecipeImage(entry.target);
          imageObserver.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '50px' // Start loading 50px before visible
    });

    debug.log(DEBUG_CATEGORIES.UI, `🖼️ Setting up Intersection Observer for ${cards.length} cards`);
    cards.forEach((card, index) => {
      debug.log(DEBUG_CATEGORIES.UI, `🖼️ Observing card ${index + 1}: ${card.dataset.recipeId} (classes: ${card.className})`);
      imageObserver.observe(card);
    });
  }

  /**
   * Handle completion of image loading (success or failure)
   */
  handleImageCompleted(recipeId, card, imageData) {
    // Store the completion (even if no image data)
    this.loadedImages.set(recipeId, { card, imageData });
    
    debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ ✅ Image completion tracked for ${recipeId} (${this.loadedImages.size}/${this.expectedImageCount} ready)`);
    
    // Check if all images are completed and start coordinated reveal
    if (this.loadedImages.size >= this.expectedImageCount && !this.imagesRevealed) {
      this.imagesRevealed = true;
      debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ ✨ All images completed, starting coordinated reveal sequence...`);
      this.revealAllImagesInSequence();
    }
  }

  /**
   * Reveal all loaded images in sequence once all are ready
   */
  revealAllImagesInSequence() {
    // Get all cards in DOM order to ensure proper sequence
    const allCards = Array.from(document.querySelectorAll('.recipe-card'));
    
    allCards.forEach((card, index) => {
      const recipeId = card.dataset.recipeId;
      const completion = this.loadedImages.get(recipeId);
      
      // Check if card has an image (either from completion tracking or already applied)
      const hasImageData = (completion && completion.imageData) || card.classList.contains('has-background-image');
      
      if (hasImageData) {
        const fadeDelay = index * 150; // 150ms between each image
        
        setTimeout(() => {
          card.classList.add('image-revealed');
          debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ ✨ Image revealed for ${recipeId} (position: ${index + 1}/${allCards.length})`);
        }, fadeDelay);
      } else {
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ ⏭️ Skipping reveal for ${recipeId} - no image available (completion: ${!!completion}, hasClass: ${card.classList.contains('has-background-image')})`);
      }
    });
  }

  /**
   * Coordinate image fade-in sequence (legacy method for single reveals)
   */
  scheduleImageReveal(card, recipeId) {
    // Get all cards to determine proper sequence
    const allCards = Array.from(document.querySelectorAll('.recipe-card'));
    const cardIndex = allCards.indexOf(card);
    const fadeDelay = cardIndex * 150; // 150ms between each image
    
    setTimeout(() => {
      card.classList.add('image-revealed');
      debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ ✨ Image revealed for ${recipeId} (position: ${cardIndex + 1}/${allCards.length})`);
    }, fadeDelay);
    
    return fadeDelay;
  }

  /**
   * Load a single recipe image with timeout protection
   */
  async loadSingleRecipeImage(card) {
    const recipeId = card.dataset.recipeId;
    if (!recipeId) return;

    const loadStartTime = performance.now();
    debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Starting image load for recipe: ${recipeId} (DOM element: ${card.outerHTML.substring(0, 100)}...)`);

    try {
      // Check if image is already loaded to prevent flicker
      const hasClass = card.classList.contains('has-background-image');
      const hasBgImage = card.style.backgroundImage && card.style.backgroundImage !== 'none';
      const hasCssProperty = card.style.getPropertyValue('--recipe-bg-image');
      
      if (hasClass || hasBgImage || hasCssProperty) {
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Image already loaded for ${recipeId}, SKIPPING:`, {
          hasClass,
          hasBgImage: !!hasBgImage,
          hasCssProperty: !!hasCssProperty,
          currentBgImage: card.style.backgroundImage?.substring(0, 50) + '...'
        });
        return;
      }
      
      debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ ${recipeId} - Starting image load (no existing image detected)`);

      // Check localStorage cache first
      let imageData = storageManager.getRecipeImage(recipeId);
      
      if (imageData) {
        const cacheTime = performance.now() - loadStartTime;
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Image CACHE HIT for ${recipeId} in ${cacheTime.toFixed(1)}ms`);
      } else {
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Image cache miss for ${recipeId}, loading from Firebase...`);
        
        // Load from Firebase with timeout
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Image load timeout')), TIMING.IMAGE_LOAD_TIMEOUT)
        );
        
        const firebaseStartTime = performance.now();
        imageData = await Promise.race([
          storageManager.getRecipeImageFromFirebase(recipeId),
          timeoutPromise
        ]);
        
        const firebaseTime = performance.now() - firebaseStartTime;
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Image Firebase load for ${recipeId} in ${firebaseTime.toFixed(1)}ms`);
      }

      if (imageData) {
        const totalTime = performance.now() - loadStartTime;
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Image ready for ${recipeId} in ${totalTime.toFixed(1)}ms total`);
        
        // Apply background image directly without requestAnimationFrame to avoid conflicts
        const currentBgImage = card.style.getPropertyValue('--recipe-bg-image');
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ About to apply image for ${recipeId}:`);
        debug.log(DEBUG_CATEGORIES.STORAGE, `   - Current bg-image: ${currentBgImage}`);
        debug.log(DEBUG_CATEGORIES.STORAGE, `   - Has class: ${card.classList.contains('has-background-image')}`);
        debug.log(DEBUG_CATEGORIES.STORAGE, `   - New image data length: ${imageData.length} chars`);
        
        // Set the background image using CSS custom property for pseudo-element
        card.style.setProperty('--recipe-bg-image', `url('${imageData}')`);
        card.classList.add('has-background-image');
        card.removeAttribute('data-needs-image');
        
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ ✅ Image loaded for ${recipeId}, marking as completed`);
        this.handleImageCompleted(recipeId, card, imageData);
      } else {
        debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ No image data found for ${recipeId}`);
        // Mark as completed even without image so it doesn't block the reveal sequence
        this.handleImageCompleted(recipeId, card, null);
      }
    } catch (error) {
      const errorTime = performance.now() - loadStartTime;
      debug.log(DEBUG_CATEGORIES.STORAGE, `🖼️ Image load failed for ${recipeId} after ${errorTime.toFixed(1)}ms: ${error.message}`);
      // Silent fail - don't block UI for images but mark as completed
      card.removeAttribute('data-needs-image');
      this.handleImageCompleted(recipeId, card, null);
    }
  }

  /**
   * Legacy image loading for browsers without Intersection Observer
   */
  async loadRecipeImagesLegacy() {
    const cards = document.querySelectorAll('.recipe-card[data-needs-image="true"]');
    
    // Load images with slight delay to avoid overwhelming Firebase
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const recipeId = card.dataset.recipeId;
      
      // Small delay between requests to be Firebase-friendly
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, TIMING.DOM_READY_DELAY));
      }
      
      try {
        // Try to get image from storage manager (includes Firebase lookup)
        const imageData = await storageManager.getRecipeImageFromFirebase(recipeId);
        
        if (imageData) {
          // Apply background image
          card.style.setProperty('--recipe-bg-image', `url('${imageData}')`);
          card.classList.add('has-background-image');
          // Mark as loaded to avoid reloading
          card.removeAttribute('data-needs-image');
        } else {
          // Check localStorage for temporary/legacy images
          const localImageData = storageManager.getRecipeImage(recipeId);
          if (localImageData) {
            card.style.setProperty('--recipe-bg-image', `url('${localImageData}')`);
            card.classList.add('has-background-image');
            card.removeAttribute('data-needs-image');
          }
        }
      } catch (error) {
        debug.warn(DEBUG_CATEGORIES.UI, `Failed to load image for recipe: ${recipeId}`, error);
        // Continue with other images even if one fails
      }
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

// Export singleton instance
export const myRecipesPage = new MyRecipesPage();