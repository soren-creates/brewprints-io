/**
 * Gravity Calculator - Atomic Calculator Pattern
 * 
 * Calculates original gravity (OG), final gravity (FG), and ABV
 * from recipe data and fermentables.
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific gravity calculations
 */

import { getEfficiencyForCalculations } from './efficiency-calculator.js';
import { getEstimatedYeastAttenuation } from './yeast-calculator.js';
import { parseGravityFromFormatted } from '../utilities/formatting/formatting-utils.js';
import { 
  L_TO_GAL, 
  KG_TO_LB, 
  ABV_CONVERSION_FACTOR,
  LAST_RUNNINGS_MIN,
  LAST_RUNNINGS_MAX,
  THICK_MASH_FACTOR,
  NORMAL_MASH_FACTOR,
  THIN_MASH_FACTOR,
  THICK_THRESHOLD,
  THIN_THRESHOLD,
  YIELD_TO_PPG_CONVERSION,
  GRAVITY_RANGE_PADDING,
  GALLONS_TO_QUARTS
} from '../core/constants.js';
import { formatGravity } from '../utilities/formatting/formatting-utils.js';
import { safeCalculation } from '../utilities/errors/error-utils.js';


/**
 * Calculate pre-boil gravity using consistent efficiency
 * @param {Object} recipeData - Recipe data object
 * @returns {string} Formatted pre-boil gravity
 */
function calculatePreBoilGravity(recipeData) {
  
  // Use pre-calculated value from Brewfather if available
  if (recipeData.preBoilGravity) {
    return formatGravity(recipeData.preBoilGravity);
  }
  
  // Return early if no boil size
  if (!recipeData.boilSize) {
    return '—';
  }

  const fermentables = recipeData.ingredients.fermentables;
  let grainGravityPoints = 0;
  let extractGravityPoints = 0;

  fermentables.forEach(fermentable => {
    // Data guaranteed valid by RecipeValidator - no validation needed
    const amountLb = fermentable.amount * KG_TO_LB; // Convert kg to lbs
    const ppg = fermentable.yield * YIELD_TO_PPG_CONVERSION; // Convert yield to PPG
    const points = amountLb * ppg;
    
    if (fermentable.type) {
      const fermentableType = fermentable.type.toLowerCase();
      
      if (fermentableType === 'grain' || fermentableType === 'adjunct') {
        // Grains: affected by mash efficiency
        grainGravityPoints += points;
      } else if (fermentableType === 'extract' ||
                 fermentableType === 'dry extract' ||
                 fermentableType.includes('extract')) {
        // Extracts: 100% efficiency, but only if added before/during boil
        const isPostBoil = fermentable.addAfterBoil || false;
        if (!isPostBoil) {
          extractGravityPoints += points;
        }
      }
    }
  });

  if (grainGravityPoints === 0 && extractGravityPoints === 0) {
    return '—';
  }

  // Apply efficiency only to grain gravity points
  const efficiency = getEfficiencyForCalculations(recipeData) / 100;
  const boilVolumeGal = recipeData.boilSize * L_TO_GAL; // Convert L to gallons
  
  // Combine grain points (with efficiency) and extract points (100% efficiency)
  const effectiveGrainPoints = grainGravityPoints * efficiency;
  const totalEffectivePoints = effectiveGrainPoints + extractGravityPoints;
  
  const preBoilGravity = 1 + (totalEffectivePoints / (boilVolumeGal * 1000));
  
  return formatGravity(preBoilGravity);
}

/**
 * Calculate post-boil gravity from pre-boil gravity and volume concentration
 * @param {Object} recipeData - Recipe data object
 * @returns {string} Formatted post-boil gravity
 */
