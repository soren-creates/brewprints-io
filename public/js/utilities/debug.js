/**
 * Debug Utility
 * Centralized debug logging system with toggle functionality
 */

class Debug {
  constructor() {
    this.enabled = false;
    this.categories = new Set();
    this.enabledCategories = new Set();
    this.usedCategories = new Set(); // Track categories that actually have debug statements
    
    // Detect environment for security
    this.isProduction = this.detectProductionMode();
    
    // Load debug state from localStorage first
    this.loadState();
    
    // Pre-register all available debug categories (and set defaults if needed)
    this.registerCategories();
    
    // Expose to window for easy console access (development only)
    if (typeof window !== 'undefined' && !this.isProduction) {
      window.debug = this;
    }
  }

  /**
   * Detect production mode for security measures
   * @returns {boolean} True if running in production
   */
  detectProductionMode() {
    // Same logic as environment config
    const hostname = window.location.hostname;
    const devHostnames = ['localhost', '127.0.0.1', '0.0.0.0'];
    const isDevHostname = devHostnames.some(devHost => hostname === devHost || hostname.includes(devHost));
    const hasDevPort = window.location.port && parseInt(window.location.port) < 8000;
    
    return !(isDevHostname || hasDevPort || window.location.search.includes('dev=true'));
  }

  /**
   * Register all available debug categories
   */
  registerCategories() {
    const availableCategories = [
      'storage', 'parser', 'validator', 'auth', 
      'calculator', 'renderer', 'error', 'offline', 
      'duplicate', 'loading', 'serviceworker', 'ui'
    ];
    
    // Categories that have debug statements implemented
    const implementedCategories = [
      'storage', 'parser', 'validator', 'offline', 'duplicate', 'loading', 'auth', 'serviceworker', 'ui'
    ];
    
    availableCategories.forEach(category => {
      this.categories.add(category);
    });

    // Pre-populate implemented categories
    implementedCategories.forEach(category => {
      this.usedCategories.add(category);
    });

    // Default state: Debug off, no categories enabled
    // Users can enable debug and specific categories when needed
  }

  /**
   * Load debug state from localStorage
   */
  loadState() {
    try {
      const saved = localStorage.getItem('brewlog-debug-state');
      if (saved) {
        const state = JSON.parse(saved);
        this.enabled = state.enabled || false;
        this.enabledCategories = new Set(state.enabledCategories || []);
      }
    } catch (error) {
      // Ignore localStorage errors
    }
  }

  /**
   * Save debug state to localStorage (production-safe)
   */
  saveState() {
    try {
      if (this.isProduction) {
        // Production: Only save essential state, no sensitive information
        const safeState = {
          enabled: this.enabled,
          enabledCategories: Array.from(this.enabledCategories).filter(cat => 
            ['error', 'auth'].includes(cat) // Only allow essential categories in production
          )
        };
        localStorage.setItem('brewlog-debug-state', JSON.stringify(safeState));
      } else {
        // Development: Full debug state
        const state = {
          enabled: this.enabled,
          enabledCategories: Array.from(this.enabledCategories)
        };
        localStorage.setItem('brewlog-debug-state', JSON.stringify(state));
      }
    } catch (error) {
      // Ignore localStorage errors
    }
  }

  /**
   * Enable debug mode
   * @param {string|Array<string>} [categories] - Specific categories to enable, or all if not specified
   */
  enable(categories = null) {
    this.enabled = true;
    
    if (categories) {
      const cats = Array.isArray(categories) ? categories : [categories];
      cats.forEach(cat => this.enabledCategories.add(cat));
    } else {
      // Enable all known categories
      this.categories.forEach(cat => this.enabledCategories.add(cat));
    }
    
    this.saveState();
    console.log('🐛 Debug mode enabled for:', Array.from(this.enabledCategories));
  }

  /**
   * Disable debug mode
   * @param {string|Array<string>} [categories] - Specific categories to disable, or all if not specified
   */
  disable(categories = null) {
    if (categories) {
      const cats = Array.isArray(categories) ? categories : [categories];
      cats.forEach(cat => this.enabledCategories.delete(cat));
    } else {
      // Disable everything (master toggle and all categories)
      this.enabled = false;
      this.enabledCategories.clear();
    }
    
    this.saveState();
    console.log('🐛 Debug mode disabled for:', categories || 'all categories');
  }

  /**
   * Enable all categories without affecting master debug state
   */
  enableAllCategories() {
    // Only enable implemented categories
    this.usedCategories.forEach(cat => this.enabledCategories.add(cat));
    this.saveState();
    console.log('🐛 All implemented debug categories enabled');
  }

