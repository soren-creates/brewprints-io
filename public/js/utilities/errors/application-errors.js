/**
 * Base error class for the brewing application
 * Provides standardized structure for all application-level errors
 */
export class ApplicationError extends Error {
  /**
   * @param {string} message - Technical error message for developers
   * @param {Object} options - Configuration options
   * @param {string} [options.userMessage] - User-friendly error message
   * @param {string} [options.severity] - Error severity (error, warning, info)
   * @param {Object} [options.details] - Additional error context and details
   * @param {boolean} [options.recoverable] - Whether the application can recover from this error
   */
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.userMessage = options.userMessage || 'An error occurred in the application';
    this.severity = options.severity || 'error';
    this.details = options.details || {};
    this.recoverable = options.recoverable !== undefined ? options.recoverable : false;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error for recipe parsing issues
 * Used when parsing recipe files (BeerXML, etc.) fails
 */
export class RecipeParsingError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'Unable to parse recipe file. The file may be corrupted or in an unsupported format.',
      severity: options.severity || 'error',
      recoverable: options.recoverable !== undefined ? options.recoverable : false,
      ...options
    });
  }
}

/**
 * Error for application calculation issues
 * Used when calculations fail throughout the application
 */
export class CalculationError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'Error in brewing calculation. Some values may be incorrect.',
      severity: options.severity || 'error',
      recoverable: options.recoverable !== undefined ? options.recoverable : true,
      ...options
    });
  }
}

/**
 * Error for data validation issues
 * Used when input values fail validation checks
 */
export class ValidationError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'Invalid input data detected.',
      severity: options.severity || 'warning',
      recoverable: options.recoverable !== undefined ? options.recoverable : true,
      ...options
    });
  }
}

/**
 * Error for formatting issues
 * Used when data cannot be properly formatted for display
 */
export class FormatError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'Unable to format data correctly.',
      severity: options.severity || 'warning',
      recoverable: options.recoverable !== undefined ? options.recoverable : true,
      ...options
    });
  }
}

/**
 * Error for unit conversion issues
 * Used when converting between measurement units fails
 */
export class UnitConversionError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'Error converting between measurement units.',
      severity: options.severity || 'error',
      recoverable: options.recoverable !== undefined ? options.recoverable : true,
      ...options
    });
  }
}

/**
 * Error for data loading issues
 * Used when failing to load application data from storage
 */
export class DataLoadError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'Failed to load brewing data.',
      severity: options.severity || 'error',
      recoverable: options.recoverable !== undefined ? options.recoverable : false,
      ...options
    });
  }
}