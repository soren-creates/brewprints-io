/**
 * Main Application Entry Point
 * Handles file loading and app initialization
 */

import { ParserManager } from '../parsers/parser-manager.js';
import { RecipeValidator } from './recipe-validator.js';
import { CalculationOrchestrator } from './calculation-orchestrator.js';
import { RecipeFormatter } from './formatter.js';
import { RecipeRenderer } from '../ui/recipe-renderer.js';
import { SectionManager } from '../ui/components/section-manager.js';
import { PrintControls } from '../ui/components/print-controls.js';
import { DataPreview } from '../ui/pages/data-preview.js';
import { HeaderManager } from '../ui/components/header-manager.js';
import { NavigationManager } from '../ui/components/navigation-manager.js';
import { errorHandler } from '../utilities/errors/error-handler.js';
import { EVENTS } from './constants.js';
import { storageManager } from '../storage/storage-manager.js';
import { myRecipesPage } from '../ui/pages/my-recipes.js';
import { clerkAuth } from '../auth/clerk-config.js';
import { debugToggle } from '../ui/components/debug-toggle.js';
import { initSharingPerformance } from '../utilities/performance/sharing-performance.js';

class BrewLogApp {
  constructor() {
    this.parser = new ParserManager();
    this.validator = new RecipeValidator();
    this.calculator = new CalculationOrchestrator();
    this.formatter = new RecipeFormatter();
    this.renderer = new RecipeRenderer();
    this.sectionManager = new SectionManager();
    this.printControls = new PrintControls();
    this.dataPreview = new DataPreview();
    this.headerManager = new HeaderManager();
    this.navigationManager = new NavigationManager();
  }

  async init() {
    this.setupEventListeners();
    this.sectionManager.init();
    this.printControls.init();
    this.headerManager.init();
    this.navigationManager.init();
    
    // Link navigation manager to header manager for save button state management
    this.headerManager.navigationManager = this.navigationManager;
    
    // Make headerManager globally accessible for other components
    window.headerManager = this.headerManager;
    myRecipesPage.init();
    
    // Make myRecipesPage globally accessible for navigation management
    window.myRecipesPage = myRecipesPage;
    
    // Only show debug controls in development environment
    const isDevelopment = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1' ||
                         window.location.port !== '';
    
    if (isDevelopment) {
      debugToggle.init();
    }
    
    // Add version display to page
    this.initVersionDisplay();
    
    // Enable debug mode for enhanced error logging
    errorHandler.init({ debugMode: true });
    
    // Initialize performance monitoring for sharing system
    initSharingPerformance();
    
    // Check authentication state on app initialization
    await clerkAuth.checkAuthState();
    this.headerManager.updateAuthUI();
    
    // Check if there's a recipe ID in the URL (for sharing) - do this first
    const hasSharedRecipe = await this.checkForSharedRecipe();
    
    // If no shared recipe was loaded, proceed with normal initialization
    if (!hasSharedRecipe) {
      // Run privacy migration for existing users (silent, non-blocking)
      if (clerkAuth.isUserSignedIn()) {
        storageManager.migrateRecipePrivacy().catch(error => {
          console.warn('Privacy migration failed (non-critical):', error);
        });
        
        // Check if logged-in user has saved recipes and show My Recipes if they do
        await this.checkAndShowMyRecipes();
      }
    }
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
      if (e.detail.isSignedIn) {
        // User just signed in, check if they have recipes and redirect if on upload page
        const currentView = this.navigationManager.getCurrentView();
        if (currentView === 'upload') {
          await this.checkAndShowMyRecipes();
        }
      } else {
        // User just signed out, redirect to upload page
        console.log('User signed out, redirecting to upload page...');
        this.navigationManager.switchToView('upload');
      }
    });
  }

  async handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    let currentPhase = 'initialization';
    try {
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
   * Check if logged-in user has saved recipes and show My Recipes page if they do
   */
  async checkAndShowMyRecipes() {
    // Only check if user is signed in
    if (!clerkAuth.isUserSignedIn()) {
      console.log('User not signed in, staying on upload page');
      return;
    }

    console.log('User is signed in, checking for saved recipes...');

    try {
      // Give Firebase and storage manager time to initialize properly
      // This is important for the first load after login
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get user's recipes
      const recipes = await storageManager.listRecipes();
      console.log(`Found ${recipes ? recipes.length : 0} saved recipes`);
      
      // If user has at least one saved recipe, show My Recipes page
      if (recipes && recipes.length > 0) {
        console.log('Switching to My Recipes page...');
        this.navigationManager.switchToView('my-recipes');
        // Small delay to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        await myRecipesPage.show();
      } else {
        console.log('No saved recipes found, staying on upload page');
      }
    } catch (error) {
      // If there's an error loading recipes, just stay on upload page
      console.error('Error checking saved recipes:', error);
      // In case of error, we stay on upload page (already there)
    }
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
    
    // Create a recipe access message overlay
    const overlay = document.createElement('div');
    overlay.className = 'private-recipe-overlay';
    overlay.innerHTML = `
      <div class="private-recipe-message">
        <div class="private-recipe-icon">${icon}</div>
        <h2>${title}</h2>
        <p>${message}</p>
        <div class="private-recipe-actions">
          <button class="btn btn--primary" onclick="window.location.href = window.location.origin + window.location.pathname">
            🏠 Go Home
          </button>
        </div>
      </div>
    `;
    
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
    const autoRemoveTimer = setTimeout(() => this.removeToast(toast), 5000);
    
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
      versionDisplay.className = 'version-info';
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

}

// Export the class for testing
export { BrewLogApp };

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  const app = new BrewLogApp();
  // Make app globally accessible for upload modal
  window.brewLogApp = app;
  await app.init();
});