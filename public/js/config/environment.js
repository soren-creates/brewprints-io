/**
 * Environment Configuration System
 * Manages environment-specific settings and API keys securely
 */

class EnvironmentConfig {
  constructor() {
    this.isDevelopment = this.detectDevelopmentMode();
    this.isProduction = !this.isDevelopment;
  }

  /**
   * Detect development mode based on hostname and other indicators
   * @returns {boolean} True if running in development mode
   */
  detectDevelopmentMode() {
    // Common development hostnames
    const devHostnames = [
      'localhost', 
      '127.0.0.1', 
      '0.0.0.0',
      'dev.brewprints.com',
      'staging.brewprints.com'
    ];
    
    // Check hostname
    const hostname = window.location.hostname;
    const isDevHostname = devHostnames.some(devHost => 
      hostname === devHost || hostname.includes(devHost)
    );
    
    // Check for development indicators
    const hasDevPort = window.location.port && parseInt(window.location.port) < 8000;
    const hasDevQuery = window.location.search.includes('dev=true');
    
    return isDevHostname || hasDevPort || hasDevQuery;
  }

  /**
   * Get Clerk publishable key based on environment
   * @returns {string} Clerk publishable key
   */
  getClerkKey() {
    if (this.isProduction) {
      // Production key should be fetched from configuration endpoint
      // This will be set by loadProductionConfig() during app initialization
      return window.CLERK_PRODUCTION_KEY || 
             this.throwMissingConfigError('CLERK_PRODUCTION_KEY');
    } else {
      // Development key should be injected via window (no hardcoded fallback)
      return window.CLERK_DEV_KEY ||
             this.throwMissingConfigError('CLERK_DEV_KEY');
    }
  }

  /**
   * Load configuration from Firebase Functions
   * This fetches the configuration and sets window globals for both dev and production
   * @returns {Promise<void>}
   */
  async loadConfig() {
    try {
      const response = await fetch('/api/config');
      if (!response.ok) {
        throw new Error(`Config fetch failed: ${response.status}`);
      }
      
      const config = await response.json();
      
      // Set the appropriate Clerk key as window global
      if (this.isProduction) {
        window.CLERK_PRODUCTION_KEY = config.clerkKey;
      } else {
        window.CLERK_DEV_KEY = config.clerkKey;
      }
      
    } catch (error) {
      console.error('Failed to load configuration:', error);
      throw error;
    }
  }

  /**
   * Get Firebase configuration based on environment
   * @returns {Object} Firebase configuration object
   */
  getFirebaseConfig() {
    if (this.isProduction) {
      // Production Firebase config should be injected during build
      return window.FIREBASE_PRODUCTION_CONFIG || 
             this.throwMissingConfigError('FIREBASE_PRODUCTION_CONFIG');
    } else {
      // Development Firebase config (if different from production)
      return window.FIREBASE_DEV_CONFIG || null; // Use default if not specified
    }
  }

  /**
   * Get debug mode setting based on environment
   * @returns {boolean} True if debug mode should be enabled
   */
  isDebugEnabled() {
    if (this.isProduction) {
      // Production: Only enable debug if explicitly set
      return window.ENABLE_PRODUCTION_DEBUG === true || 
             window.location.search.includes('debug=true');
    } else {
      // Development: Check window global, default to true
      return window.DEBUG_ENABLED !== false; // Default true unless explicitly disabled
    }
  }

  /**
   * Get performance monitoring setting
   * @returns {boolean} True if performance monitoring should store detailed data
   */
  isPerformanceMonitoringEnabled() {
    if (this.isProduction) {
      // Production: Limited performance data storage
      return false;
    } else {
      // Development: Full performance monitoring
      return true;
    }
  }

  /**
   * Get service worker cache name with environment prefix
   * @returns {string} Environment-specific cache name
   */
  getCacheName() {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return this.isProduction 
      ? `brewprints-prod-${timestamp}`
      : `brewprints-dev-${timestamp}`;
  }

  /**
   * Throw error for missing production configuration
   * @param {string} configName Name of missing configuration
   * @throws {Error} Configuration error with helpful message
   */
  throwMissingConfigError(configName) {
    const errorMessage = `
      Missing production configuration: ${configName}
      
      This error occurs when the application is running in production mode
      but required environment variables are not available.
      
      For production deployment, ensure:
      1. Build process injects window.${configName}
      2. Environment variables are properly configured
      3. Deployment script sets production configuration
      
      Current environment: ${this.isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}
      Hostname: ${window.location.hostname}
      Port: ${window.location.port || 'none'}
    `;
    
    throw new Error(errorMessage.trim());
  }

  /**
   * Get current environment information for debugging
   * @returns {Object} Environment information
   */
  getEnvironmentInfo() {
    return {
      isDevelopment: this.isDevelopment,
      isProduction: this.isProduction,
      hostname: window.location.hostname,
      port: window.location.port,
      protocol: window.location.protocol,
      debugEnabled: this.isDebugEnabled(),
      performanceMonitoring: this.isPerformanceMonitoringEnabled(),
      cacheName: this.getCacheName()
    };
  }
}

// Create and export singleton instance
export const environmentConfig = new EnvironmentConfig();

// Expose to window for debugging in development
if (environmentConfig.isDevelopment) {
  window.environmentConfig = environmentConfig;
}

/**
 * Legacy support - gradually replace direct config usage with environment config
 */
export const CONFIG = {
  get CLERK_DEV_KEY() {
    return environmentConfig.getClerkKey();
  },
  
  get FIREBASE_CONFIG() {
    return environmentConfig.getFirebaseConfig();
  },
  
  get DEBUG_ENABLED() {
    return environmentConfig.isDebugEnabled();
  },
  
  get IS_PRODUCTION() {
    return environmentConfig.isProduction;
  },
  
  get IS_DEVELOPMENT() {
    return environmentConfig.isDevelopment;
  }
};