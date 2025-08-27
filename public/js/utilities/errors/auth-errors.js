/**
 * Authentication-related error classes
 * Provides specialized error handling for authentication and authorization scenarios
 */

import { ApplicationError } from './application-errors.js';

/**
 * Error for authentication failures
 * Used when user authentication operations fail
 */
export class AuthenticationError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'Authentication failed. Please try signing in again.',
      severity: options.severity || 'error',
      recoverable: options.recoverable !== undefined ? options.recoverable : true,
      ...options
    });
  }
}

/**
 * Error for authorization failures
 * Used when user lacks permission to access resources
 */
export class AuthorizationError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'You do not have permission to access this resource.',
      severity: options.severity || 'error',
      recoverable: options.recoverable !== undefined ? options.recoverable : false,
      ...options
    });
  }
}

/**
 * Error for session-related issues
 * Used when user session is invalid or expired
 */
export class SessionError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'Your session has expired. Please sign in again.',
      severity: options.severity || 'warning',
      recoverable: options.recoverable !== undefined ? options.recoverable : true,
      ...options
    });
  }
}

/**
 * Error for Firebase authentication issues
 * Used when Firebase authentication operations fail
 */
export class FirebaseAuthError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'Cloud storage authentication failed. Some features may be unavailable.',
      severity: options.severity || 'warning',
      recoverable: options.recoverable !== undefined ? options.recoverable : true,
      ...options
    });
  }
}

/**
 * Error for Clerk authentication issues
 * Used when Clerk authentication operations fail
 */
export class ClerkAuthError extends ApplicationError {
  constructor(message, options = {}) {
    super(message, {
      userMessage: options.userMessage || 'User authentication service is temporarily unavailable.',
      severity: options.severity || 'error',
      recoverable: options.recoverable !== undefined ? options.recoverable : true,
      ...options
    });
  }
}