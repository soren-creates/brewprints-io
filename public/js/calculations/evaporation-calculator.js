/**
 * Evaporation Calculator - Atomic Calculator Pattern
 * 
 * Handles all evaporation-related calculations with data source prioritization.
 * Supports both regular boil and no-boil recipes.
 * 
 * Data Source Priority:
 * 1. Absolute boil-off rate (L/hr) - highest trust
 * 2. Trub/chiller loss - second highest trust  
 * 3. Percentage evaporation rate - lowest trust
 * 4. Validated defaults
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific evaporation calculations
 */

import { 
  BOIL_OFF_RATE_MIN_L_HR,
  BOIL_OFF_RATE_MAX_L_HR,
  BOIL_OFF_RATE_TYPICAL_L_HR,
  TRUB_LOSS_MIN,
  TRUB_LOSS_MAX,
  TRUB_LOSS_DEFAULT,
  THERMAL_CONTRACTION_DEFAULT,
  TRUB_LOSS_TOLERANCE_L
} from '../core/constants.js';
import { 
  boilOffRateToPercentage, 
  percentageToBoilOffRate
} from '../utilities/data/water-utils.js';
import { RecipeValidator } from '../core/recipe-validator.js';
import { formatVolume } from '../formatters/unit-formatter.js';
import { safeCalculation } from '../utilities/errors/error-utils.js';

/**
 * Handle evaporation calculations for no-boil recipes
 * @param {Object} processedData - Clean input data from recipe processor
 * @returns {Object} Evaporation calculation results
 */
function handleNoBoilEvaporation(processedData) {
  const { batchSizeL, boilSizeL } = processedData;
  const { topUpWater, trubChillerLoss } = processedData.equipment;
  
  let evapLossL = 0;
  let boilOffRateLHr = 0;
  let evapRate = 0;
  let postBoilVolumeL;
  let finalTrubChillerLoss = trubChillerLoss;
  let trubLossFlag = null;
  
  if (trubChillerLoss !== undefined && trubChillerLoss !== null) {
    // Use provided trub/chiller loss value and calculate Post-Mash Volume backwards
    // Post-Mash Volume = Fermenter Volume + Trub/Chiller Loss - Top-Up Fermenter
    postBoilVolumeL = batchSizeL + trubChillerLoss - topUpWater;
  } else {
    // No trub/chiller loss provided, use boilSize as Post-Mash Volume and calculate trub loss
    postBoilVolumeL = boilSizeL;
    finalTrubChillerLoss = Math.max(0, postBoilVolumeL - batchSizeL - topUpWater);
    trubLossFlag = `Calculated trub/chiller loss for no-boil recipe`;
  }
  
  return {
    evapLossL,
    postBoilVolumeL,
    boilOffRateLHr,
    evapRate,
    trubChillerLoss: finalTrubChillerLoss,
    evapRateFlag: null,
    trubLossFlag,
    preBoilVolumeFlag: null
  };
}

/**
 * Handle evaporation calculations for regular boil recipes
 * @param {Object} processedData - Clean input data from recipe processor
 * @returns {Object} Evaporation calculation results
 */
