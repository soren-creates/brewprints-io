/**
 * Efficiency Calculator - Orchestrator Pattern
 * 
 * Calculates various brewing efficiencies including mash efficiency,
 * brewhouse efficiency, and apparent attenuation.
 * 
 * ARCHITECTURAL PATTERN: Orchestrator
 * - Coordinates efficiency calculations across brewing process stages
 * - Uses errorHandler.handleError() for complex error scenarios with fallback logic
 * - Integrates with multiple calculation dependencies (gravity, equipment analysis)
 * - Provides domain-specific error recovery for brewing measurements
 */

import { 
  L_TO_GAL, 
  KG_TO_LB,
  DEFAULT_EFFICIENCY,
  MIN_EFFICIENCY,
  MAX_EFFICIENCY
} from '../core/constants.js';

import { parseGravityFromFormatted } from '../utilities/formatting/formatting-utils.js';
import { errorHandler } from '../utilities/errors/error-handler.js';
import { CalculationError } from '../utilities/errors/application-errors.js';

/**
 * Get efficiency for calculations with equipment-based adjustments
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {number} Efficiency percentage for calculations
 * @precondition recipeData.efficiency is valid percentage or undefined
 * @precondition recipeData.equipment.name is valid string or undefined
 */
function getEfficiencyForCalculations(recipeData) {
  
  // Same fallback logic as display: 70% if not specified
  const brewhouseEfficiency = recipeData.efficiency || DEFAULT_EFFICIENCY;
  
  // Same equipment detection logic as display
  const equipmentName = recipeData.equipment?.name?.toLowerCase() || '';
  const isNoSparge = equipmentName.includes('no sparge') || equipmentName.includes('biab');
  const isAllInOne = equipmentName.includes('foundry') || equipmentName.includes('grainfather') || equipmentName.includes('brewzilla');
  
  // Same calculation logic as display
  let mashEfficiency;
  if (isNoSparge || isAllInOne) {
    mashEfficiency = Math.min(brewhouseEfficiency * 1.05, 80);
  } else {
    mashEfficiency = Math.min(brewhouseEfficiency * 1.03, 75);
  }
  
  // Same bounds checking as display
  mashEfficiency = Math.max(mashEfficiency, brewhouseEfficiency);
  mashEfficiency = Math.min(mashEfficiency, MAX_EFFICIENCY);
  
  return mashEfficiency;
}

/**
 * Calculate brewhouse efficiency using derived post-boil gravity with consistent efficiency
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @param {Function} parseGravityFromFormatted - Function to parse gravity
 * @param {Function} calculatePostBoilGravity - Function to calculate post-boil gravity
 * @returns {string} Formatted brewhouse efficiency
 * @precondition recipeData.ingredients.fermentables is valid array with valid amount/yield
 * @precondition recipeData.batchSize is valid number > 0
 */