function calculatePostBoilGravity(recipeData) {
  
  // Use pre-calculated value from Brewfather if available
  if (recipeData.postBoilGravity) {
    return formatGravity(recipeData.postBoilGravity);
  }
  
  // Return early if missing required volumes
  if (!recipeData.boilSize || !recipeData.batchSize) {
    return '—';
  }

  // First get the pre-boil gravity (now using consistent efficiency)
  const preBoilGravity = parseGravityFromFormatted(calculatePreBoilGravity(recipeData));
  if (!preBoilGravity) {
    return '—';
  }

  // Get volumes
  const preBoilVolumeL = recipeData.boilSize; // Pre-boil volume in liters
  const postBoilVolumeL = recipeData.batchSize; // Post-boil volume in liters (batch size)

  // Calculate post-boil gravity using volume concentration
  // Formula: Post-boil gravity points = Pre-boil gravity points × pre-boil volume ÷ post-boil volume
  const preBoilPoints = (preBoilGravity - 1) * 1000; // Convert to gravity points
  const postBoilPoints = (preBoilPoints * preBoilVolumeL) / postBoilVolumeL;
  const postBoilGravity = 1 + (postBoilPoints / 1000);

  return formatGravity(postBoilGravity);
}

/**
 * Calculate estimated Original Gravity when missing from BeerXML
 * @param {Object} recipeData - Recipe data object
 * @returns {string} Formatted original gravity
 */
function calculateEstimatedOG(recipeData) {
  
  // If OG is already provided, return it
  if (recipeData.og && recipeData.og > 1) {
    return formatGravity(recipeData.og);
  }
  
  // Try to derive from post-boil gravity calculation
  const postBoilGravity = parseGravityFromFormatted(calculatePostBoilGravity(recipeData));
  if (postBoilGravity && postBoilGravity > 1) {
    return formatGravity(postBoilGravity);
  }
  
  // Return early if no batch size
  if (!recipeData.batchSize) {
    return '—';
  }
  
  const fermentables = recipeData.ingredients.fermentables;
  const batchSizeGal = recipeData.batchSize * L_TO_GAL; // Convert L to gallons
  const efficiency = getEfficiencyForCalculations(recipeData) / 100;
  
  let grainGravityPoints = 0;
  let extractGravityPoints = 0;

  fermentables.forEach(fermentable => {
    // Data guaranteed valid by RecipeValidator - no validation needed
    const amountLb = fermentable.amount * KG_TO_LB; // Convert kg to lbs
    const ppg = fermentable.yield * YIELD_TO_PPG_CONVERSION; // Convert yield to PPG
    const points = amountLb * ppg;
    
    if (fermentable.type) {
      const fermentableType = fermentable.type.toLowerCase();
      
      if (fermentableType === 'grain' || fermentableType === 'adjunct') {
        // Grains: affected by mash efficiency
        grainGravityPoints += points;
      } else if (fermentableType === 'extract' ||
                 fermentableType === 'dry extract' ||
                 fermentableType.includes('extract')) {
        // Extracts: 100% efficiency, but only if added before/during boil
        const isPostBoil = fermentable.addAfterBoil || false;
        if (!isPostBoil) {
          extractGravityPoints += points;
        }
      }
    }
  });

  if (grainGravityPoints === 0 && extractGravityPoints === 0) {
    return '—';
  }

  // Apply efficiency only to grain gravity points
  const effectiveGrainPoints = grainGravityPoints * efficiency;
  const totalEffectivePoints = effectiveGrainPoints + extractGravityPoints;
  
  const estimatedOG = 1 + (totalEffectivePoints / (batchSizeGal * 1000));
  return formatGravity(estimatedOG);
}

/**
 * Calculate estimated Final Gravity when missing from BeerXML
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {string} Formatted final gravity
 * @precondition recipeData.fg is valid gravity or undefined
 * @precondition recipeData.ingredients.yeasts is valid array if present
 */
function calculateEstimatedFG(recipeData) {
  // If FG is already provided, return it
  if (recipeData.fg) {
    return formatGravity(recipeData.fg);
  }
  
  // Get OG and yeast attenuation
  const ogFormatted = calculateEstimatedOG(recipeData);
  const og = parseGravityFromFormatted(ogFormatted);
  
  if (!og) {
    return '—';
  }
  
  const attenuation = getEstimatedYeastAttenuation(recipeData) / 100;
  
  // Calculate FG using attenuation formula
  // FG = OG - (OG - 1) * attenuation
  const estimatedFG = og - ((og - 1) * attenuation);
  
  return formatGravity(estimatedFG);
}

/**
 * Calculate estimated ABV when missing from BeerXML
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {string} Formatted ABV
 * @precondition recipeData.abv is valid percentage or undefined
 * @precondition recipeData.ingredients.yeasts is valid array if present
 */