function handleRegularBoilEvaporation(processedData) {
  const { boilTime, batchSizeL, boilSizeL } = processedData;
  const { boilOffRateLHr, evapRate, trubChillerLoss, dataSourcePriority } = processedData.equipment;
  const { topUpWater } = processedData.equipment;

  let evapLossL;
  let postBoilVolumeL;
  let finalBoilOffRateLHr = boilOffRateLHr;
  let finalEvapRate = evapRate;
  let finalTrubChillerLoss = trubChillerLoss;
  let evapRateFlag = null;
  let trubLossFlag = null;
  let preBoilVolumeFlag = null;

  // Check which data sources we have
  const hasBoilOffRate = boilOffRateLHr !== undefined && boilOffRateLHr !== null && boilOffRateLHr > 0;
  const hasEvapRate = evapRate !== undefined && evapRate !== null && evapRate > 0;
  const hasTrubLoss = trubChillerLoss !== undefined && trubChillerLoss !== null && trubChillerLoss >= 0;
  
  // Data source prioritization in order of reliability:
  // 1. Absolute Boil-Off Rate (L/hr)
  // 2. Trub/Chiller Loss
  // 3. Percentage Evaporation Rate
  // 4. Defaults with validation
  
  if (hasBoilOffRate) {
    // HIGHEST TRUST: Use absolute boil-off rate
    evapLossL = finalBoilOffRateLHr * (boilTime / 60);
    finalEvapRate = boilOffRateToPercentage(finalBoilOffRateLHr, boilSizeL);
    postBoilVolumeL = boilSizeL - evapLossL;
    
    // Calculate the required trub loss to meet the target fermenter volume
    // Formula: postBoilVolume * (1 - thermalContraction) - trubLoss + topUpWater = batchSize
    // Solved for trubLoss: trubLoss = postBoilVolume * (1 - thermalContraction) + topUpWater - batchSize
    const requiredTrubLoss = postBoilVolumeL * (1 - THERMAL_CONTRACTION_DEFAULT) + topUpWater - batchSizeL;
    
    if (hasTrubLoss && Math.abs(trubChillerLoss - requiredTrubLoss) > TRUB_LOSS_TOLERANCE_L) {
      trubLossFlag = `Adjusted from ${formatVolume(trubChillerLoss)} to ensure target volume based on absolute boil-off rate.`;
    }
    finalTrubChillerLoss = requiredTrubLoss;

  } else if (hasTrubLoss) {
    // SECOND HIGHEST TRUST: Use trub/chiller loss
    // Calculate post-boil volume backwards from the trusted trub loss
    // Formula: (batchSize + trubChillerLoss - topUpWater) / (1 - thermalContraction) = postBoilVolume
    postBoilVolumeL = (batchSizeL + trubChillerLoss - topUpWater) / (1 - THERMAL_CONTRACTION_DEFAULT);
    evapLossL = boilSizeL - postBoilVolumeL;
    
    if (boilTime > 0) {
      finalBoilOffRateLHr = evapLossL * (60 / boilTime);
      finalEvapRate = boilOffRateToPercentage(finalBoilOffRateLHr, boilSizeL);
      evapRateFlag = 'Derived from boil/batch volumes and trub/chiller losses';
    } else {
      finalBoilOffRateLHr = 0;
      finalEvapRate = 0;
    }
    finalTrubChillerLoss = trubChillerLoss;

  } else if (hasEvapRate) {
    // LOWEST TRUST: Use percentage evaporation rate
    evapLossL = boilSizeL * (evapRate / 100) * (boilTime / 60);
    finalBoilOffRateLHr = percentageToBoilOffRate(evapRate, boilSizeL);
    postBoilVolumeL = boilSizeL - evapLossL;
    
    // Calculate trub loss accounting for thermal contraction and top-up water
    const volumeAfterContraction = postBoilVolumeL * (1 - THERMAL_CONTRACTION_DEFAULT);
    finalTrubChillerLoss = volumeAfterContraction + topUpWater - batchSizeL;
    finalEvapRate = evapRate;

  } else {
    // No reliable data sources - use defaults with validation
    finalBoilOffRateLHr = BOIL_OFF_RATE_TYPICAL_L_HR;
    evapLossL = finalBoilOffRateLHr * (boilTime / 60);
    finalEvapRate = boilOffRateToPercentage(finalBoilOffRateLHr, boilSizeL);
    postBoilVolumeL = boilSizeL - evapLossL;
    
    // Account for thermal contraction and top-up water when calculating trub loss
    const volumeAfterContraction = postBoilVolumeL * (1 - THERMAL_CONTRACTION_DEFAULT);
    finalTrubChillerLoss = volumeAfterContraction + topUpWater - batchSizeL;
    
    // Check if trub loss is reasonable
    if (finalTrubChillerLoss < TRUB_LOSS_MIN || finalTrubChillerLoss > TRUB_LOSS_MAX) {
      // Try adjusting boil-off rate to get reasonable trub loss
      let found = false;
      for (let testRate = BOIL_OFF_RATE_TYPICAL_L_HR; testRate >= BOIL_OFF_RATE_MIN_L_HR; testRate -= 0.2) {
        const testEvapLoss = testRate * (boilTime / 60);
        const testPostBoil = boilSizeL - testEvapLoss;
        const testVolAfterContraction = testPostBoil * (1 - THERMAL_CONTRACTION_DEFAULT);
        const testTrubLoss = testVolAfterContraction + topUpWater - batchSizeL;
        
        if (testTrubLoss >= TRUB_LOSS_MIN && testTrubLoss <= TRUB_LOSS_MAX) {
          finalBoilOffRateLHr = testRate;
          evapLossL = testEvapLoss;
          postBoilVolumeL = testPostBoil;
          finalEvapRate = boilOffRateToPercentage(finalBoilOffRateLHr, boilSizeL);
          finalTrubChillerLoss = testTrubLoss;
          found = true;
          break;
        }
      }
      
      // If still doesn't work, flag pre-boil volume as suspicious
      if (!found) {
        preBoilVolumeFlag = 'Pre-boil volume may be too low for target batch size';
        // Use default trub loss and recalculate what pre-boil should be
        finalTrubChillerLoss = TRUB_LOSS_DEFAULT;
        finalBoilOffRateLHr = BOIL_OFF_RATE_TYPICAL_L_HR;
        finalEvapRate = boilOffRateToPercentage(finalBoilOffRateLHr, boilSizeL);
        // Work backwards: batchSize + trubLoss - topUpWater = postBoil * (1 - thermal contraction)
        const requiredPostBoil = (batchSizeL + finalTrubChillerLoss - topUpWater) / (1 - THERMAL_CONTRACTION_DEFAULT);
        postBoilVolumeL = requiredPostBoil;
        evapLossL = boilSizeL - postBoilVolumeL;
      }
    }
  }
  
  // Final validation of boil-off rate
  const validator = new RecipeValidator();
  const finalValidation = validator.validateBoilOffRate(finalBoilOffRateLHr);
  if (finalValidation.warnings.length > 0 && !evapRateFlag) {
    evapRateFlag = finalValidation.warnings[0];
  }
  
  return {
    evapLossL,
    postBoilVolumeL,
    boilOffRateLHr: finalBoilOffRateLHr,
    evapRate: finalEvapRate,
    trubChillerLoss: finalTrubChillerLoss,
    evapRateFlag,
    trubLossFlag,
    preBoilVolumeFlag
  };
}