function calculateBrewhouseEfficiency(recipeData, calculatePostBoilGravity) {
  // parseGravityFromFormatted is now imported directly - no longer a parameter
  
  // Use pre-calculated efficiency from Brewfather if available
  if (recipeData.efficiency && typeof recipeData.efficiency === 'object' && recipeData.efficiency.brewhouse) {
    return `${recipeData.efficiency.brewhouse}%`;
  }
  
  if (!recipeData.batchSize) {
    return '—';
  }

  const recipeType = (recipeData.type || '').toLowerCase();
  
  // Get the derived post-boil gravity
  const postBoilGravity = parseGravityFromFormatted(calculatePostBoilGravity(recipeData));
  if (postBoilGravity === null) {
    return '—';
  }

  // Calculate theoretical gravity points based on recipe type
  let totalTheoreticalPoints = 0;
  const fermentables = recipeData.ingredients.fermentables;
  
  fermentables.forEach(fermentable => {
    if (fermentable.type) {
      const fermentableType = fermentable.type.toLowerCase();
      // Data guaranteed valid by RecipeValidator - no validation needed
      const amountLb = fermentable.amount * KG_TO_LB;
      const ppg = fermentable.yield * 0.46;
      const points = amountLb * ppg;
      
      // Only count fermentables that contribute to post-boil gravity
      const isPostBoil = fermentable.addAfterBoil || false;
      if (!isPostBoil) {
        if (recipeType === 'extract') {
          // For extract recipes, use theoretical potential of extracts
          // This represents efficiency of extract utilization + brewing losses
          if (fermentableType === 'extract' || 
              fermentableType === 'dry extract' || 
              fermentableType.includes('extract')) {
            totalTheoreticalPoints += points;
          }
          // Still include specialty grains if present
          if (fermentableType === 'grain' || fermentableType === 'adjunct') {
            // Assume perfect extraction from specialty grains (small amounts)
            totalTheoreticalPoints += points;
          }
        } else {
          // For all grain recipes, theoretical is perfect extraction from grains
          if (fermentableType === 'grain' || fermentableType === 'adjunct') {
            totalTheoreticalPoints += points;
          }
          // Don't include extracts in all-grain theoretical calculation
        }
      }
    }
  });

  if (totalTheoreticalPoints === 0) {
    return '—';
  }

  // Calculate actual gravity points in post-boil volume
  const postBoilVolumeGal = recipeData.batchSize * L_TO_GAL;
  const actualGravityPoints = (postBoilGravity - 1) * 1000 * postBoilVolumeGal;

  // Calculate brewhouse efficiency
  const brewhouseEfficiency = (actualGravityPoints / totalTheoreticalPoints) * 100;

  // Apply different bounds based on recipe type
  let minEff, maxEff;
  if (recipeType === 'extract') {
    // Extract recipes typically see 85-95% due to brewing losses only
    minEff = 80;
    maxEff = 95;
  } else {
    // All grain recipes see 65-85% due to mash + brewing losses
    minEff = MIN_EFFICIENCY;
    maxEff = MAX_EFFICIENCY;
  }

  const boundedEfficiency = Math.max(minEff, Math.min(maxEff, brewhouseEfficiency));

  return `${boundedEfficiency.toFixed(1)}%`;
}

/**
 * Calculate mash efficiency (All Grain only)
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {string} Formatted mash efficiency
 * @precondition recipeData.ingredients.fermentables is valid array with valid amount/yield
 * @precondition recipeData.equipment is valid object or undefined
 */
function calculateMashEfficiencyFormatted(recipeData) {
  const recipeType = (recipeData.type || '').toLowerCase();
  
  // Mash efficiency only applies to all grain recipes
  if (recipeType === 'extract') {
    return 'N/A';
  }

  // Use streamlined mash efficiency calculation
  try {
    const mashEfficiency = calculateMashEfficiencyCore(recipeData);
    if (mashEfficiency === null) {
      return '—';
    }
    return `${mashEfficiency.toFixed(1)}%`;
  } catch (error) {
    errorHandler.handleError(new CalculationError('Mash efficiency calculation failed', {
      userMessage: 'Unable to calculate mash efficiency. Using fallback method.',
      severity: 'warning',
      recoverable: true,
      details: { 
        calculator: 'efficiency', 
        calculation: 'mash_efficiency', 
        originalError: error.message,
        recipeContext: {
          recipeName: recipeData.name || 'Unnamed Recipe',
          batchSize: recipeData.batchSize,
          efficiency: recipeData.efficiency
        },
        inputValues: {
          preBoilGravity,
          preBoilVolume,
          grainWeight
        },
        remediation: 'Check that pre-boil gravity and volume measurements are accurate'
      }
    }), { context: 'mash_efficiency_calculation' });
    
    // Fallback to simplified calculation if the dedicated calculator fails
    if (!recipeData.equipment) {
      return '—';
    }

    // Get the brewhouse efficiency as our baseline - already validated
    const brewhouseEfficiency = recipeData.efficiency;
    
    if (!brewhouseEfficiency) {
      return '—';
    }
    
    // Determine system type from equipment name
    const equipmentName = recipeData.equipment.name ? recipeData.equipment.name.toLowerCase() : '';
    const isNoSparge = equipmentName.includes('no sparge') || equipmentName.includes('biab');
    const isAllInOne = equipmentName.includes('foundry') || equipmentName.includes('grainfather') || equipmentName.includes('brewzilla');
    
    // Calculate mash efficiency based on system type
    let mashEfficiency;
    
    if (isNoSparge || isAllInOne) {
      mashEfficiency = Math.min(brewhouseEfficiency * 1.05, 80);
    } else {
      mashEfficiency = Math.min(brewhouseEfficiency * 1.03, 75);
    }
    
    // Ensure reasonable bounds
    mashEfficiency = Math.max(mashEfficiency, brewhouseEfficiency);
    mashEfficiency = Math.min(mashEfficiency, MAX_EFFICIENCY);
    
    return `${mashEfficiency.toFixed(1)}%`;
  }
}