function calculateEstimatedABV(recipeData) {
  
  // If ABV is already provided, return it
  if (recipeData.abv) {
    return `${recipeData.abv.toFixed(1)}%`;
  }
  
  // Get OG and FG
  const ogFormatted = calculateEstimatedOG(recipeData);
  const fgFormatted = calculateEstimatedFG(recipeData);
  
  const og = parseGravityFromFormatted(ogFormatted);
  const fg = parseGravityFromFormatted(fgFormatted);
  
  if (!og || !fg) {
    return '—';
  }
  
  // Standard ABV calculation formula
  // ABV = (OG - FG) * 131.25
  const estimatedABV = (og - fg) * ABV_CONVERSION_FACTOR;
  
  return `${estimatedABV.toFixed(1)}%`;
}

/**
 * Calculate first runnings gravity range as formatted string
 * @param {Object} recipeData - Recipe data object
 * @returns {string} Formatted gravity range or '—' if not calculable
 */
function calculateFirstRunningsGravityFormatted(recipeData) {
  // Check if this is a no-sparge recipe
  if (isNoSpargeRecipe(recipeData)) {
    return '—';
  }
  
  // Get pre-boil gravity as baseline
  const preBoilGravityFormatted = calculatePreBoilGravity(recipeData);
  const preBoilGravity = parseGravityFromFormatted(preBoilGravityFormatted);
  
  if (!preBoilGravity) {
    return '—';
  }
  
  // Get water-to-grain ratio
  const waterToGrainRatio = getWaterToGrainRatio(recipeData);
  
  // Determine concentration factor based on mash thickness
  
  let concentrationFactor;
  if (waterToGrainRatio <= THICK_THRESHOLD) {
    concentrationFactor = THICK_MASH_FACTOR;
  } else if (waterToGrainRatio >= THIN_THRESHOLD) {
    concentrationFactor = THIN_MASH_FACTOR;
  } else {
    concentrationFactor = NORMAL_MASH_FACTOR;
  }
  
  // Calculate first runnings gravity
  const baseGravityPoints = (preBoilGravity - 1) * 1000;
  const firstRunningsPoints = baseGravityPoints * concentrationFactor;
  const firstRunningsGravity = 1 + (firstRunningsPoints / 1000);
  
  // Create range (±10 points)
  const minGravity = Math.max(firstRunningsGravity - GRAVITY_RANGE_PADDING, 1.020);
  const maxGravity = Math.min(firstRunningsGravity + GRAVITY_RANGE_PADDING, 1.120);
  
  return `${formatGravity(minGravity)} - ${formatGravity(maxGravity)}`;
}

/**
 * Calculate last runnings gravity range as formatted string
 * @param {Object} recipeData - Recipe data object
 * @returns {string} Formatted gravity range or '—' if not applicable
 */
function calculateLastRunningsGravityFormatted(recipeData) {
  // Check if this is a no-sparge recipe
  if (isNoSpargeRecipe(recipeData)) {
    return '—';
  }
  
  return `${formatGravity(LAST_RUNNINGS_MIN)} - ${formatGravity(LAST_RUNNINGS_MAX)}`;
}

/**
 * Check if recipe uses no-sparge method
 * @param {Object} recipeData - Recipe data object
 * @returns {boolean} True if no-sparge recipe
 */
function isNoSpargeRecipe(recipeData) {
  const equipmentName = recipeData.equipment?.name?.toLowerCase() || '';
  const notes = recipeData.notes?.toLowerCase() || '';
  
  return equipmentName.includes('no sparge') || 
         equipmentName.includes('biab') ||
         equipmentName.includes('brew in a bag') ||
         notes.includes('no sparge') ||
         notes.includes('no-sparge');
}

/**
 * Get water-to-grain ratio from recipe data
 * @param {Object} recipeData - Recipe data object
 * @returns {number} Water-to-grain ratio in qt/lb
 */