/**
 * Calculate evaporation loss with clean inputs from recipe processor
 * @param {Object} processedData - Clean input data from processRecipeForWaterCalculations
 * @returns {Object} Evaporation calculation results
 */
function calculateEvaporationLoss(processedData) {
  const { isNoBoil } = processedData;
  
  if (isNoBoil) {
    return handleNoBoilEvaporation(processedData);
  }
  
  return handleRegularBoilEvaporation(processedData);
}

/**
 * Validate evaporation calculation results
 * @param {Object} results - Evaporation calculation results
 * @returns {Object} Validation warnings and errors
 */
function validateEvaporationCalculation(results) {
  const warnings = [];
  const errors = [];
  
  // Validate boil-off rate
  if (results.boilOffRateLHr > 0) {
    const validator = new RecipeValidator();
    const boilOffValidation = validator.validateBoilOffRate(results.boilOffRateLHr);
    warnings.push(...boilOffValidation.warnings);
    errors.push(...boilOffValidation.errors);
  }
  
  // Validate post-boil volume
  if (results.postBoilVolumeL <= 0) {
    errors.push('Post-boil volume must be greater than 0');
  }
  
  // Validate trub loss
  if (results.trubChillerLoss < 0) {
    warnings.push('Negative trub/chiller loss calculated');
  }
  
  // Check for unreasonable evaporation loss
  if (results.evapLossL < 0) {
    errors.push('Negative evaporation loss calculated');
  }
  
  return { warnings, errors };
}

// Export safe wrappers for all calculation functions
const safeCalculateEvaporationLoss = (processedData) => 
    safeCalculation(() => calculateEvaporationLoss(processedData), {
        evapLossL: 0,
        postBoilVolumeL: 0,
        boilOffRateLHr: BOIL_OFF_RATE_TYPICAL_L_HR,
        evapRate: 0,
        trubChillerLoss: TRUB_LOSS_DEFAULT,
        evapRateFlag: null,
        trubLossFlag: null,
        preBoilVolumeFlag: null
    }, {
        calculator: 'evaporation',
        operation: 'evaporation_loss'
    });

const safeValidateEvaporationCalculation = (results) => 
    safeCalculation(() => validateEvaporationCalculation(results), {
        warnings: [],
        errors: ['Validation failed']
    }, {
        calculator: 'evaporation',
        operation: 'validate'
    });

export {
    safeCalculateEvaporationLoss as calculateEvaporationLoss,
    safeValidateEvaporationCalculation as validateEvaporationCalculation
};