/**
 * Core mash efficiency calculation (streamlined from over-engineered version)
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {number|null} Mash efficiency percentage or null if not calculable
 * @precondition recipeData.ingredients.fermentables is valid array with valid amount/yield
 * @precondition recipeData.batchSize and recipeData.efficiency are valid numbers
 */
function calculateMashEfficiencyCore(recipeData) {
  
  // Validate recipe type
  const recipeType = (recipeData.type || '').toLowerCase();
  if (recipeType === 'extract') {
    return null; // Extract recipes don't have mash efficiency
  }
  
  // Get basic recipe data - already validated by RecipeValidator
  const batchSize = recipeData.batchSize; // liters
  const boilSize = recipeData.boilSize; // liters
  const brewhouseEfficiency = recipeData.efficiency;
  
  // Check required data
  if (!batchSize || !brewhouseEfficiency) {
    return null;
  }
  
  // Calculate grain bill and theoretical points
  let totalTheoreticalPoints = 0;
  let totalGrainWeight = 0;
  
  recipeData.ingredients.fermentables.forEach(fermentable => {
    const type = (fermentable.type || '').toLowerCase();
    
    // Only include mashed grains
    if (type === 'grain' || type === 'adjunct') {
      // Data guaranteed valid by RecipeValidator - no validation needed
      const amountLb = fermentable.amount * KG_TO_LB;
      const ppg = (fermentable.yield / 100) * 46.214; // Convert yield to PPG (points per pound per gallon)
      const points = amountLb * ppg;
      
      totalTheoreticalPoints += points;
      totalGrainWeight += fermentable.amount;
    }
  });
  
  if (totalTheoreticalPoints === 0) {
    return null; // No mashed grains
  }
  
  // Method 1: If we have measured OG, calculate backwards
  if (recipeData.og && recipeData.og > 1) {
    const batchSizeGal = batchSize * L_TO_GAL;
    const actualPointsFermenter = (recipeData.og - 1) * 1000 * batchSizeGal;
    const actualBrewhouseEfficiency = (actualPointsFermenter / totalTheoreticalPoints) * 100;
    
    // Mash efficiency is typically higher than brewhouse efficiency
    // Account for losses between mash and fermenter (typically 5-15%)
    const estimatedLossPercent = 10; // Reasonable estimate
    const mashEfficiency = actualBrewhouseEfficiency * (100 + estimatedLossPercent) / 100;
    
    // Ensure reasonable bounds (60-90%)
    return Math.max(60, Math.min(90, mashEfficiency));
  }
  
  // Method 2: Estimate from brewhouse efficiency and system type
  const equipmentName = recipeData.equipment?.name?.toLowerCase() || '';
  const isNoSparge = equipmentName.includes('no sparge') || equipmentName.includes('biab');
  const isAllInOne = equipmentName.includes('foundry') || equipmentName.includes('grainfather') || equipmentName.includes('brewzilla');
  
  let mashEfficiency;
  
  if (isNoSparge || isAllInOne) {
    // All-in-one systems typically have higher mash efficiency relative to brewhouse
    mashEfficiency = Math.min(brewhouseEfficiency * 1.08, 85);
  } else {
    // Traditional 3-vessel systems
    mashEfficiency = Math.min(brewhouseEfficiency * 1.05, 80);
  }
  
  // Ensure reasonable bounds
  mashEfficiency = Math.max(60, Math.min(90, mashEfficiency));
  
  return mashEfficiency;
}


export {
  getEfficiencyForCalculations,
  calculateBrewhouseEfficiency,
  calculateMashEfficiencyFormatted,
  calculateMashEfficiencyCore
};
