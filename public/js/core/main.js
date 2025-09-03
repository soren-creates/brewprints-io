/**
 * Main Application Entry Point
 * Handles file loading and app initialization
 */

// CRITICAL PATH IMPORTS ONLY - Load immediately for fast startup
import { HeaderManager } from '../ui/components/header-manager.js';
import { NavigationManager } from '../ui/components/navigation-manager.js';
import { errorHandler } from '../utilities/errors/error-handler.js';
import { EVENTS } from './constants.js';
import { storageManager } from '../storage/storage-manager.js';
import { myRecipesPage } from '../ui/pages/my-recipes.js';
import { clerkAuth } from '../auth/clerk-config.js';
import { debug, DEBUG_CATEGORIES } from '../utilities/debug.js';
import { TIMING, PERFORMANCE_BUDGET } from './timing-constants.js';
import { sanitizeText } from '../utilities/validation/security-utils.js';
import { container } from './dependency-container.js';


// Performance Budget Monitor
class PerformanceBudgetMonitor {
  constructor(budget) {
    this.budget = budget;
    this.violations = [];
    this.isMonitoring = false;
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // Monitor page load timing
    if ('PerformanceObserver' in window) {
      this.monitorPageLoadTiming();
      this.monitorResourceSizes();
    }

    // Check runtime budgets periodically
    this.runtimeMonitorInterval = setInterval(() => {
      this.checkRuntimeBudgets();
    }, 10000); // Check every 10 seconds
  }

