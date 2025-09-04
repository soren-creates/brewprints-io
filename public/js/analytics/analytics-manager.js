/**
 * Analytics Manager for Brewprints
 * Handles Google Analytics 4 event tracking for brewing-specific actions
 */

class AnalyticsManager {
    constructor() {
        this.isEnabled = typeof gtag !== 'undefined';
        this.debugMode = false;
    }

    /**
     * Enable debug logging for analytics events
     */
    enableDebug() {
        this.debugMode = true;
    }

    /**
     * Log debug information if debug mode is enabled
     */
    _debug(eventName, parameters) {
        if (this.debugMode) {
            console.log('Analytics Event:', eventName, parameters);
        }
    }

    /**
     * Send event to GA4 with error handling
     */
    _sendEvent(eventName, parameters = {}) {
        if (!this.isEnabled) {
            this._debug(eventName, { ...parameters, status: 'disabled' });
            return;
        }

        try {
            gtag('event', eventName, parameters);
            this._debug(eventName, { ...parameters, status: 'sent' });
        } catch (error) {
            console.warn('Analytics error:', error);
        }
    }

    // =============================================================================
    // RECIPE MANAGEMENT EVENTS
    // =============================================================================

    /**
     * Track recipe creation (manual entry)
     */
    trackRecipeCreated(format = 'manual') {
        this._sendEvent('recipe_created', {
            'recipe_format': format,
            'event_category': 'recipe_management'
        });
    }

    /**
     * Track recipe import from file
     * @param {string} format - 'beerjson', 'brewfather', 'beerxml', etc.
     * @param {boolean} success - Whether import was successful
     */
    trackRecipeImported(format, success = true) {
        this._sendEvent('recipe_imported', {
            'recipe_format': format,
            'import_success': success,
            'event_category': 'recipe_management'
        });
    }

    /**
     * Track recipe sharing
     * @param {string} shareType - 'public', 'unlisted', 'private', 'share_token'
     */
    trackRecipeShared(shareType = 'public') {
        this._sendEvent('recipe_shared', {
            'share_type': shareType,
            'event_category': 'engagement'
        });
    }

    /**
     * Track recipe saved to user account
     */
    trackRecipeSaved() {
        this._sendEvent('recipe_saved', {
            'event_category': 'recipe_management'
        });
    }

    // =============================================================================
    // CALCULATION EVENTS
    // =============================================================================

    /**
     * Track brewing calculation usage
     * @param {string} calculationType - 'ibu', 'srm', 'abv', 'gravity', 'efficiency', etc.
     * @param {number} inputCount - Number of ingredients/inputs processed
     */
    trackCalculationUsed(calculationType, inputCount = null) {
        const parameters = {
            'calculation_type': calculationType,
            'event_category': 'feature_usage'
        };

        if (inputCount !== null) {
            parameters.input_count = inputCount;
        }

        this._sendEvent('calculation_used', parameters);
    }

    /**
     * Track when user adjusts calculation parameters
     */
    trackCalculationAdjusted(calculationType, parameter) {
        this._sendEvent('calculation_adjusted', {
            'calculation_type': calculationType,
            'parameter_adjusted': parameter,
            'event_category': 'feature_usage'
        });
    }

    // =============================================================================
    // USER JOURNEY EVENTS
    // =============================================================================

    /**
     * Track user signup/authentication
     * @param {string} method - 'email', 'google', 'github', etc.
     */
    trackUserSignup(method = 'email') {
        this._sendEvent('sign_up', {
            'method': method,
            'event_category': 'user_lifecycle'
        });
    }

    /**
     * Track user login
     * @param {string} method - Authentication method used
     */
    trackUserLogin(method = 'email') {
        this._sendEvent('login', {
            'method': method,
            'event_category': 'user_lifecycle'
        });
    }

    /**
     * Track recipe printing
     * @param {string} sections - Which sections were printed
     */
    trackRecipePrinted(sections = 'all') {
        this._sendEvent('recipe_printed', {
            'print_sections': sections,
            'event_category': 'feature_usage'
        });
    }

    /**
     * Track file format conversion
     * @param {string} fromFormat - Original format
     * @param {string} toFormat - Target format
     */
    trackFormatConversion(fromFormat, toFormat) {
        this._sendEvent('format_converted', {
            'from_format': fromFormat,
            'to_format': toFormat,
            'event_category': 'feature_usage'
        });
    }

    // =============================================================================
    // ENGAGEMENT EVENTS
    // =============================================================================

    /**
     * Track when user views recipe data/preview
     */
    trackRecipeViewed() {
        this._sendEvent('recipe_viewed', {
            'event_category': 'engagement'
        });
    }

    /**
     * Track user feedback submission
     * @param {number} rating - User satisfaction rating (1-5)
     * @param {string} category - Feedback category
     */
    trackFeedbackSubmitted(rating = null, category = 'general') {
        const parameters = {
            'feedback_category': category,
            'event_category': 'engagement'
        };

        if (rating !== null) {
            parameters.satisfaction_rating = rating;
        }

        this._sendEvent('feedback_submitted', parameters);
    }

    /**
     * Track search/filter usage
     * @param {string} searchType - 'ingredient', 'style', 'name', etc.
     */
    trackSearch(searchType, query = null) {
        const parameters = {
            'search_type': searchType,
            'event_category': 'engagement'
        };

        if (query) {
            // Don't log full query for privacy, just length
            parameters.query_length = query.length;
        }

        this._sendEvent('search', parameters);
    }

    // =============================================================================
    // ERROR TRACKING
    // =============================================================================

    /**
     * Track application errors
     * @param {string} errorType - Type of error encountered
     * @param {string} context - Where the error occurred
     */
    trackError(errorType, context = 'unknown') {
        this._sendEvent('app_error', {
            'error_type': errorType,
            'error_context': context,
            'event_category': 'errors'
        });
    }

    /**
     * Track parsing/import failures
     * @param {string} format - File format that failed
     * @param {string} reason - Reason for failure
     */
    trackImportError(format, reason = 'unknown') {
        this._sendEvent('import_error', {
            'file_format': format,
            'error_reason': reason,
            'event_category': 'errors'
        });
    }

    // =============================================================================
    // CONVERSION TRACKING (for future monetization)
    // =============================================================================

    /**
     * Track when user hits free tier limits
     * @param {string} limitType - 'recipe_count', 'storage', etc.
     */
    trackFreeTierLimit(limitType) {
        this._sendEvent('free_tier_limit', {
            'limit_type': limitType,
            'event_category': 'conversion'
        });
    }

    /**
     * Track feature requests or upgrade interest
     * @param {string} feature - Requested feature
     */
    trackFeatureRequest(feature) {
        this._sendEvent('feature_requested', {
            'requested_feature': feature,
            'event_category': 'conversion'
        });
    }
}

// Export singleton instance
export const analyticsManager = new AnalyticsManager();

// Enable debug mode if in development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    analyticsManager.enableDebug();
}