import { ApplicationError, RecipeParsingError } from './application-errors.js';
import { TIMING } from '../../core/timing-constants.js';

/**
 * Central error handling service for the brewing application
 * Manages error logging, display, and notification
 */
class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.listeners = [];
    this.maxLogSize = 100;
    this.debugMode = false;
  }

  /**
   * Initialize error handler and set up global error listeners
   * @param {Object} options - Configuration options
   */
  init(options = {}) {
    this.debugMode = options.debugMode || false;
    
    // Capture unhandled errors
    window.addEventListener('error', (event) => this.handleGlobalError(event));
    
    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => this.handlePromiseError(event));
  }

  /**
   * Handle file parsing errors specifically
   * @param {Error} error - The parsing error
   * @param {string} fileName - Name of the file that failed to parse
   * @param {Object} context - Additional context about where the error occurred
   * @returns {RecipeParsingError} Normalized recipe parsing error
   */
  handleFileError(error, fileName = 'unknown file', context = {}) {
    // Enhanced logging for debugging
    const errorDetails = {
      fileName,
      originalError: error,
      errorType: 'file_parsing',
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      location: window.location.href
    };

    // Log detailed error info to console for debugging
    console.group(`🚨 Brewing Error in ${fileName}`);
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Error type:', error.constructor.name);
    console.error('Stack trace:', error.stack);
    if (context.phase) {
      console.error('Processing phase:', context.phase);
    }
    if (context.component) {
      console.error('Component:', context.component);
    }
    if (context.method) {
      console.error('Method:', context.method);
    }
    if (context.inputData) {
      console.error('Input data:', context.inputData);
    }
    console.error('Full error details:', errorDetails);
    console.groupEnd();
    
    // Create specific parsing error with file context
    const parsingError = new RecipeParsingError(error.message || 'File parsing failed', {
      userMessage: `Unable to parse "${fileName}". ${error.message || 'The file may be corrupted or in an unsupported format.'}`,
      details: errorDetails,
      recoverable: true
    });
    
    return this.handleError(parsingError, { fileName, source: 'file_parsing', ...context });
  }

  /**
   * Process an error through the standardized error handling pipeline
   * @param {Error} error - The error to handle
   * @param {Object} context - Additional context information
   * @returns {ApplicationError} Normalized application error
   */
  handleError(error, context = {}) {
    // Enhanced error logging with context
    console.group(`🔍 Processing Error`);
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Context:', context);
    
    // Normalize error to ApplicationError
    const appError = error instanceof ApplicationError ? 
      error : 
      new ApplicationError(error.message || 'Unknown error', { 
        details: { 
          originalError: error, 
          originalErrorType: error.constructor.name,
          originalErrorName: error.name,
          stack: error.stack,
          timestamp: new Date().toISOString(),
          ...context 
        } 
      });
    
    console.error('Normalized to ApplicationError:', appError);
    console.groupEnd();
    
    // Log error with context
    this.logError(appError);
    
    // Display user-friendly message if not in silent mode
    if (!context.silent) {
      this.displayUserMessage(appError);
    }
    
    // Notify listeners
    this.notifyListeners(appError);
    
    return appError;
  }

  /**
   * Add error to internal log
   * @param {ApplicationError} error - The error to log
   */
  logError(error) {
    // Add timestamp to error
    const errorWithTimestamp = {
      ...error,
      timestamp: new Date().toISOString()
    };
    
    // Add to log with size limit enforcement
    this.errorLog.unshift(errorWithTimestamp);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.pop();
    }
    
    // Log to console in debug mode
    if (this.debugMode) {
      console.error('Brewing Error:', error.name, error.message, error);
    }
  }

  /**
   * Display user-friendly error message
   * @param {ApplicationError} error - The error with user message
   */
  displayUserMessage(error) {
    // Use toast notifications for user-friendly display
    if (error.severity === 'error' && !error.recoverable) {
      // For non-recoverable errors, show persistent alert
      alert(`${error.userMessage} (${error.name})`);
    } else {
      // For recoverable errors and warnings, show toast notification
      this.showToast(error.userMessage, error.severity);
    }
    
    // Still log to console in debug mode
    if (this.debugMode) {
      if (error.severity === 'error') {
        console.error(error.userMessage);
      } else if (error.severity === 'warning') {
        console.warn(error.userMessage);
      } else {
        console.info(error.userMessage);
      }
    }
  }

  /**
   * Show toast notification for user messages
   * @param {string} message - The message to display
   * @param {string} severity - The severity level (error, warning, info)
   */
  showToast(message, severity = 'error') {
    // Create toast element with new unified classes
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${severity}`;
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
    
    // Auto-remove after 5 seconds
    setTimeout(() => this.removeToast(toast), TIMING.TOAST_DURATION);
    
    // Force browser to recognize the element before animating
    // This ensures the transition works properly
    void toast.offsetHeight;
    
    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('toast--visible');
    });
  }

  /**
   * Remove toast notification with animation
   * @param {HTMLElement} toast - The toast element to remove
   */
  removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    
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
   * Handle uncaught global errors
   * @param {ErrorEvent} event - Browser error event
   */
  handleGlobalError(event) {
    const error = event.error || new Error(event.message);
    this.handleError(error, {
      source: 'window.onerror',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
    
    // Prevent default browser error handling in production
    if (!this.debugMode) {
      event.preventDefault();
    }
  }

  /**
   * Handle unhandled promise rejections
   * @param {PromiseRejectionEvent} event - Promise rejection event
   */
  handlePromiseError(event) {
    const error = event.reason instanceof Error ? 
      event.reason : 
      new Error(String(event.reason || 'Unknown promise rejection'));
    
    this.handleError(error, {
      source: 'unhandledrejection',
    });
    
    // Prevent default browser error handling in production
    if (!this.debugMode) {
      event.preventDefault();
    }
  }

  /**
   * Add error notification listener
   * @param {Function} listener - Function to call when errors occur
   * @returns {Function} Function to remove listener
   */
  addListener(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Error listener must be a function');
    }
    
    this.listeners.push(listener);
    
    // Return function to remove listener
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notify all registered error listeners
   * @param {ApplicationError} error - The error that occurred
   */
  notifyListeners(error) {
    this.listeners.forEach(listener => {
      try {
        listener(error);
      } catch (listenerError) {
        // Don't let listener errors cause problems
        console.error('Error in error listener:', listenerError);
      }
    });
  }

  /**
   * Get recent errors from log
   * @param {number} count - Number of recent errors to retrieve
   * @returns {Array} Recent errors
   */
  getRecentErrors(count = 10) {
    return this.errorLog.slice(0, count);
  }

  /**
   * Clear the error log
   */
  clearErrorLog() {
    this.errorLog = [];
  }
}

// Create singleton instance
export const errorHandler = new ErrorHandler();