/**
 * Security utility functions for input sanitization and validation
 * to prevent XSS, path traversal, and other security vulnerabilities.
 */

// ============================================================================
// Security Validation Functions
// ============================================================================

/**
 * Sanitizes text input to prevent XSS attacks
 * @param {any} value - The value to sanitize
 * @param {Object} options - Sanitization options
 * @param {boolean} options.allowNull - Whether to allow null/undefined values (default: true)
 * @param {string} options.fallback - Fallback value for invalid input (default: '')
 * @returns {string} Sanitized text
 */
export function sanitizeText(value, options = {}) {
    const { allowNull = true, fallback = '' } = options;
    
    if (value === null || value === undefined) {
        return allowNull ? null : fallback;
    }
    
    let text = String(value);
    
    // Remove or escape dangerous HTML/JavaScript content
    text = text
        // CRITICAL: Remove null bytes FIRST to prevent injection reconstruction
        .replace(/\0/g, '')
        // Remove script tags and their content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        // Remove javascript: protocol
        .replace(/javascript:/gi, '')
        // Remove event handlers (onclick, onload, etc.)
        .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
        .replace(/\s*on\w+\s*=\s*[^>\s]+/gi, '')
        // Remove other potentially dangerous elements
        .replace(/<(iframe|object|embed|link|meta|style)\b[^>]*>/gi, '')
        // Remove eval, Function, and other code execution attempts
        .replace(/\beval\s*\(/gi, '')
        .replace(/\bFunction\s*\(/gi, '')
        // Remove data: URIs that might contain scripts
        .replace(/data:text\/html/gi, 'data:text/plain')
        // Remove vbscript: protocol
        .replace(/vbscript:/gi, '')
        // Remove path traversal attempts and suspicious paths
        .replace(/\.\.[\/\\]/g, '')
        .replace(/[\/\\]\.\./g, '')
        .replace(/%2e%2e/gi, '')
        .replace(/\/etc\/passwd/gi, '')
        .replace(/\\etc\\passwd/gi, '')
        .replace(/\/windows\/system32/gi, '')
        .replace(/\\windows\\system32/gi, '')
        // Escape remaining angle brackets to prevent HTML injection
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Escape quotes to prevent attribute injection
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    
    return text;
}

/**
 * Validates and sanitizes a path to prevent path traversal attacks
 * @param {any} value - The path value to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowNull - Whether to allow null/undefined values (default: true)
 * @param {string} options.fallback - Fallback value for invalid paths (default: '')
 * @returns {string|null} Sanitized path or null
 */
export function sanitizePath(value, options = {}) {
    const { allowNull = true, fallback = '' } = options;
    
    if (value === null || value === undefined) {
        return allowNull ? null : fallback;
    }
    
    let path = String(value);
    
    // Remove path traversal attempts
    path = path
        // Remove ../ and ..\\ sequences
        .replace(/\.\.[\/\\]/g, '')
        .replace(/[\/\\]\.\./g, '')
        // Remove null bytes
        .replace(/\0/g, '')
        // Remove dangerous characters
        .replace(/[<>:"|?*]/g, '')
        // Normalize path separators
        .replace(/\\/g, '/')
        // Remove multiple consecutive slashes
        .replace(/\/+/g, '/')
        // Remove leading/trailing slashes if not absolute path
        .replace(/^\/+|\/+$/g, '');
    
    // If the path still contains suspicious patterns, return fallback
    if (path.includes('..') || path.includes('%2e%2e') || path.includes('%2E%2E')) {
        return fallback;
    }
    
    return path;
}

/**
 * Sanitizes an object by applying sanitization to all string values
 * @param {any} obj - The object to sanitize
 * @param {Object} options - Sanitization options
 * @param {Array<string>} options.textFields - Fields to apply text sanitization to
 * @param {Array<string>} options.pathFields - Fields to apply path sanitization to
 * @param {Array<string>} options.numericFields - Fields that should be numeric (extra aggressive sanitization)
 * @param {boolean} options.recursive - Whether to sanitize nested objects (default: true)
 * @returns {any} Sanitized object
 */
export function sanitizeObject(obj, options = {}) {
    const { 
        textFields = ['name', 'brewer', 'notes', 'description'], 
        pathFields = ['path', 'file', 'filename'],
        numericFields = ['batchSize', 'boilSize', 'boilTime', 'amount', 'efficiency'],
        recursive = true 
    } = options;
    
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    if (typeof obj !== 'object') {
        return sanitizeText(obj);
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => recursive ? sanitizeObject(item, options) : sanitizeText(item));
    }
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(obj)) {
        if (textFields.includes(key)) {
            sanitized[key] = sanitizeText(value);
        } else if (pathFields.includes(key)) {
            sanitized[key] = sanitizePath(value);
        } else if (numericFields.includes(key)) {
            // For numeric fields, be extra aggressive - remove any non-numeric characters
            // except for decimal points and negative signs
            if (typeof value === 'string') {
                const numericValue = String(value).replace(/[^0-9.-]/g, '');
                const parsed = parseFloat(numericValue);
                sanitized[key] = isNaN(parsed) ? 0 : parsed;
            } else {
                sanitized[key] = value;
            }
        } else if (recursive && typeof value === 'object') {
            sanitized[key] = sanitizeObject(value, options);
        } else if (typeof value === 'string') {
            sanitized[key] = sanitizeText(value);
        } else {
            sanitized[key] = value;
        }
    }
    
    return sanitized;
}

/**
 * Validates that a string does not contain XSS patterns
 * @param {any} value - The value to check
 * @returns {boolean} True if the value appears safe
 */
export function isXSSSafe(value) {
    if (value === null || value === undefined) {
        return true;
    }
    
    const text = String(value).toLowerCase();
    
    // Check for dangerous patterns
    const dangerousPatterns = [
        /<script/,
        /javascript:/,
        /on\w+\s*=/,
        /eval\s*\(/,
        /function\s*\(/,
        /<iframe/,
        /<object/,
        /<embed/,
        /vbscript:/,
        /data:text\/html/
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(text));
}

/**
 * Validates that a path does not contain traversal patterns
 * @param {any} value - The path to check
 * @returns {boolean} True if the path appears safe
 */
export function isPathTraversalSafe(value) {
    if (value === null || value === undefined) {
        return true;
    }
    
    const path = String(value);
    
    // Check for path traversal patterns
    const dangerousPatterns = [
        /\.\.[\/\\]/,
        /[\/\\]\.\./,
        /%2e%2e/i,
        /\0/,
        /[<>:"|?*]/
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(path));
}