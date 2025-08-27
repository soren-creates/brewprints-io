/**
 * Validation utility functions for standardized validation patterns
 * across the brewing log application.
 */

import { BREWING_LIMITS } from '../../core/constants.js';

// ============================================================================
// Pure Parsing Functions (No Domain Validation)
// ============================================================================

/**
 * Pure parsing function that extracts numeric values without domain validation.
 * Use this in parsers to extract raw data. Apply domain validation separately
 * in the recipe validator using isValidX() functions and BREWING_LIMITS constants.
 * 
 * @param {any} value - The value to parse
 * @returns {number|undefined} Parsed number or undefined if not parseable
 */
export function parseNumber(value) {
  if (value === null || value === undefined) return undefined;
  const num = parseFloat(value);
  return isNaN(num) || !isFinite(num) ? undefined : num;
}

/**
 * Pure parsing function for integer values without domain validation.
 * 
 * @param {any} value - The value to parse
 * @returns {number|undefined} Parsed integer or undefined if not parseable
 */
export function parseInteger(value) {
  if (value === null || value === undefined) return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) ? undefined : num;
}

/**
 * Pure parsing function for boolean values without domain validation.
 * 
 * @param {any} value - The value to parse
 * @returns {boolean|undefined} Parsed boolean or undefined if not parseable
 */
export function parseBoolean(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  const str = String(value).toLowerCase().trim();
  if (str === 'true' || str === '1') return true;
  if (str === 'false' || str === '0') return false;
  return undefined;
}

/**
 * Pure parsing function for string values with basic cleaning options.
 * 
 * @param {any} value - The value to parse
 * @param {Object} options - Parsing options
 * @param {boolean} options.trim - Whether to trim whitespace (default: true)
 * @param {boolean} options.allowEmpty - Whether empty strings are valid (default: true)
 * @returns {string|undefined} Parsed string or undefined if not valid
 */
export function parseString(value, options = {}) {
  const { trim = true, allowEmpty = true } = options;
  if (value === null || value === undefined) return undefined;
  let str = String(value);
  if (trim) str = str.trim();
  if (!allowEmpty && str === '') return undefined;
  return str;
}

/**
 * Pure parsing function for gravity values with format conversion but no validation.
 * Handles legacy format (1050 -> 1.050) without domain validation.
 * 
 * @param {any} value - The value to parse
 * @returns {number|undefined} Parsed gravity or undefined if not parseable
 */
export function parseRawGravity(value) {
  const num = parseNumber(value);
  if (num === undefined) return undefined;
  
  // Handle legacy format (1050 -> 1.050) without validation
  if (num > 100) return num / 1000;
  return num;
}

/**
 * Pure parsing function for percentage values with format conversion but no validation.
 * Handles percentage formats (5% -> 5, 0.05 -> 5) without domain validation.
 * 
 * @param {any} value - The value to parse
 * @returns {number|undefined} Parsed percentage or undefined if not parseable
 */
export function parseRawPercentage(value) {
  const num = parseNumber(value);
  if (num === undefined) return undefined;
  
  // Handle percentage formats (5% -> 5, 0.05 -> 5) without validation
  if (num > 0 && num < 1) return num * 100;
  return num;
}

// ============================================================================
// Validation Functions Using Constants
// ============================================================================

/**
 * Validates if a value is a valid number
 * @param {any} value - The value to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowZero - Whether zero is considered valid (default: false)
 * @param {boolean} options.allowNegative - Whether negative numbers are valid (default: false)
 * @param {number} options.min - Minimum allowed value (default: 0)
 * @param {number} options.max - Maximum allowed value (default: 100)
 * @returns {boolean} True if valid number
 */
export function isValidNumber(value, options = {}) {
    const {
        allowZero = false,
        allowNegative = false,
        min = 0,
        max = 100
    } = options;

    const num = parseFloat(value);
    
    if (isNaN(num) || !isFinite(num)) {
        return false;
    }
    
    if (!allowZero && num === 0) {
        return false;
    }
    
    if (!allowNegative && num < 0) {
        return false;
    }
    
    if (num < min || num > max) {
        return false;
    }
    
    return true;
}

/**
 * Validates gravity values (specific gravity)
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid gravity
 */
export function isValidGravity(value) {
    return isValidNumber(value, { 
        allowZero: false, 
        allowNegative: false, 
        min: BREWING_LIMITS.gravity.min, 
        max: BREWING_LIMITS.gravity.max 
    });
}

/**
 * Validates ABV (alcohol by volume) values
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid ABV
 */
export function isValidABV(value) {
    return isValidNumber(value, { 
        allowZero: false, 
        allowNegative: false, 
        min: BREWING_LIMITS.abv.min, 
        max: BREWING_LIMITS.abv.max 
    });
}

