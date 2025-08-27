/**
 * Recipe Metrics Calculator - Atomic Calculator Pattern
 * 
 * Handles recipe balance calculations including BU/GU ratios
 * and water chemistry metrics.
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific recipe metrics calculations
 */

import { safeCalculation } from '../utilities/errors/error-utils.js';

/**
 * Calculate BU/GU ratio (Bitterness Units to Gravity Units)
 * @param {number} ibu - International Bitterness Units
 * @param {number} og - Original Gravity (e.g., 1.050)
 * @returns {number} BU/GU ratio
 */
function calculateBuGuRatio(ibu, og) {
    if (!ibu || !og || og <= 1) return 0;
    
    const gravityUnits = (og - 1) * 1000;
    return ibu / gravityUnits;
}

/**
 * Calculate sulfate to chloride ratio from water profile
 * @param {Object} waterProfile - Water profile object with SO4 and Cl values
 * @returns {number} SO4:Cl ratio
 */
function calculateSulfateChlorideRatio(waterProfile) {
    if (!waterProfile) return 0;
    
    const sulfate = parseFloat(waterProfile.SO4 || waterProfile.sulfate) || 0;
    const chloride = parseFloat(waterProfile.Cl || waterProfile.chloride) || 0;
    
    if (chloride === 0) return sulfate > 0 ? Infinity : 0;
    
    return sulfate / chloride;
}

// Export safe wrappers for all calculation functions
const safeCalculateBuGuRatio = (ibu, og) => 
    safeCalculation(() => calculateBuGuRatio(ibu, og), 0, {
        calculator: 'recipe_metrics',
        operation: 'bu_gu_ratio'
    });

const safeCalculateSulfateChlorideRatio = (waterProfile) => 
    safeCalculation(() => calculateSulfateChlorideRatio(waterProfile), 0, {
        calculator: 'recipe_metrics',
        operation: 'sulfate_chloride_ratio'
    });

export {
    safeCalculateBuGuRatio as calculateBuGuRatio,
    safeCalculateSulfateChlorideRatio as calculateSulfateChlorideRatio
};