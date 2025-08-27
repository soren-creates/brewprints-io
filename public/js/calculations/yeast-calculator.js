/**
 * Yeast Calculator - Atomic Calculator Pattern
 * 
 * Handles yeast attenuation calculations and estimations.
 * Provides functions for determining yeast performance metrics.
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific yeast calculations
 */

import { YEAST_ATTENUATION } from '../core/constants.js';
import { safeCalculation } from '../utilities/errors/error-utils.js';

/**
 * Calculate apparent attenuation
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {string} Formatted apparent attenuation
 * @precondition recipeData.ingredients.yeasts is valid array if present
 * @precondition recipeData.og and recipeData.fg are valid gravities if present
 */
function calculateApparentAttenuation(recipeData) {
  // First try to get attenuation from yeast data (available as ATTENUATION in XML)
  if (recipeData.ingredients?.yeasts?.length > 0) {
    const yeast = recipeData.ingredients.yeasts[0];
    if (yeast.attenuation !== undefined && yeast.attenuation !== null && yeast.attenuation > 0) {
      return `${yeast.attenuation.toFixed(0)}%`;
    }
  }
  
  // Try to calculate from actual OG/FG if available
  if (recipeData.og && recipeData.fg) {
    const apparentAttenuation = ((recipeData.og - recipeData.fg) / (recipeData.og - 1)) * 100;
    return `${apparentAttenuation.toFixed(0)}%`;
  }
  
  // Fallback to estimated attenuation based on yeast type
  const estimatedAttenuation = getEstimatedYeastAttenuation(recipeData);
  return `${estimatedAttenuation.toFixed(0)}%`;
}

/**
 * Estimate yeast attenuation based on yeast type when not provided in BeerXML
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {number} Estimated yeast attenuation percentage
 * @precondition recipeData.ingredients.yeasts is valid array if present
 */
function getEstimatedYeastAttenuation(recipeData) {
  
  // First try to get attenuation from yeast data
  if (recipeData.ingredients?.yeasts?.length > 0) {
    const yeast = recipeData.ingredients.yeasts[0];
    if (yeast.attenuation !== undefined && yeast.attenuation !== null && yeast.attenuation > 0) {
      return yeast.attenuation;
    }
    
    // Fallback to estimated attenuation based on yeast type
    const yeastType = (yeast.type || '').toLowerCase();
    return YEAST_ATTENUATION[yeastType] || YEAST_ATTENUATION.default;
  }
  
  // No yeast data available, default to typical ale attenuation
  return YEAST_ATTENUATION.default;
}

/**
 * Helper function to get estimated attenuation for individual yeast
 * @param {Object} yeast - Pre-validated yeast object from RecipeValidator
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator (for context)
 * @returns {number} Yeast attenuation percentage
 * @precondition yeast.attenuation is valid percentage or undefined
 * @precondition yeast.type is valid string or undefined
 */
function getYeastAttenuation(yeast, recipeData) {
  
  if (yeast.attenuation !== undefined && yeast.attenuation !== null && yeast.attenuation > 0) {
    return yeast.attenuation;
  }
  
  // Use estimated attenuation based on yeast type
  const yeastType = (yeast.type || '').toLowerCase();
  return YEAST_ATTENUATION[yeastType] || YEAST_ATTENUATION.default;
}

// Export safe wrappers for all calculation functions
const safeCalculateApparentAttenuation = (recipeData) => 
    safeCalculation(() => calculateApparentAttenuation(recipeData), '—', {
        calculator: 'yeast',
        operation: 'apparent_attenuation'
    });

const safeGetEstimatedYeastAttenuation = (recipeData) => 
    safeCalculation(() => getEstimatedYeastAttenuation(recipeData), YEAST_ATTENUATION.default, {
        calculator: 'yeast',
        operation: 'estimated_attenuation'
    });

const safeGetYeastAttenuation = (yeast, recipeData) => 
    safeCalculation(() => getYeastAttenuation(yeast, recipeData), YEAST_ATTENUATION.default, {
        calculator: 'yeast',
        operation: 'yeast_attenuation'
    });

export {
    safeCalculateApparentAttenuation as calculateApparentAttenuation,
    safeGetEstimatedYeastAttenuation as getEstimatedYeastAttenuation,
    safeGetYeastAttenuation as getYeastAttenuation
};