  /**
   * Disable all categories without affecting master debug state
   */
  disableAllCategories() {
    this.enabledCategories.clear();
    this.saveState();
    console.log('🐛 All debug categories disabled');
  }

  /**
   * Toggle debug mode
   * @param {string|Array<string>} [categories] - Specific categories to toggle
   */
  toggle(categories = null) {
    if (categories) {
      // Toggle specific categories
      if (this.enabled && this.isEnabled(categories)) {
        this.disable(categories);
      } else {
        this.enable(categories);
      }
    } else {
      // Toggle master debug state without affecting categories
      this.toggleMasterDebug();
    }
  }

  /**
   * Toggle just the master debug state without affecting category selections
   */
  toggleMasterDebug() {
    this.enabled = !this.enabled;
    this.saveState();
    console.log('🐛 Master debug mode:', this.enabled ? 'enabled' : 'disabled');
  }

  /**
   * Check if debug is enabled for a category
   * @param {string} category - The category to check
   * @returns {boolean} - True if debug is enabled for this category
   */
  isEnabled(category = null) {
    if (!this.enabled) return false;
    if (!category) return true;
    
    this.categories.add(category); // Track all categories that are registered
    this.usedCategories.add(category); // Track categories that actually have debug statements
    return this.enabledCategories.has(category);
  }

  /**
   * Log a debug message
   * @param {string} category - The debug category
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  log(category, message, ...args) {
    if (this.isEnabled(category)) {
      const timestamp = new Date().toISOString().substr(11, 12);
      console.log(`🐛 [${timestamp}] [${category}] ${message}`, ...args);
    }
  }

  /**
   * Log an error debug message
   * @param {string} category - The debug category
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  error(category, message, ...args) {
    if (this.isEnabled(category)) {
      const timestamp = new Date().toISOString().substr(11, 12);
      console.error(`🐛 [${timestamp}] [${category}] ${message}`, ...args);
    }
  }

  /**
   * Log a warning debug message
   * @param {string} category - The debug category
   * @param {string} message - The message to log
   * @param {...any} args - Additional arguments to log
   */
  warn(category, message, ...args) {
    if (this.isEnabled(category)) {
      const timestamp = new Date().toISOString().substr(11, 12);
      console.warn(`🐛 [${timestamp}] [${category}] ${message}`, ...args);
    }
  }

  /**
   * Group debug messages
   * @param {string} category - The debug category
   * @param {string} label - The group label
   * @param {Function} fn - Function to execute within the group
   */
  group(category, label, fn) {
    if (this.isEnabled(category)) {
      console.group(`🐛 [${category}] ${label}`);
      try {
        fn();
      } finally {
        console.groupEnd();
      }
    } else {
      // Still execute the function, just without grouping
      fn();
    }
  }

  /**
   * Get current debug status
   * @returns {Object} - Current debug state
   */
  getStatus() {
    return {
      enabled: this.enabled,
      categories: Array.from(this.categories),
      enabledCategories: Array.from(this.enabledCategories)
    };
  }

  /**
   * List all available categories
   * @returns {Array<string>} - All known categories
   */
  getCategories() {
    return Array.from(this.categories);
  }

  /**
   * Check if a category has been used (has debug statements)
   * @param {string} category - The category to check
   * @returns {boolean} - True if category has been used
   */
  isCategoryImplemented(category) {
    return this.usedCategories.has(category);
  }

  /**
   * Show help for debug commands
   */
  help() {
    console.log(`
🐛 Debug Utility Help:

Basic Commands:
  debug.enable()           - Enable debug for all categories
  debug.enable('storage')  - Enable debug for specific category
  debug.disable()          - Disable all debug
  debug.disable('parser')  - Disable debug for specific category
  debug.toggle()           - Toggle debug mode
  debug.getStatus()        - Show current debug state

Categories:
  ${this.getCategories().join(', ') || 'None registered yet'}

Examples:
  debug.enable(['storage', 'parser'])  - Enable multiple categories
  debug.log('storage', 'Test message') - Log to storage category
  debug.group('parser', 'Parsing File', () => {
    debug.log('parser', 'Step 1');
    debug.log('parser', 'Step 2');
  });
    `);
  }
}

// Create and export singleton instance
export const debug = new Debug();

// Debug categories used throughout the application
export const DEBUG_CATEGORIES = {
  STORAGE: 'storage',
  PARSER: 'parser',
  VALIDATOR: 'validator',
  AUTH: 'auth',
  CALCULATOR: 'calculator',
  RENDERER: 'renderer',
  ERROR: 'error',
  OFFLINE: 'offline',
  DUPLICATE: 'duplicate',
  LOADING: 'loading',
  SERVICEWORKER: 'serviceworker',
  UI: 'ui'
};