/**
 * Validates temperature values in Celsius
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid temperature
 */
export function isValidTemperature(value) {
    return isValidNumber(value, { 
        allowZero: true, 
        allowNegative: false, 
        min: BREWING_LIMITS.temperature.min, 
        max: BREWING_LIMITS.temperature.max 
    });
}

/**
 * Validates percentage values (0-100%)
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid percentage
 */
export function isValidPercentage(value) {
    return isValidNumber(value, { 
        allowZero: true, 
        allowNegative: false, 
        min: BREWING_LIMITS.percentage.min, 
        max: BREWING_LIMITS.percentage.max 
    });
}

/**
 * Validates positive amounts (weight, volume, etc.)
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid amount
 */
export function isValidAmount(value) {
    return isValidNumber(value, { 
        allowZero: false, 
        allowNegative: false, 
        min: BREWING_LIMITS.amount.min, 
        max: BREWING_LIMITS.amount.max 
    });
}

/**
 * Validates time values in minutes
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid time
 */
export function isValidTime(value) {
    return isValidNumber(value, { 
        allowZero: true, 
        allowNegative: false, 
        min: BREWING_LIMITS.time.min, 
        max: BREWING_LIMITS.time.max 
    });
}

/**
 * Validates SRM color values (allows zero for clear/colorless beers)
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid SRM
 */
export function isValidSRM(value) {
    return isValidNumber(value, { 
        allowZero: true, 
        allowNegative: false, 
        min: 0, 
        max: BREWING_LIMITS.srm?.max || 80 
    });
}

/**
 * Validates IBU values (allows zero for unhopped beers)
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid IBU
 */
export function isValidIBU(value) {
    return isValidNumber(value, { 
        allowZero: true, 
        allowNegative: false, 
        min: 0, 
        max: BREWING_LIMITS.ibu?.max || 120 
    });
}

/**
 * Validates color values for fermentables (allows zero for adjuncts like rice/sugar)
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid color
 */
export function isValidColor(value) {
    return isValidNumber(value, { 
        allowZero: true, 
        allowNegative: false, 
        min: 0, 
        max: BREWING_LIMITS.color?.max || 600 
    });
}

/**
 * Validates pH values
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid pH
 */
export function isValidPH(value) {
    return isValidNumber(value, { 
        allowZero: false, 
        allowNegative: false, 
        min: BREWING_LIMITS.phExtended.min, 
        max: BREWING_LIMITS.phExtended.max 
    });
}

/**
 * Validates water mineral content (ppm)
 * @param {any} value - The value to validate
 * @returns {boolean} True if valid mineral content
 */
export function isValidMineralContent(value) {
    return isValidNumber(value, { 
        allowZero: true, 
        allowNegative: false, 
        min: BREWING_LIMITS.mineralContent.min, 
        max: BREWING_LIMITS.mineralContent.max 
    });
}

/**
 * Validates if a value is a valid string
 * @param {any} value - The value to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowEmpty - Whether empty strings are valid (default: false)
 * @param {boolean} options.trim - Whether to trim before validation (default: true)
 * @param {number} options.minLength - Minimum string length
 * @param {number} options.maxLength - Maximum string length
 * @returns {boolean} True if valid string
 */
export function isValidString(value, options = {}) {
    const {
        allowEmpty = false,
        trim = true,
        minLength = 0,
        maxLength = Number.POSITIVE_INFINITY
    } = options;

    if (value === null || value === undefined) {
        return false;
    }
    
    const str = trim ? String(value).trim() : String(value);
    
    if (!allowEmpty && str.length === 0) {
        return false;
    }
    
    if (str.length < minLength || str.length > maxLength) {
        return false;
    }
    
    return true;
}

/**
 * Safely gets a valid string with fallback
 * @param {any} value - The value to validate
 * @param {string} fallback - Fallback value if validation fails (default: '')
 * @param {Object} options - Validation options (same as isValidString)
 * @returns {string} Valid string or fallback
 */
export function getValidString(value, fallback = '', options = {}) {
    if (isValidString(value, options)) {
        return options.trim !== false ? String(value).trim() : String(value);
    }
    return fallback;
}

/**
 * Validates if a value is a valid array
 * @param {any} value - The value to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowEmpty - Whether empty arrays are valid (default: false)
 * @param {number} options.minLength - Minimum array length
 * @param {number} options.maxLength - Maximum array length
 * @param {Function} options.itemValidator - Function to validate each item
 * @returns {boolean} True if valid array
 */
