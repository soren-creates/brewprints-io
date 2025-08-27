/**
 * IBU Calculator - Atomic Calculator Pattern
 * 
 * Calculates International Bitterness Units (IBU) using the official Tinseth formula.
 * Handles hop additions during boil, whirlpool, and other stages.
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific IBU calculations
 */

import { calculatePreBoilGravity, calculatePostBoilGravity } from './gravity-calculator.js';
import { parseGravityFromFormatted } from '../utilities/formatting/formatting-utils.js';
import { 
  L_TO_GAL,
  KG_TO_OZ,
  ALPHA_ACID_FACTOR,
  BIGNESS_FACTOR_BASE,
  BIGNESS_FACTOR_EXPONENT,
  BOIL_TIME_FACTOR_COEFFICIENT,
  BOIL_TIME_FACTOR_DIVISOR,
  WHIRLPOOL_MAX_TIME,
  DEFAULT_NON_BOIL_TIME
} from '../core/constants.js';

import {
  isValidAmount,
  isValidIBU,
  parseNumber
} from '../utilities/validation/validation-utils.js';
import { safeCalculation } from '../utilities/errors/error-utils.js';

/**
 * Calculate Tinseth utilization factor using official formulas
 * decimal alpha acid utilization = Bigness factor * Boil Time factor
 * @param {number} boilGravity - Average boil gravity
 * @param {number} boilTimeMinutes - Boil time in minutes
 * @returns {number} Utilization factor
 */
function calculateTinsethUtilization(boilGravity, boilTimeMinutes) {
  
  // Bigness factor accounts for reduced utilization due to higher wort gravities
  // Bigness factor = 1.65 * 0.000125^(wort gravity - 1)
  const bignessFactor = BIGNESS_FACTOR_BASE * Math.pow(BIGNESS_FACTOR_EXPONENT, boilGravity - 1);
  
  // Boil Time factor accounts for the change in utilization due to boil time
  // Boil Time factor = (1 - e^(-0.04 * time in mins)) / 4.15
  const boilTimeFactor = (1 - Math.exp(-BOIL_TIME_FACTOR_COEFFICIENT * boilTimeMinutes)) / BOIL_TIME_FACTOR_DIVISOR;
  
  // Combine the factors
  return bignessFactor * boilTimeFactor;
}

/**
 * Calculate estimated IBU when missing from BeerXML using official Tinseth formula
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {string} Formatted IBU value
 * @precondition recipeData.ibu is undefined or valid number >= 0
 * @precondition recipeData.batchSize is valid number > 0
 * @precondition recipeData.ingredients.hops is valid array (may be empty)
 * @precondition All hop objects have valid amount > 0, alpha > 0, time >= 0
 */
function calculateEstimatedIBU(recipeData) {
  
  // If IBU is already provided, return it (including 0)
  if (recipeData.ibu !== undefined) {
    return recipeData.ibu.toFixed(0);
  }

  // If no hops, IBU is 0 (guaranteed by brewing domain knowledge)
  if (recipeData.ingredients.hops.length === 0) {
    return '0';
  }

  // Get boil gravity for utilization calculation (input guaranteed valid)
  const avgBoilGravity = 1 + ((parseGravityFromFormatted(calculatePreBoilGravity(recipeData)) - 1) + (parseGravityFromFormatted(calculatePostBoilGravity(recipeData)) - 1)) / 2;
  
  // Convert batch size to gallons for the formula (input guaranteed valid)
  const batchSizeGal = recipeData.batchSize * L_TO_GAL;
  let totalIBU = 0;

  // Calculate IBU for each hop addition using official Tinseth formula
  recipeData.ingredients.hops.forEach(hop => {
    const hopUse = (hop.use || '').toLowerCase();
    
    // Skip dry hop additions (no IBU contribution)
    if (hopUse === 'dry hop' || hopUse === 'dry') {
      return;
    }

    // Direct usage - all properties guaranteed valid by RecipeValidator
    const alphaAcidPercent = hop.alpha;
    const hopAmountKg = hop.amount;
    let boilTimeMin = hop.time;

    // Convert hop amount to ounces for the formula
    const hopAmountOz = hopAmountKg * KG_TO_OZ;

    // Adjust time for different hop uses
    if (hopUse === 'whirlpool' || hopUse === 'flameout' || hopUse === 'aroma') {
      // Whirlpool/flameout hops get reduced utilization (equivalent to ~10 min boil)
      boilTimeMin = Math.min(boilTimeMin, WHIRLPOOL_MAX_TIME);
    } else if (hopUse !== 'boil' && boilTimeMin === 0) {
      // If not specifically boil and no time specified, assume minimal contribution
      boilTimeMin = DEFAULT_NON_BOIL_TIME;
    }

    // Calculate mg/l of added alpha acids using official Tinseth formula
    // mg/l = decimal AA rating * ozs hops * 7490 / volume in gallons
    const decimalAA = alphaAcidPercent / 100; // Convert percentage to decimal
    // Convert volumes to gallons for the formula
    const batchSizeGal = recipeData.batchSize * L_TO_GAL; // Convert L to gallons
    const boilSizeGal = recipeData.boilSize * L_TO_GAL; // Convert L to gallons
    
    // Use average boil volume for more accurate IBU calculation
    const avgBoilVolumeGal = (boilSizeGal + batchSizeGal) / 2;
    const mgPerLiterAA = (decimalAA * hopAmountOz * ALPHA_ACID_FACTOR) / avgBoilVolumeGal;

    // Calculate decimal alpha acid utilization using Tinseth factors
    const utilization = calculateTinsethUtilization(avgBoilGravity, boilTimeMin);

    // Calculate IBU contribution using official Tinseth formula
    // IBUs = decimal alpha acid utilization * mg/l of added alpha acids
    const hopIBU = utilization * mgPerLiterAA;
    
    totalIBU += hopIBU;
  });

  return totalIBU.toFixed(0);
}

/**
 * Get numeric IBU value for calculations (like style comparisons)
 * @param {Object} recipeData - Recipe data object
 * @returns {number|null} Numeric IBU value or null if not available
 */
function getNumericIBU(recipeData) {
  if (recipeData.ibu !== undefined && recipeData.ibu !== null) {
    return recipeData.ibu;
  }
  
  const estimatedIBU = calculateEstimatedIBU(recipeData);
  if (estimatedIBU === '—') {
    return null;
  }
  
  const parsedIBU = parseNumber(estimatedIBU);
  return isValidIBU(parsedIBU) ? parsedIBU : null;
}

// Safe wrapper functions with error boundaries
const safeCalculateTinsethUtilization = (boilGravity, boilTimeMinutes) => 
  safeCalculation(() => calculateTinsethUtilization(boilGravity, boilTimeMinutes), 0, { 
    calculator: 'ibu', 
    operation: 'tinseth_utilization' 
  });

const safeCalculateEstimatedIBU = (recipeData) => 
  safeCalculation(() => calculateEstimatedIBU(recipeData), '—', { 
    calculator: 'ibu', 
    operation: 'estimated_ibu' 
  });

const safeGetNumericIBU = (recipeData) => 
  safeCalculation(() => getNumericIBU(recipeData), 0, { 
    calculator: 'ibu', 
    operation: 'numeric_ibu' 
  });

export {
  safeCalculateTinsethUtilization as calculateTinsethUtilization,
  safeCalculateEstimatedIBU as calculateEstimatedIBU,
  safeGetNumericIBU as getNumericIBU
};