  monitorPageLoadTiming() {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'navigation') {
          this.checkTimingBudget('domContentLoaded', entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart);
          this.checkTimingBudget('loadEvent', entry.loadEventEnd - entry.loadEventStart);
        }
      });
    });
    observer.observe({ type: 'navigation', buffered: true });
  }

  monitorResourceSizes() {
    const observer = new PerformanceObserver((list) => {
      let totalJSSize = 0;
      let totalCSSSize = 0;
      let totalSize = 0;

      list.getEntries().forEach((entry) => {
        if (entry.transferSize) {
          totalSize += entry.transferSize;

          if (entry.name.endsWith('.js')) {
            totalJSSize += entry.transferSize;
          } else if (entry.name.endsWith('.css')) {
            totalCSSSize += entry.transferSize;
          }
        }
      });

      this.checkSizeBudget('initialJSBundle', totalJSSize);
      this.checkSizeBudget('criticalPathCSS', totalCSSSize);
      this.checkSizeBudget('totalPageWeight', totalSize);
    });
    observer.observe({ type: 'resource', buffered: true });
  }

  checkTimingBudget(metric, value) {
    const budget = this.budget[metric];
    if (budget && value > budget) {
      this.recordViolation('timing', metric, value, budget);
    } else if (budget && value <= budget) {
      debug.log(DEBUG_CATEGORIES.UI, `Performance budget OK: ${metric} = ${Math.round(value)}ms (budget: ${budget}ms)`);
    }
  }

  checkSizeBudget(metric, value) {
    const budget = this.budget[metric];
    if (budget && value > budget) {
      this.recordViolation('size', metric, value, budget);
    } else if (budget && value > 0) {
      debug.log(DEBUG_CATEGORIES.UI, `Performance budget OK: ${metric} = ${Math.round(value/1000)}KB (budget: ${Math.round(budget/1000)}KB)`);
    }
  }

  checkRuntimeBudgets() {
    // Check lazy module count
    if (window.brewLogApp?.lazyModulesLoaded?.size > this.budget.maxLazyModules) {
      this.recordViolation('runtime', 'maxLazyModules', window.brewLogApp.lazyModulesLoaded.size, this.budget.maxLazyModules);
    }

    // Check cache size
    if (storageManager?.recipeSummaryCache?.size > this.budget.maxCacheSize) {
      this.recordViolation('runtime', 'maxCacheSize', storageManager.recipeSummaryCache.size, this.budget.maxCacheSize);
    }

    // Check inflight requests
    if (storageManager?.inflightRequests?.size > this.budget.maxInflightRequests) {
      this.recordViolation('runtime', 'maxInflightRequests', storageManager.inflightRequests.size, this.budget.maxInflightRequests);
    }
  }

  recordViolation(type, metric, actual, budget) {
    const violation = {
      type,
      metric,
      actual,
      budget,
      timestamp: Date.now(),
      url: window.location.pathname
    };

    this.violations.push(violation);
    
    // Keep only last 20 violations
    if (this.violations.length > 20) {
      this.violations.shift();
    }

    // Log warning
    debug.warn(DEBUG_CATEGORIES.UI, `⚠️ Performance budget violation: ${metric} = ${actual} (budget: ${budget})`);

    // Store violations in localStorage for analysis (production-safe)
    try {
      const isProduction = this.detectProductionMode();
      if (!isProduction) {
        // Development: Store detailed violation data
        localStorage.setItem('performance-violations', JSON.stringify(this.violations));
      } else {
        // Production: Only store violation count, no detailed data
        const safeData = {
          violationCount: this.violations.length,
          lastViolation: Date.now(),
          types: [...new Set(this.violations.map(v => v.type))]
        };
        localStorage.setItem('performance-violations', JSON.stringify(safeData));
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  /**
   * Detect production mode for security (same logic as debug system)
   */
  detectProductionMode() {
    const hostname = window.location.hostname;
    const devHostnames = ['localhost', '127.0.0.1', '0.0.0.0'];
    const isDevHostname = devHostnames.some(devHost => hostname === devHost || hostname.includes(devHost));
    const hasDevPort = window.location.port && parseInt(window.location.port) < 8000;
    
    return !(isDevHostname || hasDevPort || window.location.search.includes('dev=true'));
  }

  getViolations() {
    return this.violations;
  }

  stop() {
    this.isMonitoring = false;
    if (this.runtimeMonitorInterval) {
      clearInterval(this.runtimeMonitorInterval);
    }
  }
}

// LAZY LOADING MODULE MAP - Load modules on-demand
const LazyModules = {
  // Recipe processing modules (loaded when uploading/processing recipes)
  async getParserManager() {
    const { ParserManager } = await import('../parsers/parser-manager.js');
    return new ParserManager();
  },
  
  async getRecipeValidator() {
    const { RecipeValidator } = await import('./recipe-validator.js');
    return new RecipeValidator();
  },
  
  async getCalculationOrchestrator() {
    const { CalculationOrchestrator } = await import('./calculation-orchestrator.js');
    return new CalculationOrchestrator();
  },
  
  async getRecipeFormatter() {
    const { RecipeFormatter } = await import('./formatter.js');
    return new RecipeFormatter();
  },
  
  // UI modules (loaded when displaying recipes)
  async getRecipeRenderer() {
    const { RecipeRenderer } = await import('../ui/recipe-renderer.js');
    return new RecipeRenderer();
  },
  
  async getSectionManager() {
    const { SectionManager } = await import('../ui/components/section-manager.js');
    return new SectionManager();
  },
  
  // Feature modules (loaded when features are used)
  async getPrintControls() {
    const { PrintControls } = await import('../ui/components/print-controls.js');
    return new PrintControls();
  },
  
  async getDataPreview() {
    const { DataPreview } = await import('../ui/pages/data-preview.js');
    return new DataPreview();
  },
  
  async getDebugToggle() {
    const { debugToggle } = await import('../ui/components/debug-toggle.js');
    return debugToggle;
  },
  
  async initSharingPerformance() {
    const { initSharingPerformance } = await import('../utilities/performance/sharing-performance.js');
    return initSharingPerformance();
  }
};

class BrewLogApp {
  constructor() {
    // CRITICAL PATH ONLY - Initialize immediately needed components
    this.headerManager = new HeaderManager();
    this.navigationManager = new NavigationManager();
    this.initState = 'pending'; // 'pending' | 'initializing' | 'complete'
    this.queuedAuthStateChanges = []; // Queue auth changes during initialization
    
    // LAZY LOADED - Initialize on-demand to reduce startup time
    this.parser = null;
    this.validator = null; 
    this.calculator = null;
    this.formatter = null;
    this.renderer = null;
    this.sectionManager = null;
    this.printControls = null;
    this.dataPreview = null;
    this.debugToggle = null;
    
    // Track which lazy modules have been loaded
    this.lazyModulesLoaded = new Set();
    
    // Performance Budget Monitor
    this.performanceMonitor = new PerformanceBudgetMonitor(PERFORMANCE_BUDGET);
  }

  async init() {
    this.setupEventListeners();
    
    // Start performance monitoring early
    this.performanceMonitor.startMonitoring();
    
    // Initialize critical path components only
    this.headerManager.init();
    this.navigationManager.init();
    
    // Link navigation manager to header manager for save button state management
    this.headerManager.navigationManager = this.navigationManager;
    
    // Register core components in dependency container
    container.register('headerManager', this.headerManager);
    myRecipesPage.init();
    container.register('myRecipesPage', myRecipesPage);
    container.register('navigationManager', this.navigationManager);
    
    // Only show debug controls in development environment
    const isDevelopment = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' ||
                         window.location.port !== '';
    
    if (isDevelopment) {
      // Lazy load debug toggle in development mode
      this.ensureModuleLoaded('debugToggle').then(() => {
        if (this.debugToggle) {
          this.debugToggle.init();
        }
      });
    }
    
    // Add version display to page
    this.initVersionDisplay();
    
    // Enable debug mode for enhanced error logging
    errorHandler.init({ debugMode: true });
    
    // Initialize performance monitoring for sharing system (lazy load)
    LazyModules.initSharingPerformance().catch(error => {
      debug.warn(DEBUG_CATEGORIES.AUTH, 'Failed to initialize sharing performance:', error);
    });
    
    // Check if there's a recipe ID in the URL (for sharing) - do this first
    const hasSharedRecipe = await this.checkForSharedRecipe();
    
    // If no shared recipe was loaded, proceed with optimistic UI loading
    if (!hasSharedRecipe) {
      // Mark initialization as starting
      this.initState = 'initializing';
      
      // OPTIMISTIC LOADING: Show UI immediately, authenticate in background
      await this.optimisticUILoading();
    }
    
    // Mark initial load as complete after auth flow is handled
    // This allows auth state change events to be processed normally after initialization
    this.initState = 'complete';
    
    // Process any queued auth state changes
    this.processQueuedAuthStateChanges();
    
    // Mark app as initialized to enable normal page visibility rules
    document.body.classList.add('app-initialized');
    debug.log(DEBUG_CATEGORIES.AUTH, 'Initial load complete, auth state changes will now be handled');
  }

  setupEventListeners() {
    // File input handling
    const fileInput = document.getElementById('fileInput');
    const uploadButton = document.getElementById('upload-button');
    const uploadZone = document.getElementById('upload-zone');
    
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.handleFileLoad(e));
    }

    // Upload button - trigger file input click
    if (uploadButton && fileInput) {
      uploadButton.addEventListener('click', () => {
        fileInput.click();
      });
    }

    // Upload zone - make clickable and handle drag & drop
    if (uploadZone && fileInput) {
      uploadZone.addEventListener('click', () => {
        fileInput.click();
      });

      // Drag and drop handling
      uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
      });

      uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
      });

      uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          // Create a mock event to reuse existing file handling logic
          const mockEvent = { target: { files: files } };
          this.handleFileLoad(mockEvent);
        }
      });
    }
    
    // Listen for data preview navigation events
    window.addEventListener(EVENTS.CONTINUE_TO_RECIPE, () => this.showRecipeFromPreview());
    window.addEventListener(EVENTS.BACK_TO_UPLOAD, () => this.handleBack());
    window.addEventListener(EVENTS.BACK_TO_DATA_PREVIEW, () => {
      this.showDataPreview();
    });
    
    // Listen for recipe storage events
    window.addEventListener(EVENTS.SAVE_RECIPE, () => this.saveCurrentRecipe());
    window.addEventListener(EVENTS.SHOW_MY_RECIPES, () => this.showMyRecipes());
    window.addEventListener(EVENTS.LOAD_SAVED_RECIPE, (e) => this.loadSavedRecipe(e.detail.recipeId));
    
    // Listen for toast events from storage manager
    window.addEventListener('showToast', (e) => {
      this.showToast(e.detail.message, e.detail.type);
    });
    
    // Listen for auth state changes to handle sign in/out redirects
    window.addEventListener(EVENTS.AUTH_STATE_CHANGED, async (e) => {
      // Handle auth state changes based on initialization state
      if (this.initState !== 'complete') {
        debug.log(DEBUG_CATEGORIES.AUTH, `Auth state change during init (${this.initState}), queuing...`);
        this.queuedAuthStateChanges.push(e.detail);
        return;
      }
      
      // Process the auth state change
      await this.handleAuthStateChange(e.detail);
    });
  }

  async handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    let currentPhase = 'initialization';
    try {
      // LAZY LOAD: Ensure recipe processing modules are loaded
      await Promise.all([
        this.ensureModuleLoaded('parser'),
        this.ensureModuleLoaded('validator'),
        this.ensureModuleLoaded('dataPreview')
      ]);

      // Parse phase - extract raw data from file
      currentPhase = 'file_reading';
      const fileContent = await this.readFile(file);
      
      currentPhase = 'parsing';
      const rawRecipeData = this.parser.parseFile(fileContent, file.name);
      
      // Validate phase - apply brewing domain defaults and validate ranges
      currentPhase = 'validation';
      const validatedRecipeData = this.validator.validateRecipe(rawRecipeData);
      
      // Store both raw and validated data in navigation manager
      currentPhase = 'data_storage';
      this.navigationManager.setParsedData(rawRecipeData); // raw data for data preview analysis
      this.navigationManager.setValidatedData(validatedRecipeData); // validated data for calculations
      
      // Go directly to recipe view
      currentPhase = 'ui_rendering';
      this.showRecipeFromPreview();
      
    } catch (error) {
      // Enhanced error context
      const errorContext = {
        phase: currentPhase,
        component: 'BrewLogApp',
        method: 'handleFileLoad',
        fileName: file?.name,
        fileSize: file?.size,
        fileType: file?.type,
        timestamp: new Date().toISOString()
      };
      
      errorHandler.handleFileError(error, file.name, errorContext);
    }
  }
  
  showDataPreview() {
    const dataPreviewContainer = this.navigationManager.switchToView('data-preview');
    if (dataPreviewContainer) {
      // Render the data preview
      this.dataPreview.render(this.navigationManager.parsedData, dataPreviewContainer);
    }
  }
  
  showRecipeFromPreview() {
    if (!this.navigationManager.validatedData) return;

    let currentPhase = 'calculation';
    try {
      // Calculate phase - orchestrate all brewing calculations
      currentPhase = 'calculation';
      const calculatedData = this.calculator.calculateAll(this.navigationManager.validatedData);
      
      // Format phase - format data for display using pre-calculated values
      currentPhase = 'formatting';
      const formattedRecipe = this.formatter.formatRecipe(this.navigationManager.validatedData, calculatedData);
      this.navigationManager.setCurrentRecipe(formattedRecipe);
      
      // Clear any previous recipe image data to prevent conflicts
      this.clearPreviousRecipeImage();
      
      // Generate and set recipe ID for image storage
      window.currentRecipeId = this.generateRecipeId(formattedRecipe);
      
      // Render phase - show recipe view and render the recipe
      currentPhase = 'rendering';
      this.navigationManager.switchToView('recipe-view');
      
      const container = document.getElementById('recipeContainer');
      if (container) {
        this.renderer.render(formattedRecipe, container);
        // Re-initialize section manager after recipe is rendered, passing the recipe data
        this.sectionManager.setupControls(formattedRecipe);
        this.sectionManager.applyPreferences();
        
        // Load recipe image if it exists
        this.loadRecipeImage(formattedRecipe.id);
      }
      
    } catch (error) {
      // Enhanced error context for the new orchestrated flow
      const errorContext = {
        phase: currentPhase,
        component: 'BrewLogApp',
        method: 'showRecipeFromPreview',
        hasValidatedData: !!this.navigationManager.validatedData,
        timestamp: new Date().toISOString()
      };
      
      errorHandler.handleError(error, errorContext);
    }
  }

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  showUploadView() {
    this.navigationManager.switchToView('upload');
  }

  handleBack() {
    this.navigationManager.switchToView('upload');
  }

  /**
   * Save the current recipe to Firebase
   */
  async saveCurrentRecipe() {
    if (!this.navigationManager.currentRecipe) {
      errorHandler.handleError(new Error('No recipe to save'), {
        component: 'BrewLogApp',
        method: 'saveCurrentRecipe',
        userMessage: 'Please load a recipe before saving'
      });
      return;
    }

    try {
      // Get the current recipe and include any uploaded image data
      const recipeToSave = { ...this.navigationManager.currentRecipe };
      
      // Check if there's a current image in localStorage and include it
      if (window.currentRecipeId) {
        const imageData = storageManager.getRecipeImage(window.currentRecipeId);
        if (imageData) {
          recipeToSave.imageData = imageData;
        }
      }
      
      const result = await storageManager.saveRecipeWithDuplicateCheck(recipeToSave);
      
      // Handle different save actions
      if (result.action === 'cancelled') {
        return; // User cancelled, no toast needed
      } else if (result.action === 'skipped') {
        // Already handled by saveRecipeWithDuplicateCheck
        return;
      } else if (result.offline) {
        this.showToast('Recipe saved locally - will sync when online', 'info');
      } else if (result.action === 'updated') {
        this.showToast(`Recipe updated successfully!`, 'success');
      } else {
        this.showToast(`Recipe saved successfully!`, 'success');
      }
      
      // Dispatch recipe saved event (unless cancelled)
      if (result.id) {
        window.dispatchEvent(new CustomEvent(EVENTS.RECIPE_SAVED, {
          detail: { 
            recipeId: result.id, 
            offline: result.offline,
            action: result.action 
          }
        }));
      }
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'BrewLogApp',
        method: 'saveCurrentRecipe'
      });
      this.showToast('Failed to save recipe', 'error');
    }
  }

  /**
   * Show the My Recipes page
   */
  async showMyRecipes() {
    // Switch to My Recipes view
    this.navigationManager.switchToView('my-recipes');
    
    // Show the My Recipes page and load recipes
    await myRecipesPage.show();
  }

  /**
   * Load a saved recipe from Firebase
   */
  async loadSavedRecipe(recipeId) {
    try {
      const recipe = await storageManager.loadRecipe(recipeId);
      
      // Set parsed data for data-preview navigation (use recipe data as fallback)
      this.navigationManager.setParsedData(recipe.originalData || recipe);
      this.navigationManager.setValidatedData(recipe.validatedData || recipe);
      
      // Store the recipe and switch to recipe view
      this.navigationManager.setCurrentRecipe(recipe);
      this.navigationManager.switchToView('recipe-view');
      
      // Clear any previous recipe image data to prevent conflicts
      this.clearPreviousRecipeImage();
      
      // Set the current recipe ID for image loading
      window.currentRecipeId = recipe.id;
      
      // Render the recipe
      const container = document.getElementById('recipeContainer');
      if (container) {
        this.renderer.render(recipe, container);
        this.sectionManager.setupControls(recipe);
        this.sectionManager.applyPreferences();
        
        // Load recipe image if it exists
        this.loadRecipeImage(recipe.id);
      }
      
      // Dispatch recipe loaded event
      window.dispatchEvent(new CustomEvent(EVENTS.RECIPE_LOADED, {
        detail: { recipeId, recipe }
      }));
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'BrewLogApp',
        method: 'loadSavedRecipe',
        recipeId
      });
      this.showToast('Failed to load recipe', 'error');
    }
  }

  /**
   * Check for shared recipe in URL (supports both new token and legacy formats)
   * @returns {boolean} True if a shared recipe was found and loaded
   */
  async checkForSharedRecipe() {
    const urlParams = new URLSearchParams(window.location.search);
    const shareToken = urlParams.get('share');
    
    if (shareToken) {
      // New token-based sharing
      await this.loadSharedRecipeByToken(shareToken);
      return true;
    } else {
      // Check for legacy recipe URLs (migration support)
      const recipeInfo = storageManager.getRecipeInfoFromUrl();
      if (recipeInfo) {
        await this.handleLegacySharedRecipe(recipeInfo);
        return true;
      }
    }
    return false;
  }

  /**
   * Handle auth state changes once initialization is complete
   */
  async handleAuthStateChange(authDetail) {
    if (authDetail.isSignedIn) {
      // User just signed in, check if they have recipes and redirect if on upload page
      const currentView = this.navigationManager.getCurrentView();
      debug.log(DEBUG_CATEGORIES.AUTH, `Auth state changed: user signed in, current view is "${currentView}"`);
      if (currentView === 'upload') {
        debug.log(DEBUG_CATEGORIES.AUTH, 'User on upload page, running legacy recipe check...');
        await this.checkAndShowMyRecipes();
      } else {
        debug.log(DEBUG_CATEGORIES.AUTH, `User already on "${currentView}", skipping recipe check`);
      }
    } else {
      // User just signed out, redirect to upload page
      debug.log(DEBUG_CATEGORIES.AUTH, 'User signed out, redirecting to upload page...');
      this.navigationManager.switchToView('upload');
    }
  }

  /**
   * Process any queued auth state changes after initialization completes
   */
  async processQueuedAuthStateChanges() {
    if (this.queuedAuthStateChanges.length > 0) {
      debug.log(DEBUG_CATEGORIES.AUTH, `Processing ${this.queuedAuthStateChanges.length} queued auth state changes`);
      
      // Process the most recent auth state change (ignore older ones)
      const latestAuthChange = this.queuedAuthStateChanges[this.queuedAuthStateChanges.length - 1];
      await this.handleAuthStateChange(latestAuthChange);
      
      // Clear the queue
      this.queuedAuthStateChanges = [];
    }
  }

  /**
   * Check if logged-in user has saved recipes and show My Recipes page if they do
   */
  async checkAndShowMyRecipes() {
    // Only check if user is signed in
    if (!clerkAuth.isUserSignedIn()) {
      debug.log(DEBUG_CATEGORIES.AUTH, 'User not signed in, staying on upload page');
      return;
    }

    debug.log(DEBUG_CATEGORIES.AUTH, 'User is signed in, checking for saved recipes...');

    try {
      // Give Firebase and storage manager time to initialize properly
      // This is important for the first load after login
      await new Promise(resolve => setTimeout(resolve, TIMING.FIREBASE_INIT_DELAY));
      
      // Get user's recipes
      const recipes = await storageManager.listRecipes();
      debug.log(DEBUG_CATEGORIES.STORAGE, `Found ${recipes ? recipes.length : 0} saved recipes`);
      
      // If user has at least one saved recipe, show My Recipes page
      if (recipes && recipes.length > 0) {
        debug.log(DEBUG_CATEGORIES.AUTH, 'Switching to My Recipes page...');
        this.navigationManager.switchToView('my-recipes');
        // Small delay to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, TIMING.DOM_READY_DELAY));
        await myRecipesPage.show();
      } else {
        debug.log(DEBUG_CATEGORIES.STORAGE, 'No saved recipes found, staying on upload page');
      }
    } catch (error) {
      // If there's an error loading recipes, just stay on upload page
      debug.error(DEBUG_CATEGORIES.STORAGE, 'Error checking saved recipes:', error);
      // In case of error, we stay on upload page (already there)
    }
  }

  /**
   * Optimistic UI loading pattern (NEW: Performance optimization)
   * Shows UI immediately while authentication happens in background
   */
  async optimisticUILoading() {
    performance.mark('optimistic-ui-start');
    
    // Step 1: Check if we can determine auth state immediately (from cache/storage)
    const hasLocalSession = this.checkLocalAuthState();
    
    if (hasLocalSession) {
      // Step 2a: Show My Recipes immediately for likely authenticated users
      debug.log(DEBUG_CATEGORIES.LOADING, 'Optimistic: Showing My Recipes based on local session');
      this.navigationManager.switchToView('my-recipes');
      myRecipesPage.showWithLoadingState();
      
      // Step 3a: Verify auth and load data in background
      this.verifyAuthAndLoadData();
      
      // Step 3b: Preload likely-needed modules for My Recipes page
      this.preloadModules(['renderer', 'formatter', 'sectionManager']);
    } else {
      // Step 2b: Show upload page for likely anonymous users
      debug.log(DEBUG_CATEGORIES.LOADING, 'Optimistic: Showing upload page (no local session)');
      this.navigationManager.switchToView('upload');
      
      // Step 3b: Still check auth in background in case user signed in elsewhere
      this.verifyAuthInBackground();
    }
    
    performance.mark('optimistic-ui-complete');
    performance.measure('optimistic-ui-load', 'optimistic-ui-start', 'optimistic-ui-complete');
  }

  /**
   * Check local authentication state without API calls
   * Used for optimistic UI decisions
   */
  checkLocalAuthState() {
    // Check for Clerk session indicators in localStorage
    try {
      // Clerk stores multiple session-related items, check for various indicators
      const clerkKeys = [
        '__clerk_session',
        '__clerk_session_token', 
        '__clerk_user_id',
        '__clerk_auth_state'
      ];
      
      // Look for any Clerk session indicators
      const hasClerkData = clerkKeys.some(key => {
        const value = localStorage.getItem(key);
        return value && value !== 'null' && value !== 'undefined';
      });
      
      // Also check if window.Clerk is already loaded and has a user
      const hasLoadedSession = window.Clerk?.user?.id;
      
      // ENHANCED: Check for cached recipe data as strong session indicator
      const recipeCachePattern = /^quick_cache_recipes_user_/;
      const hasCachedRecipes = Object.keys(localStorage).some(key => {
        if (recipeCachePattern.test(key)) {
          try {
            const cached = JSON.parse(localStorage.getItem(key));
            return cached && cached.recipes && cached.recipes.length > 0;
          } catch (e) {
            return false;
          }
        }
        return false;
      });
      
      const hasSession = hasClerkData || hasLoadedSession || hasCachedRecipes;
      
      if (hasCachedRecipes && !hasClerkData && !hasLoadedSession) {
        debug.log(DEBUG_CATEGORIES.AUTH, 'Local auth check: found cached recipes - assuming authenticated user');
      } else {
        debug.log(DEBUG_CATEGORIES.AUTH, `Local auth check: ${hasSession ? 'session indicators found' : 'no session indicators'}`);
      }
      
      return hasSession;
    } catch (error) {
      debug.warn(DEBUG_CATEGORIES.AUTH, 'Local auth check failed:', error);
      return false; // Default to showing upload page
    }
  }

  /**
   * Verify authentication and load data in background (non-blocking)
   */
  async verifyAuthAndLoadData() {
    try {
      // Start auth verification and storage init in parallel
      const [authResult, storageResult] = await Promise.allSettled([
        clerkAuth.init(),
        storageManager.init()
      ]);
      
      // Check actual auth state
      const isSignedIn = clerkAuth.isUserSignedIn();
      debug.log(DEBUG_CATEGORIES.AUTH, `Auth verification: ${isSignedIn ? 'confirmed signed in' : 'not signed in'}`);
      
      this.headerManager.updateAuthUI();
      
      if (isSignedIn) {
        // User is authenticated - load recipes in background
        this.loadRecipesInBackground();
      } else {
        // User is not authenticated - switch to upload page
        debug.log(DEBUG_CATEGORIES.AUTH, 'Auth verification failed: switching to upload');
        this.navigationManager.switchToView('upload');
      }
      
    } catch (error) {
      debug.error(DEBUG_CATEGORIES.AUTH, 'Background auth verification failed:', error);
      // Fallback to upload page
      this.navigationManager.switchToView('upload');
    }
  }

  /**
   * Verify authentication in background for upload page users
   */
  async verifyAuthInBackground() {
    try {
      await clerkAuth.init();
      
      if (clerkAuth.isUserSignedIn()) {
        // User is actually signed in - switch to My Recipes
        debug.log(DEBUG_CATEGORIES.AUTH, 'Background check: User is signed in, switching to My Recipes');
        this.navigationManager.switchToView('my-recipes');
        myRecipesPage.showWithLoadingState();
        
        // Wait for cache loading to complete before background load
        // Cache loading uses 50ms * number of recipes + buffer time
        setTimeout(() => {
          this.loadRecipesInBackground();
        }, 500); // 500ms should be sufficient for most cache loads
      }
      
      this.headerManager.updateAuthUI();
      
    } catch (error) {
      debug.error(DEBUG_CATEGORIES.AUTH, 'Background auth check failed:', error);
      // Stay on upload page - no impact to user experience
    }
  }

  /**
   * Load recipes in background without blocking UI (performance optimized)
   */
  async loadRecipesInBackground() {
    try {
      debug.log(DEBUG_CATEGORIES.AUTH, 'Loading recipes in background...');
      
      // Use setTimeout to yield to browser for UI rendering
      setTimeout(async () => {
        try {
          // Load recipes directly (remove caching overhead)
          const recipes = await storageManager.listRecipes(true);
          debug.log(DEBUG_CATEGORIES.STORAGE, `Background load complete: Found ${recipes ? recipes.length : 0} saved recipes`);
          
          // Update UI with loaded recipes
          if (recipes && recipes.length > 0) {
            // Check if recipes are already displayed OR loading is in progress
            const existingCards = document.querySelectorAll('.recipe-card:not(.skeleton-card)');
            const skeletonCards = document.querySelectorAll('.skeleton-card');
            
            if (existingCards.length === 0 && skeletonCards.length === 0) {
              debug.log(DEBUG_CATEGORIES.STORAGE, `No existing recipe cards found, rendering ${recipes.length} recipes`);
              myRecipesPage.recipes = recipes;
              myRecipesPage.renderRecipes();
            } else {
              debug.log(DEBUG_CATEGORIES.STORAGE, `Found ${existingCards.length} existing recipe cards and ${skeletonCards.length} skeleton cards, skipping renderRecipes() to avoid duplication`);
            }
          } else {
            // Show empty state
            const emptyState = document.getElementById('emptyState');
            if (emptyState) {
              emptyState.classList.remove('u-hidden');
              emptyState.classList.add('u-block');
            }
          }
        } catch (error) {
          debug.error(DEBUG_CATEGORIES.STORAGE, 'Error during background recipe load:', error);
        }
      }, 10); // Small delay to let UI render first
      
    } catch (error) {
      debug.error(DEBUG_CATEGORIES.STORAGE, 'Error initiating background load:', error);
    }
  }

  /**
   * Get user's recipes without artificial delays (optimized for initial load)
   */
  async getRecipesWithoutDelay() {
    try {
      debug.log(DEBUG_CATEGORIES.AUTH, 'Fast-loading recipes for authenticated user...');
      
      // Initialize storage manager if needed
      await storageManager.init();
      
      // Get user's recipes directly (remove caching overhead)
      const recipes = await storageManager.listRecipes(true);
      debug.log(DEBUG_CATEGORIES.STORAGE, `Fast-load complete: Found ${recipes ? recipes.length : 0} saved recipes`);
      
      return recipes;
    } catch (error) {
      debug.error(DEBUG_CATEGORIES.STORAGE, 'Error during fast recipe load:', error);
      return null;
    }
  }

  /**
   * Lazy load modules on-demand for better performance
   */
  async ensureModuleLoaded(moduleName) {
    if (this.lazyModulesLoaded.has(moduleName)) {
      return; // Already loaded
    }

    performance.mark(`lazy-load-${moduleName}-start`);
    
    try {
      switch (moduleName) {
        case 'parser':
          if (!this.parser) {
            this.parser = await LazyModules.getParserManager();
            debug.log(DEBUG_CATEGORIES.LOADING, 'Lazy loaded: ParserManager');
          }
          break;
          
        case 'validator':
          if (!this.validator) {
            this.validator = await LazyModules.getRecipeValidator();
            debug.log(DEBUG_CATEGORIES.LOADING, 'Lazy loaded: RecipeValidator');
          }
          break;
          
        case 'calculator':
          if (!this.calculator) {
            this.calculator = await LazyModules.getCalculationOrchestrator();
            debug.log(DEBUG_CATEGORIES.LOADING, 'Lazy loaded: CalculationOrchestrator');
          }
          break;
          
        case 'formatter':
          if (!this.formatter) {
            this.formatter = await LazyModules.getRecipeFormatter();
            debug.log(DEBUG_CATEGORIES.LOADING, 'Lazy loaded: RecipeFormatter');
          }
          break;
          
        case 'renderer':
          if (!this.renderer) {
            this.renderer = await LazyModules.getRecipeRenderer();
            debug.log(DEBUG_CATEGORIES.LOADING, 'Lazy loaded: RecipeRenderer');
          }
          break;
          
        case 'sectionManager':
          if (!this.sectionManager) {
            this.sectionManager = await LazyModules.getSectionManager();
            this.sectionManager.init();
            debug.log(DEBUG_CATEGORIES.LOADING, 'Lazy loaded: SectionManager');
          }
          break;
          
        case 'printControls':
          if (!this.printControls) {
            this.printControls = await LazyModules.getPrintControls();
            this.printControls.init();
            debug.log(DEBUG_CATEGORIES.LOADING, 'Lazy loaded: PrintControls');
          }
          break;
          
        case 'dataPreview':
          if (!this.dataPreview) {
            this.dataPreview = await LazyModules.getDataPreview();
            debug.log(DEBUG_CATEGORIES.LOADING, 'Lazy loaded: DataPreview');
          }
          break;
          
        case 'debugToggle':
          if (!this.debugToggle) {
            this.debugToggle = await LazyModules.getDebugToggle();
            debug.log(DEBUG_CATEGORIES.LOADING, 'Lazy loaded: DebugToggle');
          }
          break;
      }
      
      this.lazyModulesLoaded.add(moduleName);
      performance.mark(`lazy-load-${moduleName}-complete`);
      performance.measure(`lazy-load-${moduleName}`, `lazy-load-${moduleName}-start`, `lazy-load-${moduleName}-complete`);
      
    } catch (error) {
      debug.error(DEBUG_CATEGORIES.LOADING, `Failed to lazy load ${moduleName}:`, error);
    }
  }

  /**
   * Preload likely-needed modules in background
   */
  async preloadModules(moduleNames) {
    // Load modules in background without blocking
    setTimeout(async () => {
      for (const moduleName of moduleNames) {
        try {
          await this.ensureModuleLoaded(moduleName);
        } catch (error) {
          debug.warn(DEBUG_CATEGORIES.LOADING, `Failed to preload ${moduleName}:`, error);
        }
      }
    }, 100); // Small delay to not interfere with critical path
  }

  /**
   * Load shared recipe using new token system
   * @param {string} shareToken - Share token from URL
   */
  async loadSharedRecipeByToken(shareToken) {
    try {
      // Show loading state
      this.showToast('Loading shared recipe...', 'info');
      
      // Load via share token
      const recipe = await storageManager.loadSharedRecipe(shareToken);
      
      // Set parsed data for data-preview navigation (use recipe data as fallback)
      this.navigationManager.setParsedData(recipe.originalData || recipe);
      this.navigationManager.setValidatedData(recipe.validatedData || recipe);
      
      // Store and display recipe
      this.navigationManager.setCurrentRecipe(recipe);
      this.navigationManager.switchToView('recipe-view');
      
      // Clear any previous recipe image data to prevent conflicts
      this.clearPreviousRecipeImage();
      
      // Set the current recipe ID for image loading
      window.currentRecipeId = recipe.id;
      
      // Render the recipe
      const container = document.getElementById('recipeContainer');
      if (container) {
        this.renderer.render(recipe, container);
        this.sectionManager.setupControls(recipe);
        this.sectionManager.applyPreferences();
        this.loadRecipeImage(recipe.id);
      }
      
      this.showToast('Shared recipe loaded successfully!', 'success');
      
      // Clean URL (optional - removes token from address bar)
      window.history.replaceState({}, document.title, window.location.pathname);
      
    } catch (error) {
      // Handle share access errors gracefully
      if (error.isPrivateAccess || error.isExpiredShare || error.isInvalidShare) {
        this.showPrivateRecipeMessage(error.userMessage);
      } else {
        this.showToast(`Failed to load shared recipe: ${error.message}`, 'error');
        this.navigationManager.switchToView('upload');
      }
    }
  }

  /**
   * Handle legacy shared recipe URLs during migration
   * @param {Object} recipeInfo - Legacy recipe info from URL
   */
  async handleLegacySharedRecipe(recipeInfo) {
    try {
      // Load via legacy method
      const recipe = await storageManager.loadRecipe(recipeInfo.recipeId, recipeInfo.ownerId);
      
      // Set parsed data for data-preview navigation (use recipe data as fallback)
      this.navigationManager.setParsedData(recipe.originalData || recipe);
      this.navigationManager.setValidatedData(recipe.validatedData || recipe);
      
      // Store the recipe and switch to recipe view
      this.navigationManager.setCurrentRecipe(recipe);
      this.navigationManager.switchToView('recipe-view');
      
      // Clear any previous recipe image data to prevent conflicts
      this.clearPreviousRecipeImage();
      
      // Set the current recipe ID for image loading
      window.currentRecipeId = recipe.id;
      
      // Render the recipe
      const container = document.getElementById('recipeContainer');
      if (container) {
        this.renderer.render(recipe, container);
        this.sectionManager.setupControls(recipe);
        this.sectionManager.applyPreferences();
        this.loadRecipeImage(recipe.id);
      }
      
      this.showToast('Shared recipe loaded successfully!', 'success');
      
      // Suggest creating new share link if user is owner
      const currentUserId = storageManager.getEffectiveUserId();
      if (recipeInfo.ownerId === currentUserId) {
        setTimeout(() => {
          this.showToast('Recipe sharing has been improved! Create new share links from My Recipes.', 'info');
        }, 3000);
      }
      
    } catch (error) {
      // Handle legacy sharing errors
      if (error.isPrivateAccess || error.isExpiredShare || error.isInvalidShare) {
        this.showPrivateRecipeMessage(error.userMessage);
      } else {
        this.showToast('Failed to load recipe', 'error');
        this.navigationManager.switchToView('upload');
      }
    }
  }

  /**
   * Show a user-friendly message for recipe access errors (private, invalid, expired)
   */
  showPrivateRecipeMessage(message) {
    // Switch to upload page to provide a clean base
    this.navigationManager.switchToView('upload');
    
    // Determine icon and title based on message type
    let icon = '🔒';
    let title = 'Access Restricted';
    
    if (message.includes('expired')) {
      icon = '⏰';
      title = 'Link Expired';
    } else if (message.includes('invalid') || message.includes('revoked') || message.includes('removed')) {
      icon = '❌';
      title = 'Invalid Link';
    } else if (message.includes('private')) {
      icon = '🔒';
      title = 'Private Recipe';
    }
    
    // Create a recipe access message overlay (XSS-safe)
    const overlay = document.createElement('div');
    overlay.className = 'private-recipe-overlay';
    
    // Create secure message element to prevent XSS injection
    const messageContainer = document.createElement('div');
    messageContainer.className = 'private-recipe-message';
    
    const iconElement = document.createElement('div');
    iconElement.className = 'private-recipe-icon';
    iconElement.textContent = sanitizeText(icon); // Sanitized for security
    
    const titleElement = document.createElement('h2');
    titleElement.textContent = sanitizeText(title); // Sanitized for security
    
    const messageElement = document.createElement('p');
    messageElement.textContent = sanitizeText(message); // Sanitized - prevents XSS injection
    
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'private-recipe-actions';
    
    const homeButton = document.createElement('button');
    homeButton.className = 'btn btn--primary';
    homeButton.textContent = '🏠 Go Home';
    homeButton.addEventListener('click', () => {
      window.location.href = window.location.origin + window.location.pathname;
    });
    
    // Assemble the secure message structure
    actionsContainer.appendChild(homeButton);
    messageContainer.appendChild(iconElement);
    messageContainer.appendChild(titleElement);
    messageContainer.appendChild(messageElement);
    messageContainer.appendChild(actionsContainer);
    overlay.appendChild(messageContainer);
    
    // Styles now handled by CSS classes
    
    // Message div styles handled by CSS classes
    
    // Icon styles handled by CSS classes
    
    // Heading, paragraph, and actions styles handled by CSS classes
    
    // Home button styles and hover handled by CSS classes
    
    document.body.appendChild(overlay);
  }

  /**
   * Load recipe image from localStorage and display it
   */
  loadRecipeImage(recipeId) {
    if (!recipeId) return;
    
    // Ensure window.currentRecipeId is set to the correct recipe
    window.currentRecipeId = recipeId;
    
    // Wait a bit for the DOM to be ready
    setTimeout(() => {
      // Check if recipe image manager exists and trigger image loading
      const imageManager = window.recipeImageManager;
      if (imageManager && imageManager.loadImageFromStorage) {
        imageManager.loadImageFromStorage();
      }
    }, 100);
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
    const autoRemoveTimer = setTimeout(() => this.removeToast(toast), TIMING.TOAST_DURATION);
    
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
   * Clear previous recipe image data to prevent conflicts
   */
  clearPreviousRecipeImage() {
    // Clear any existing currentRecipeId to prevent old images from loading
    if (window.currentRecipeId) {
      window.currentRecipeId = null;
    }
    
    // Clear any displayed recipe image
    if (window.recipeImageManager && window.recipeImageManager.clearImage) {
      window.recipeImageManager.clearImage();
    }
  }

  /**
   * Generate a unique ID for a recipe based on its properties and timestamp
   */
  generateRecipeId(recipe) {
    // Generate a unique ID based on recipe name, properties, and timestamp
    const nameHash = recipe.name || 'unnamed';
    const ogHash = recipe.og ? recipe.og.toFixed(3) : '1.000';
    const fgHash = recipe.fg ? recipe.fg.toFixed(3) : '1.000';
    const batchSize = recipe.batchSize ? recipe.batchSize.toFixed(1) : '5.0';
    const timestamp = Date.now().toString();
    
    // Create a hash-like string with timestamp to ensure uniqueness
    const hashString = `${nameHash}_${ogHash}_${fgHash}_${batchSize}_${timestamp}`;
    
    // Convert to base64 and clean it up for use as an ID
    try {
      return btoa(hashString)
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 20); // Increased length to accommodate timestamp
    } catch (error) {
      // Fallback if btoa fails
      return (hashString + '_' + Math.random().toString(36))
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 20);
    }
  }

  /**
   * Initialize version display on the page
   */
  async initVersionDisplay() {
    // Skip version display in development environment
    const isDevelopment = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' ||
                         window.location.port !== '';
    
    if (isDevelopment) {
      return; // No version display in development
    }
    
    try {
      const { VERSION_INFO } = await import('./version.js');
      
      // Create version display element
      const versionDisplay = document.createElement('div');
      versionDisplay.className = 'version-info u-print-hidden';
      versionDisplay.innerHTML = `ver. ${VERSION_INFO.version}`;
      versionDisplay.title = `Built: ${VERSION_INFO.buildTime} | Branch: ${VERSION_INFO.branch}`;
      
      // Add click-to-copy behavior (discreet, no feedback)
      versionDisplay.addEventListener('click', () => {
        navigator.clipboard.writeText(VERSION_INFO.version).catch(() => {
          // Silent failure - no user feedback
        });
      });
      
      document.body.appendChild(versionDisplay);
      
    } catch (error) {
      // Silent - version info only available in deployed builds
    }
  }

  /**
   * Clean up application resources
   * Proper cleanup on page navigation or app shutdown
   */
  destroy() {
    debug.log(DEBUG_CATEGORIES.CORE, 'BrewLogApp cleanup starting...');

    try {
      // Stop performance monitoring
      if (this.performanceMonitor) {
        this.performanceMonitor.stop();
      }

      // Clear current recipe state
      window.currentRecipeId = null;

      // Note: Container cleanup is handled by beforeunload event listener
      // to avoid circular dependency with container.unregister() calling destroy()
      
      debug.log(DEBUG_CATEGORIES.CORE, 'BrewLogApp cleanup complete');
    } catch (error) {
      debug.warn(DEBUG_CATEGORIES.CORE, 'Error during BrewLogApp cleanup:', error);
    }
  }

}

// Backward compatibility: Create window property getters that delegate to container
// This allows existing code to continue using window.headerManager, etc.
Object.defineProperty(window, 'headerManager', {
  get() {
    return container.get('headerManager');
  },
  configurable: true
});

Object.defineProperty(window, 'myRecipesPage', {
  get() {
    return container.get('myRecipesPage');
  },
  configurable: true
});

Object.defineProperty(window, 'brewLogApp', {
  get() {
    return container.get('brewLogApp');
  },
  configurable: true
});

Object.defineProperty(window, 'navigationManager', {
  get() {
    return container.get('navigationManager');
  },
  configurable: true
});

// Export the class for testing
export { BrewLogApp };

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  const app = new BrewLogApp();
  // Register main app instance in dependency container
  container.register('brewLogApp', app);
  await app.init();
});

// Clean up resources on page unload
window.addEventListener('beforeunload', () => {
  const app = container.get('brewLogApp');
  if (app && typeof app.destroy === 'function') {
    app.destroy();
  }
});