export function isValidArray(value, options = {}) {
    const {
        allowEmpty = false,
        minLength = 0,
        maxLength = Number.POSITIVE_INFINITY,
        itemValidator = null
    } = options;

    if (!Array.isArray(value)) {
        return false;
    }
    
    if (!allowEmpty && value.length === 0) {
        return false;
    }
    
    if (value.length < minLength || value.length > maxLength) {
        return false;
    }
    
    if (itemValidator && !value.every(itemValidator)) {
        return false;
    }
    
    return true;
}

/**
 * Safely gets a valid array with fallback
 * @param {any} value - The value to validate
 * @param {Array} fallback - Fallback value if validation fails (default: [])
 * @param {Object} options - Validation options (same as isValidArray)
 * @returns {Array} Valid array or fallback
 */
export function getValidArray(value, fallback = [], options = {}) {
    if (isValidArray(value, options)) {
        return value;
    }
    return fallback;
}

/**
 * Validates if a value is a valid object
 * @param {any} value - The value to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowNull - Whether null is considered valid (default: false)
 * @param {Array<string>} options.requiredKeys - Required object keys
 * @param {Object} options.keyValidators - Object with key-validator function pairs
 * @returns {boolean} True if valid object
 */
export function isValidObject(value, options = {}) {
    const {
        allowNull = false,
        requiredKeys = [],
        keyValidators = {}
    } = options;

    if (value === null) {
        return allowNull;
    }
    
    if (value === undefined || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    
    // Check required keys
    for (const key of requiredKeys) {
        if (!(key in value)) {
            return false;
        }
    }
    
    // Validate specific keys
    for (const [key, validator] of Object.entries(keyValidators)) {
        if (key in value && !validator(value[key])) {
            return false;
        }
    }
    
    return true;
}

/**
 * Safely gets a valid object with fallback
 * @param {any} value - The value to validate
 * @param {Object} fallback - Fallback value if validation fails (default: {})
 * @param {Object} options - Validation options (same as isValidObject)
 * @returns {Object} Valid object or fallback
 */
export function getValidObject(value, fallback = {}, options = {}) {
    if (isValidObject(value, options)) {
        return value;
    }
    return fallback;
}

/**
 * Validates file type based on MIME type
 * @param {File} file - The file to validate
 * @param {string|Array<string>} allowedTypes - Allowed MIME types or patterns
 * @returns {boolean} True if valid file type
 */
export function isValidFileType(file, allowedTypes) {
    if (!file || !file.type) {
        return false;
    }
    
    const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
    
    return types.some(type => {
        if (type.endsWith('/*')) {
            return file.type.startsWith(type.slice(0, -1));
        }
        return file.type === type;
    });
}

/**
 * Validates file size
 * @param {File} file - The file to validate
 * @param {number} maxSize - Maximum file size in bytes
 * @returns {boolean} True if valid file size
 */
export function isValidFileSize(file, maxSize) {
    if (!file || typeof file.size !== 'number') {
        return false;
    }
    
    return file.size <= maxSize;
}

/**
 * Creates a validation result object with warnings and errors
 * @param {Array<string>} warnings - Warning messages
 * @param {Array<string>} errors - Error messages
 * @param {Object} data - Additional data to include in result
 * @returns {Object} Validation result with warnings and errors arrays
 */
export function createValidationResult(warnings = [], errors = [], data = {}) {
    return {
        warnings: Array.isArray(warnings) ? warnings : [warnings],
        errors: Array.isArray(errors) ? errors : [errors],
        isValid: errors.length === 0,
        hasWarnings: warnings.length > 0,
        ...data
    };
}

/**
 * Validates a value within a physical range with contextual warnings
 * @param {number} value - The value to validate
 * @param {Object} range - Range configuration
 * @param {number} range.min - Minimum valid value
 * @param {number} range.max - Maximum valid value
 * @param {number} range.warnMin - Minimum value before warning
 * @param {number} range.warnMax - Maximum value before warning
 * @param {string} range.unit - Unit for display
 * @param {string} range.name - Name of the parameter for messages
 * @returns {Object} Validation result with warnings and errors
 */
export function validatePhysicalRange(value, range) {
    const { min, max, warnMin, warnMax, unit = '', name = 'value' } = range;
    const warnings = [];
    const errors = [];
    
    if (!isValidNumber(value)) {
        errors.push(`${name} must be a valid number`);
        return createValidationResult(warnings, errors);
    }
    
    const num = parseFloat(value);
    
    if (num < min) {
        errors.push(`${name} ${num}${unit} is below minimum allowed value of ${min}${unit}`);
    } else if (num > max) {
        errors.push(`${name} ${num}${unit} is above maximum allowed value of ${max}${unit}`);
    } else {
        if (warnMin !== undefined && num < warnMin) {
            warnings.push(`${name} ${num}${unit} is unusually low (typical range: ${warnMin}-${warnMax}${unit})`);
        } else if (warnMax !== undefined && num > warnMax) {
            warnings.push(`${name} ${num}${unit} is unusually high (typical range: ${warnMin}-${warnMax}${unit})`);
        }
    }
    
    return createValidationResult(warnings, errors);
}

/**
 * Clamps a value to a specified range
 * @param {number} value - Value to clamp
 * @param {Object} limits - Range limits with min/max properties
 * @param {number} limits.min - Minimum allowed value
 * @param {number} limits.max - Maximum allowed value
 * @returns {number} Clamped value within the specified range
 */
export function clampToRange(value, limits) {
    if (!limits || value === undefined || value === null) {
        return value;
    }
    return Math.max(limits.min, Math.min(limits.max, value));
}

/**
 * Advanced validation for numerical ranges with comprehensive result objects
 * Enhanced version that returns validation result objects with value, warnings, and errors
 * @param {any} value - Value to validate
 * @param {Object} limits - Range limits object with min/max and optional warn thresholds
 * @param {number} limits.min - Minimum valid value
 * @param {number} limits.max - Maximum valid value
 * @param {number} [limits.warnMin] - Minimum value before warning
 * @param {number} [limits.warnMax] - Maximum value before warning
 * @param {Object} options - Validation options
 * @param {string} [options.unit] - Unit for display in messages
 * @param {string} [options.fieldName] - Field name for error messages
 * @param {boolean} [options.allowZero] - Whether zero is valid (default: true)
 * @param {boolean} [options.allowNegative] - Whether negative values are valid (default: false)
 * @param {boolean} [options.clampValue] - Whether to clamp values to valid range (default: false)
 * @returns {Object} Validation result with value, warnings, and errors
 */
export function validateAdvancedRange(value, limits, options = {}) {
    const { 
        unit = '',
        fieldName = 'value',
        allowZero = true,
        allowNegative = false,
        clampValue = false
    } = options;

    // Parse value using pure parsing
    const parsedValue = parseNumber(value);
    
    // Check if value is a valid number (basic number check only)
    if (parsedValue === undefined || parsedValue === null || isNaN(parsedValue) || !isFinite(parsedValue)) {
        return createValidationResult(
            [],
            [`${fieldName} must be a valid number`],
            { value: undefined }
        );
    }

    // Check allowZero and allowNegative constraints
    if (!allowZero && parsedValue === 0) {
        return createValidationResult(
            [],
            [`${fieldName} cannot be zero`],
            { value: undefined }
        );
    }

    if (!allowNegative && parsedValue < 0) {
        return createValidationResult(
            [],
            [`${fieldName} must be a positive number`],
            { value: undefined }
        );
    }

    // Apply range validation if limits provided
    if (limits) {
        const result = validatePhysicalRange(parsedValue, {
            ...limits,
            unit,
            name: fieldName
        });

        // Clamp value to range if requested and it's outside bounds
        let finalValue = parsedValue;
        if (clampValue) {
            if (parsedValue < limits.min) {
                finalValue = limits.min;
            } else if (parsedValue > limits.max) {
                finalValue = limits.max;
            }
        }

        return {
            ...result,
            value: finalValue
        };
    }

    return createValidationResult([], [], { value: parsedValue });
}

/**
 * Validates brewing-specific volume measurements with optional range checking
 * @param {any} value - Volume value to validate
 * @param {Object} options - Validation options
 * @param {Object} [options.limits] - Custom volume limits (default: BREWING_LIMITS.amount)
 * @param {string} [options.unit] - Unit for error messages (default: 'L')
 * @param {string} [options.fieldName] - Field name for error tracking (default: 'volume')
 * @param {boolean} [options.clampToLimits] - Whether to clamp values to limits (default: false)
 * @returns {Object} Validation result with value and any warnings/errors
 */
export function validateVolumeWithOptions(value, options = {}) {
    const { 
        limits = BREWING_LIMITS.amount, 
        unit = 'L', 
        fieldName = 'volume',
        clampToLimits = false
    } = options;

    // Parse volume value using pure parsing
    const parsedValue = parseNumber(value);
    
    // Apply brewing domain validation
    if (isValidAmount(parsedValue)) {
        // Apply limits if provided
        if (limits && clampToLimits) {
            const clamped = clampToRange(parsedValue, limits);
            if (clamped !== parsedValue) {
                return createValidationResult(
                    [`${fieldName} was adjusted from ${parsedValue}${unit} to ${clamped}${unit} to fit valid range`],
                    [],
                    { value: clamped, originalValue: parsedValue, wasAdjusted: true }
                );
            }
        }
        return createValidationResult([], [], { value: parsedValue });
    }
    
    return createValidationResult(
        [],
        [`${fieldName} must be a valid positive amount`],
        { value: undefined }
    );
}