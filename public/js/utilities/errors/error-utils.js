import { errorHandler } from './error-handler.js';
import { ApplicationError, CalculationError } from './application-errors.js';

/**
 * Safely execute a function with standardized error handling
 * @param {Function} fn - Function to execute
 * @param {Object} options - Error handling options
 * @param {any} [options.fallback] - Fallback value if execution fails
 * @param {Object} [options.context] - Error context information
 * @param {Function} [options.errorType] - Error class to use
 * @param {boolean} [options.rethrow] - Whether to rethrow the error
 * @param {boolean} [options.silent] - Whether to suppress user messages
 * @returns {any} Function result or fallback value
 */
export function safeExecute(fn, options = {}) {
  const { 
    fallback = null, 
    context = {}, 
    errorType = ApplicationError,
    rethrow = false,
    silent = false
  } = options;
  
  try {
    return fn();
  } catch (error) {
    // Create appropriate error instance
    const wrappedError = error instanceof errorType ? 
      error : 
      new errorType(
        error.message || 'Error in operation', 
        { 
          details: { 
            originalError: error, 
            stack: error.stack,
            ...context 
          } 
        }
      );
      
    // Process through error handler
    errorHandler.handleError(wrappedError, {
      ...context,
      silent
    });
    
    // Rethrow if requested
    if (rethrow) {
      throw wrappedError;
    }
    
    // Otherwise return fallback
    return fallback;
  }
}

/**
 * Safely execute a brewing calculation with standardized error handling
 * @param {Function} calculation - Calculation function
 * @param {any} fallback - Fallback value if calculation fails
 * @param {Object} context - Error context information
 * @returns {any} Calculation result or fallback
 */
export function safeCalculation(calculation, fallback = null, context = {}) {
  return safeExecute(calculation, { 
    fallback,
    context: {
      type: 'calculation',
      ...context
    },
    errorType: CalculationError,
    rethrow: false,
    silent: false
  });
}

/**
 * Safely execute an async function with standardized error handling
 * @param {Function} asyncFn - Async function to execute
 * @param {Object} options - Error handling options
 * @returns {Promise<any>} Promise resolving to function result or fallback value
 */
export async function safeAsync(asyncFn, options = {}) {
  const { 
    fallback = null, 
    context = {}, 
    errorType = ApplicationError,
    rethrow = false,
    silent = false
  } = options;
  
  try {
    return await asyncFn();
  } catch (error) {
    // Create appropriate error instance
    const wrappedError = error instanceof errorType ? 
      error : 
      new errorType(
        error.message || 'Error in async operation', 
        { 
          details: { 
            originalError: error, 
            stack: error.stack,
            ...context 
          } 
        }
      );
      
    // Process through error handler
    errorHandler.handleError(wrappedError, {
      ...context,
      silent
    });
    
    // Rethrow if requested
    if (rethrow) {
      throw wrappedError;
    }
    
    // Otherwise return fallback
    return fallback;
  }
}

/**
 * Wrap a function to add error handling
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Error handling options
 * @returns {Function} Wrapped function with error handling
 */
export function withErrorHandling(fn, options = {}) {
  return function(...args) {
    return safeExecute(() => fn(...args), options);
  };
}