function getWaterToGrainRatio(recipeData) {
  // Try to get from water volume tracking first
  if (recipeData.waterVolumeTracking?.waterToGrainRatio) {
    return recipeData.waterVolumeTracking.waterToGrainRatio;
  }
  
  // Fallback calculation from mash steps and grain bill
  if (!recipeData.mash?.steps) {
    return NORMAL_MASH_FACTOR; // Default assumption for normal mash
  }
  
  // Calculate strike water volume
  let strikeWaterL = 0;
  recipeData.mash.steps.forEach(step => {
    if (step.infuseAmount) {
      strikeWaterL += step.infuseAmount;
    }
  });
  
  // Calculate total grain weight
  let totalGrainKg = 0;
  recipeData.ingredients.fermentables.forEach(fermentable => {
    if (fermentable.type?.toLowerCase() === 'grain') {
      // Data guaranteed valid by RecipeValidator - no validation needed
      totalGrainKg += fermentable.amount;
    }
  });
  
  if (!strikeWaterL || !totalGrainKg) {
    return NORMAL_MASH_FACTOR; // Default assumption for normal mash
  }
  
  // Convert to qt/lb using existing constants
  const strikeWaterGal = strikeWaterL * L_TO_GAL;
  const strikeWaterQt = strikeWaterGal * GALLONS_TO_QUARTS;
  const totalGrainLb = totalGrainKg * KG_TO_LB;
  
  return strikeWaterQt / totalGrainLb;
}

/**
 * Get all estimated values in one call for efficiency
 * @param {Object} recipeData - Recipe data object
 * @param {Function} getEstimatedYeastAttenuation - Function to get yeast attenuation
 * @returns {Object} All estimated gravity values
 */
function calculateEstimatedValues(recipeData) {
  return {
    estimatedOG: calculateEstimatedOG(recipeData),
    estimatedFG: calculateEstimatedFG(recipeData),
    estimatedABV: calculateEstimatedABV(recipeData),
    yeastAttenuation: `${getEstimatedYeastAttenuation(recipeData).toFixed(0)}%`
  };
}

// Safe wrapper functions with error boundaries
const safeCalculatePreBoilGravity = (recipeData) => 
  safeCalculation(() => calculatePreBoilGravity(recipeData), '—', { 
    calculator: 'gravity', 
    operation: 'pre_boil_gravity' 
  });

const safeCalculatePostBoilGravity = (recipeData) => 
  safeCalculation(() => calculatePostBoilGravity(recipeData), '—', { 
    calculator: 'gravity', 
    operation: 'post_boil_gravity' 
  });

const safeCalculateEstimatedOG = (recipeData) => 
  safeCalculation(() => calculateEstimatedOG(recipeData), '—', { 
    calculator: 'gravity', 
    operation: 'estimated_og' 
  });

const safeCalculateEstimatedFG = (recipeData) => 
  safeCalculation(() => calculateEstimatedFG(recipeData), '—', { 
    calculator: 'gravity', 
    operation: 'estimated_fg' 
  });

const safeCalculateEstimatedABV = (recipeData) => 
  safeCalculation(() => calculateEstimatedABV(recipeData), '—', { 
    calculator: 'gravity', 
    operation: 'estimated_abv' 
  });

const safeCalculateEstimatedValues = (recipeData) => 
  safeCalculation(() => calculateEstimatedValues(recipeData), {
    estimatedOG: '—',
    estimatedFG: '—', 
    estimatedABV: '—',
    yeastAttenuation: '—'
  }, { 
    calculator: 'gravity', 
    operation: 'estimated_values' 
  });

const safeCalculateFirstRunningsGravityFormatted = (recipeData) => 
  safeCalculation(() => calculateFirstRunningsGravityFormatted(recipeData), '—', { 
    calculator: 'gravity', 
    operation: 'first_runnings_gravity' 
  });

const safeCalculateLastRunningsGravityFormatted = (recipeData) => 
  safeCalculation(() => calculateLastRunningsGravityFormatted(recipeData), '—', { 
    calculator: 'gravity', 
    operation: 'last_runnings_gravity' 
  });

export {
  safeCalculatePreBoilGravity as calculatePreBoilGravity,
  safeCalculatePostBoilGravity as calculatePostBoilGravity,
  safeCalculateEstimatedOG as calculateEstimatedOG,
  safeCalculateEstimatedFG as calculateEstimatedFG,
  safeCalculateEstimatedABV as calculateEstimatedABV,
  safeCalculateEstimatedValues as calculateEstimatedValues,
  safeCalculateFirstRunningsGravityFormatted as calculateFirstRunningsGravityFormatted,
  safeCalculateLastRunningsGravityFormatted as calculateLastRunningsGravityFormatted
};
