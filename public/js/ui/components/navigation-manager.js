/**
 * Navigation Manager
 * Handles view switching and navigation state for the application
 * 
 * Uses a configuration-driven approach with VIEW_CONFIGS to define view transitions.
 * The generic switchToView method handles all navigation using centralized configuration.
 */

import { EVENTS } from '../../core/constants.js';
import { errorHandler } from '../../utilities/errors/error-handler.js';
import { DataLoadError, ValidationError } from '../../utilities/errors/application-errors.js';

/**
 * View configuration object defining show/hide elements and special actions for each view
 * @type {Object.<string, {show: string[], hide: string[], specialActions: string[], scrollBehavior: string, requirements: string|null, currentViewName: string, eventDetail: string}>}
 */
const VIEW_CONFIGS = {
  'upload': {
    show: ['fileInputContainer'],
    hide: ['recipe-page', 'data-preview-page', 'my-recipes-page', 'sectionControls'],
    specialActions: ['clearData', 'resetFileInput', 'clearRecipeContainer'],
    scrollBehavior: 'immediate',
    requirements: null,
    currentViewName: 'upload',
    eventDetail: 'upload'
  },
  'data-preview': {
    show: ['data-preview-page'],  
    hide: ['fileInputContainer', 'recipe-page', 'my-recipes-page'],
    specialActions: ['createDataPreviewIfNeeded'],
    scrollBehavior: 'immediate',
    requirements: 'parsedData',
    currentViewName: 'data-preview',
    eventDetail: 'data-preview'
  },
  'recipe-view': {
    show: ['recipe-page', 'sectionControls'],
    hide: ['fileInputContainer', 'data-preview-page', 'my-recipes-page'], 
    specialActions: ['disableScrollRestoration'],
    scrollBehavior: 'delayed',
    requirements: null,
    currentViewName: 'recipe-view',
    eventDetail: 'recipe-view'
  },
  'my-recipes': {
    show: ['my-recipes-page'],
    hide: ['fileInputContainer', 'recipe-page', 'data-preview-page', 'sectionControls'],
    specialActions: [],
    scrollBehavior: 'immediate',
    requirements: null,
    currentViewName: 'my-recipes',
    eventDetail: 'my-recipes'
  }
};

export class NavigationManager {
  constructor() {
    this.currentView = 'upload';
    this.parsedData = null; // raw parsed data (for data preview analysis)
    this.validatedData = null; // validated data (for recipe rendering)
    this.currentRecipe = null;
  }

  /**
   * Initialize the navigation manager
   */
  init() {
    // Start with upload view
    this.switchToView('upload');
  }

  /**
   * Set the parsed data for navigation context
   * @param {Object} data - The parsed recipe data
   */
  setParsedData(data) {
    this.parsedData = data;
  }

  setValidatedData(data) {
    this.validatedData = data;
  }

  /**
   * Set the current recipe for navigation context
   * @param {Object} recipe - The formatted recipe data
   */
  setCurrentRecipe(recipe) {
    this.currentRecipe = recipe;
  }

