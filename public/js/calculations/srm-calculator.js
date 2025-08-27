/**
 * SRM Calculator - Atomic Calculator Pattern
 * 
 * Calculates Standard Reference Method (SRM) color values based on fermentables.
 * Uses the Morey equation for SRM calculation.
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific color calculations
 */

import { 
  L_TO_GAL, 
  KG_TO_LB,
  MOREY_MULTIPLIER,
  MOREY_EXPONENT,
  LOVIBOND_TO_SRM_FACTOR,
  LOVIBOND_TO_SRM_OFFSET,
  MAX_SRM
} from '../core/constants.js';

import {
  isValidAmount,
  isValidArray,
  isValidSRM,
  isValidColor
} from '../utilities/validation/validation-utils.js';

import { safeCalculation } from '../utilities/errors/error-utils.js';

/**
 * Calculate SRM using the Morey equation
 * SRM = 1.4922 * (MCU^0.6859)
 * where MCU = (grain_color_in_lovibond * grain_weight_in_lbs) / batch_size_in_gallons
 * 
 * @param {Array<Object>} fermentables - Pre-validated fermentable array from RecipeValidator
 * @param {number} batchSizeL - Pre-validated batch size in liters (> 0)
 * @returns {number} Calculated SRM value
 * @precondition fermentables array contains only valid objects with amount > 0, color >= 0
 * @precondition batchSizeL is a valid number > 0
 */
function calculateSRM(fermentables, batchSizeL) {
  // NO VALIDATION - Trust pre-validated input from RecipeValidator
  
  // Convert batch size to gallons
  const batchSizeGal = batchSizeL * L_TO_GAL;
  
  // Calculate MCU (Malt Color Units)
  let totalMCU = 0;
  
  for (const fermentable of fermentables) {
    // Direct usage - all properties guaranteed valid by RecipeValidator
    const weightLbs = fermentable.amount * KG_TO_LB;
    const mcuContribution = (fermentable.color * weightLbs) / batchSizeGal;
    totalMCU += mcuContribution;
  }
  
  // Apply Morey equation to convert MCU to SRM
  if (totalMCU === 0) {
    return 0; // No fermentables = no color
  }
  
  const srm = MOREY_MULTIPLIER * Math.pow(totalMCU, MOREY_EXPONENT);
  
  // Cap at maximum reasonable value
  return Math.min(srm, MAX_SRM);
}

/**
 * Calculate estimated SRM for a recipe, using calculated value when no SRM is provided
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {string} Formatted SRM string with calculated or existing value
 * @precondition recipeData.srm is undefined or valid number >= 0
 * @precondition recipeData.ingredients.fermentables is valid array (may be empty)
 * @precondition recipeData.batchSize is valid number > 0
 */
function calculateEstimatedSRM(recipeData) {
  // If we already have an SRM value, use it
  if (recipeData.srm !== undefined && recipeData.srm !== null) {
    return recipeData.srm < 10 ? recipeData.srm.toFixed(1) : recipeData.srm.toFixed(0);
  }
  
  // Handle empty fermentables array (valid but empty)
  if (recipeData.ingredients.fermentables.length === 0) {
    return '—';
  }
  
  // Calculate SRM from fermentables (input guaranteed valid)
  const calculatedSRM = calculateSRM(recipeData.ingredients.fermentables, recipeData.batchSize);
  
  if (calculatedSRM === 0) {
    return '—';
  }
  
  return calculatedSRM < 10 ? calculatedSRM.toFixed(1) : calculatedSRM.toFixed(0);
}

/**
 * Get numeric SRM value (calculated or existing)
 * @param {Object} recipeData - Recipe data object
 * @returns {number|null} Numeric SRM value or null if unavailable
 */
function getNumericSRM(recipeData) {
  // Return existing SRM if available
  if (isValidSRM(recipeData.srm)) {
    return recipeData.srm;
  }
  
  // Calculate SRM from fermentables
  if (!isValidArray(recipeData.ingredients?.fermentables, { allowEmpty: false }) || !isValidAmount(recipeData.batchSize)) {
    return null;
  }
  
  const calculatedSRM = calculateSRM(recipeData.ingredients.fermentables, recipeData.batchSize);
  
  return isValidSRM(calculatedSRM) ? calculatedSRM : null;
}

/**
 * Parse SRM from formatted string back to number
 * @param {string} formattedSRM - Formatted SRM string  
 * @returns {number|null} Parsed SRM or null if invalid
 */
function parseSRMFromFormatted(formattedSRM) {
  if (!formattedSRM || formattedSRM === '—') {
    return null;
  }
  
  // Remove any formatting and parse as float
  const cleaned = formattedSRM.replace(/[^\d.]/g, '');
  const parsed = parseFloat(cleaned);
  
  return isValidSRM(parsed) ? parsed : null;
}

/**
 * Validate SRM calculation by checking fermentables
 * @param {Array} fermentables - Array of fermentable objects
 * @returns {Object} Validation result with details
 */
function validateSRMCalculation(fermentables) {
  if (!isValidArray(fermentables, { allowEmpty: false })) {
    return {
      isValid: false,
      reason: 'No fermentables provided',
      details: []
    };
  }
  
  const details = [];
  let hasValidFermentables = false;
  
  for (let i = 0; i < fermentables.length; i++) {
    const fermentable = fermentables[i];
    const name = fermentable.name || `Fermentable ${i + 1}`;
    
    if (!isValidAmount(fermentable.amount)) {
      details.push(`${name}: Missing or invalid amount`);
    } else if (!isValidColor(fermentable.color)) {
      details.push(`${name}: Missing or invalid color value`);
    } else {
      hasValidFermentables = true;
      details.push(`${name}: OK (${fermentable.amount}kg, ${fermentable.color}°L)`);
    }
  }
  
  return {
    isValid: hasValidFermentables,
    reason: hasValidFermentables ? 'Valid fermentables found' : 'No valid fermentables found',
    details
  };
}

// Export safe wrappers for all calculation functions
const safeCalculateEstimatedSRM = (recipeData) => 
  safeCalculation(() => calculateEstimatedSRM(recipeData), '—', {
    calculator: 'srm',
    operation: 'estimated_srm'
  });

const safeGetNumericSRM = (recipeData) => 
  safeCalculation(() => getNumericSRM(recipeData), null, {
    calculator: 'srm',
    operation: 'numeric_srm'
  });

const safeParseSRMFromFormatted = (formattedSRM) => 
  safeCalculation(() => parseSRMFromFormatted(formattedSRM), null, {
    calculator: 'srm',
    operation: 'parse_formatted'
  });

const safeValidateSRMCalculation = (fermentables) => 
  safeCalculation(() => validateSRMCalculation(fermentables), { isValid: false, reason: 'Validation error', details: [] }, {
    calculator: 'srm',
    operation: 'validate'
  });

export {
  calculateSRM,
  safeCalculateEstimatedSRM as calculateEstimatedSRM,
  safeGetNumericSRM as getNumericSRM,
  safeParseSRMFromFormatted as parseSRMFromFormatted,
  safeValidateSRMCalculation as validateSRMCalculation
};