  /**
   * Show DOM elements by adding active class and setting display
   * @param {string[]} elementIds - Array of element IDs to show
   */
  _showElements(elementIds) {
    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.classList.add('active');
        element.classList.remove('u-hidden');
        element.classList.add('u-block');
      }
    });
  }

  /**
   * Hide DOM elements by removing active class and setting display
   * @param {string[]} elementIds - Array of element IDs to hide
   */
  _hideElements(elementIds) {
    elementIds.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.classList.remove('active');
        element.classList.remove('u-block');
        element.classList.add('u-hidden');
      }
    });
  }

  /**
   * Execute special actions for view transitions
   * @param {string[]} actions - Array of action names to execute
   * @returns {Element|null} Created element if any, null otherwise
   */
  _executeSpecialActions(actions) {
    let createdElement = null;
    
    actions.forEach(action => {
      switch (action) {
        case 'clearData':
          this.parsedData = null;
          this.validatedData = null;
          this.currentRecipe = null;
          break;
        case 'resetFileInput':
          const fileInput = document.getElementById('fileInput');
          if (fileInput) fileInput.value = '';
          break;
        case 'clearRecipeContainer':
          const recipeContainer = document.getElementById('recipeContainer');
          if (recipeContainer) recipeContainer.innerHTML = '';
          break;
        case 'createDataPreviewIfNeeded':
          let dataPreviewContainer = document.getElementById('data-preview-page');
          if (!dataPreviewContainer) {
            dataPreviewContainer = document.createElement('div');
            dataPreviewContainer.id = 'data-preview-page';
            dataPreviewContainer.className = 'page';
            document.body.appendChild(dataPreviewContainer);
          }
          // Always return the container (newly created or existing)
          createdElement = dataPreviewContainer;
          break;
        case 'disableScrollRestoration':
          if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
          }
          break;
      }
    });
    
    return createdElement;
  }

  /**
   * Handle scrolling behavior for view transitions
   * @param {string} behavior - 'immediate' or 'delayed'
   */
  _handleScrolling(behavior) {
    if (behavior === 'immediate') {
      window.scrollTo(0, 0);
    } else if (behavior === 'delayed') {
      setTimeout(() => window.scrollTo(0, 0), 1);
    }
  }

  /**
   * Generic view switching method using configuration-driven approach
   * 
   * This method handles all view transitions using the VIEW_CONFIGS object,
   * eliminating code duplication and providing consistent behavior.
   * 
   * @param {string} viewName - Name of view to switch to ('upload', 'data-preview', 'recipe-view')
   * @param {Object} [options={}] - Optional parameters for future extensibility
   * @returns {Element|null} Created or existing element if special actions create/return one, null otherwise
   * 
   * @example
   * // Switch to upload view
   * navigationManager.switchToView('upload');
   * 
   * // Switch to data preview (requires parsedData)
   * const container = navigationManager.switchToView('data-preview');
   * if (container) {
   *   // Render content into the returned container
   * }
   */
  switchToView(viewName, options = {}) {
    // Hide My Recipes floating button on all views except My Recipes
    if (viewName !== 'my-recipes' && window.myRecipesPage && window.myRecipesPage.floatingUploadBtn) {
      window.myRecipesPage.floatingUploadBtn.classList.remove('u-flex');
      window.myRecipesPage.floatingUploadBtn.classList.add('u-hidden');
    }
    
    const config = VIEW_CONFIGS[viewName];
    if (!config) {
      errorHandler.handleError(new ValidationError(`Unknown view: ${viewName}`, {
        userMessage: 'Navigation error occurred. Please refresh the page.',
        severity: 'warning',
        recoverable: true,
        details: { component: 'navigation-manager', viewName }
      }));
      return null;
    }

    // Check requirements
    if (config.requirements === 'parsedData' && !this.parsedData) {
      errorHandler.handleError(new DataLoadError(`Cannot navigate to ${viewName}: missing parsed data`, {
        userMessage: 'Please upload and process a recipe file first.',
        severity: 'warning',
        recoverable: true,
        details: { component: 'navigation-manager', viewName, requirement: 'parsedData' }
      }));
      return null;
    }

    // Handle scrolling first
    this._handleScrolling(config.scrollBehavior);

    // Hide elements
    this._hideElements(config.hide);

    // Execute special actions (may create elements)
    const createdElement = this._executeSpecialActions(config.specialActions);

    // Show elements
    this._showElements(config.show);

    // Update current view
    this.currentView = config.currentViewName;

    // Dispatch page changed event
    window.dispatchEvent(new CustomEvent(EVENTS.PAGE_CHANGED, { 
      detail: { page: config.eventDetail } 
    }));

    return createdElement;
  }


  /**
   * Get the current view
   * @returns {string} Current view name
   */
  getCurrentView() {
    return this.currentView;
  }

  /**
   * Check if navigation can go to a specific view
   * @param {string} view - View name to check
   * @returns {boolean} Whether navigation to view is allowed
   */
  canNavigateTo(view) {
    switch (view) {
      case 'upload':
        return true;
      case 'data-preview':
        return this.parsedData !== null;
      case 'recipe-view':
        return this.currentRecipe !== null;
      default:
        return false;
    }
  }
}