/**
 * Sparge Calculator - Atomic Calculator Pattern
 * 
 * Handles sparge detection and analysis logic including:
 * - Enhanced sparge detection with conflict resolution
 * - Sparge water volume extraction from mash steps
 * - Grain absorption rate calculations
 * - Sparge volume validation
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific sparge calculations
 */

import { 
  L_TO_GAL, 
  KG_TO_LB, 
  QT_TO_L,
  GRAIN_ABSORPTION_DEFAULT,
  GRAIN_ABSORPTION_ALLINONE,
  GRAIN_DISPLACEMENT_RATE,
  SPARGE_THRESHOLD_L,
  EXCESS_WATER_THRESHOLD_L,
  MAX_SPARGE_RATIO,
  MIN_STRIKE_RATIO,
  MAX_STRIKE_RATIO,
  BATCH_SIZE_TOLERANCE_PERCENT
} from '../core/constants.js';
import { safeCalculation } from '../utilities/errors/error-utils.js';
import { RecipeValidator } from '../core/recipe-validator.js';

/**
 * Analyze volume balance to determine if sparge is needed
 * @param {Object} recipe - Recipe data
 * @returns {Object|null} Volume balance analysis result
 */
function analyzeVolumeBalance(recipe) {
  // Must have basic volume data
  if (!recipe.batchSize || !recipe.boilSize || !recipe.ingredients?.fermentables) {
    return null;
  }

  // Skip volume balance analysis for extract and partial mash recipes - extract additions make up the volume difference
  if (recipe.type) {
    const recipeType = recipe.type.toLowerCase();
    if (recipeType === 'extract' || recipeType.includes('extract') || 
        recipeType === 'partial mash' || recipeType.includes('partial mash')) {
      return null;
    }
  }

  // Get strike water from mash steps
  let strikeWaterL = 0;
  if (recipe.mash?.steps) {
    for (const step of recipe.mash.steps) {
      if (step.infuseAmount && step.infuseAmount > 0) {
        strikeWaterL = step.infuseAmount;
        break; // Only count first infusion as strike water
      }
    }
  }

  // If no strike water found, can't analyze
  if (strikeWaterL <= 0) {
    return null;
  }

  // Calculate grain data for absorption estimation
  let totalGrainWeight = 0;
  
  recipe.ingredients.fermentables.forEach(f => {
    if (f.type) {
      const type = f.type.toLowerCase();
      // Include only solid fermentables that absorb water
      if (type === 'grain' || type === 'adjunct' || type === 'specialty' ||
          type === 'base malt' || type === 'specialty malt' ||
          type.includes('malt') || type.includes('grain')) {
        totalGrainWeight += f.amount;
      }
    }
  });

  const totalGrainLbs = totalGrainWeight * KG_TO_LB;
  
  // Estimate grain absorption
  const grainAbsorptionQt = totalGrainLbs * GRAIN_ABSORPTION_DEFAULT;
  const grainAbsorptionL = grainAbsorptionQt * QT_TO_L;
  
  // Estimate equipment losses (conservative estimates)
  const estimatedLauterLoss = 0.5; // L - equipment-specific, not extracted
  const estimatedTopUpKettle = 0; // L
  
  // Calculate volume available from strike water
  const volumeFromStrikeL = strikeWaterL - grainAbsorptionL - estimatedLauterLoss + estimatedTopUpKettle;
  
  // Account for thermal expansion (4% for hot wort)
  const volumeFromStrikeHotL = volumeFromStrikeL * 1.04;
  
  // Compare to target pre-boil volume
  const targetPreBoilL = recipe.boilSize;
  const shortfallL = targetPreBoilL - volumeFromStrikeHotL;
  
  // Determine if sparge is needed based on volume balance
  
  if (shortfallL > SPARGE_THRESHOLD_L) {
    return {
      usesSparge: true,
      confidence: 'high',
      source: 'volume_balance_deficit',
      analysis: {
        strikeWaterL,
        volumeFromStrikeL: volumeFromStrikeHotL,
        targetPreBoilL,
        shortfallL,
        estimatedSpargeNeededL: shortfallL
      }
    };
  } else if (shortfallL < -EXCESS_WATER_THRESHOLD_L) {
    // Significant excess water indicates no-sparge
    return {
      usesSparge: false,
      confidence: 'high',
      source: 'volume_balance_excess',
      analysis: {
        strikeWaterL,
        volumeFromStrikeL: volumeFromStrikeHotL,
        targetPreBoilL,
        excessL: Math.abs(shortfallL)
      }
    };
  } else {
    // Close balance - uncertain
    return {
      usesSparge: shortfallL > 0,
      confidence: 'medium',
      source: 'volume_balance_marginal',
      analysis: {
        strikeWaterL,
        volumeFromStrikeL: volumeFromStrikeHotL,
        targetPreBoilL,
        differenceL: shortfallL
      }
    };
  }
}

/**
 * Enhanced sparge detection with volume-based analysis
 * @param {Object} recipe - Parsed recipe object
 * @returns {Object} Sparge detection result with confidence level
 */
function detectSpargeUsage(recipe) {
  // Handle null or invalid recipe
  if (!recipe || typeof recipe !== 'object') {
    return {
      usesSparge: false,
      confidence: 'unknown',
      method: 'invalid_recipe',
      conflicts: [],
      evidence: ['Invalid recipe data'],
      details: ['No valid recipe provided']
    };
  }

  const indicators = {
    explicit: null,      // BeerJSON explicit sparge step
    equipment: null,     // Equipment profile indication  
    temperature: null,   // BeerXML sparge temp present
    recipeType: null,    // Recipe type inference
    volumeBalance: null  // Volume balance analysis
  };

  // Check for explicit BeerJSON sparge step
  if (recipe.mash?.steps) {
    const spargeStep = recipe.mash.steps.find(step => 
      step && step.type && step.type.toLowerCase() === 'sparge'
    );
    if (spargeStep) {
      indicators.explicit = { usesSparge: true, confidence: 'high', source: 'beerjson_step' };
    }
  }

  // Check equipment profile
  const equipmentName = recipe.equipment?.name?.toLowerCase() || '';
  if (equipmentName.includes('no sparge') || equipmentName.includes('biab')) {
    indicators.equipment = { usesSparge: false, confidence: 'high', source: 'equipment_profile' };
  } else if (equipmentName.includes('all in one') || equipmentName.includes('grainfather') || 
             equipmentName.includes('foundry') || equipmentName.includes('brewzilla')) {
    // All-in-one systems often use no-sparge or modified sparge
    indicators.equipment = { usesSparge: false, confidence: 'medium', source: 'equipment_allinone' };
  }

  // Check for sparge temperature in BeerXML
  if (recipe.mash?.spargeTemp && recipe.mash.spargeTemp > 0) {
    indicators.temperature = { usesSparge: true, confidence: 'medium', source: 'sparge_temp' };
  }

  // Check recipe type
  if (recipe.type) {
    const recipeType = recipe.type.toLowerCase();
    if (recipeType === 'extract' || recipeType.includes('extract')) {
      indicators.recipeType = { usesSparge: false, confidence: 'medium', source: 'extract_recipe' };
    } else if (recipeType.includes('partial mash')) {
      indicators.recipeType = { usesSparge: false, confidence: 'low', source: 'partial_mash' };
    } else if (recipeType.includes('all grain')) {
      indicators.recipeType = { usesSparge: true, confidence: 'low', source: 'allgrain_default' };
    }
  }

  // Volume balance analysis - most reliable indicator
  const volumeAnalysis = analyzeVolumeBalance(recipe);
  if (volumeAnalysis) {
    indicators.volumeBalance = volumeAnalysis;
  }

  // Resolve conflicts with priority order
  const conflicts = [];
  const evidence = [];

  // Priority order: explicit > equipment > volumeBalance > temperature > recipe type
  const priorityOrder = ['explicit', 'equipment', 'volumeBalance', 'temperature', 'recipeType'];
  
  let finalDecision = null;
  
  for (const source of priorityOrder) {
    const indicator = indicators[source];
    if (indicator) {
      evidence.push(`${source}: ${indicator.usesSparge ? 'uses' : 'no'} sparge (${indicator.confidence})`);
      
      if (!finalDecision) {
        finalDecision = indicator;
      } else if (finalDecision.usesSparge !== indicator.usesSparge) {
        conflicts.push(`${source} conflicts with previous decision`);
      }
    }
  }

  // Default if no indicators
  if (!finalDecision) {
    finalDecision = {
      usesSparge: false,
      confidence: 'unknown',
      source: 'no_data'
    };
    evidence.push('No sparge indicators found');
  }

  return {
    usesSparge: finalDecision.usesSparge,
    confidence: finalDecision.confidence,
    method: finalDecision.source,
    conflicts: conflicts,
    evidence: evidence,
    details: conflicts.length > 0 ? 
      [`⚠️ Conflicts detected: ${conflicts.join(', ')}`] : 
      [`Decision based on: ${finalDecision.source}`]
  };
}

/**
 * Gets sparge water volume if available (supports both BeerJSON and BeerXML)
 * @param {Object} recipe - Parsed recipe object
 * @returns {Object|null} Sparge volume info or null if not available
 */
function getSpargeVolume(recipe) {
  // Handle null or invalid recipe
  if (!recipe || typeof recipe !== 'object') {
    return null;
  }

  // Look for sparge step with volume (check both BeerJSON and BeerXML fields)
  if (recipe.mash?.steps) {
    const spargeStep = recipe.mash.steps.find(step => {
      if (step.type && step.type.toLowerCase() === 'sparge') {
        // Check both BeerJSON (amount) and BeerXML (infuseAmount) fields
        return step.amount || step.infuseAmount;
      }
      return false;
    });
    
    if (spargeStep) {
      return {
        volume: spargeStep.amount || spargeStep.infuseAmount,
        source: spargeStep.amount ? 'beerjson_step' : 'beerxml_step',
        step: spargeStep.name || 'Sparge'
      };
    }
  }

  return null;
}

/**
 * Enhanced mash step analysis for sparge water detection (fixed double-counting)
 * @param {Array} mashSteps - Array of mash steps
 * @param {Object} spargeDetection - Sparge detection result
 * @returns {Object} Analyzed water volumes and step classifications
 */
function extractSpargeWaterFromMashSteps(mashSteps, spargeDetection) {
  let strikeWaterL = 0;
  let spargeWaterL = 0;
  let totalMashWaterL = 0;
  const stepAnalysis = [];

  if (!mashSteps || !Array.isArray(mashSteps)) {
    return { strikeWaterL, spargeWaterL, totalMashWaterL, stepAnalysis };
  }

  // First pass: identify and classify all steps
  mashSteps.forEach((step, index) => {
    if (!step) return;
    const stepInfo = {
      index,
      name: step.name || `Step ${index + 1}`,
      type: step.type || 'unknown',
      infuseAmount: step.infuseAmount || 0,
      classification: 'unknown'
    };

    if (step.infuseAmount && step.infuseAmount > 0) {
      totalMashWaterL += step.infuseAmount;

      // Classification logic
      if (step.type && step.type.toLowerCase() === 'sparge') {
        // Explicit BeerJSON sparge step
        stepInfo.classification = 'sparge_water';
      } else if (step.name && step.name.toLowerCase().includes('sparge')) {
        // BeerXML name-based sparge detection
        stepInfo.classification = 'sparge_water_byname';
      } else if (index === 0) {
        // First step is always strike water
        stepInfo.classification = 'strike_water';
      } else if (step.type && ['temperature', 'infusion'].includes(step.type.toLowerCase())) {
        // Could be mash step or additional water depending on system
        if (spargeDetection.usesSparge) {
          // Traditional system - likely a mash step (protein rest, mash out, etc.)
          stepInfo.classification = 'mash_step';
        } else {
          // No-sparge system - additional water goes to strike
          stepInfo.classification = 'additional_strike';
        }
      } else if (step.type && step.type.toLowerCase() === 'decoction') {
        // Decoction step - no additional water
        stepInfo.classification = 'decoction';
      } else {
        stepInfo.classification = 'unknown_infusion';
      }
    } else {
      // Steps without water (temperature ramps, decoctions without infusion)
      if (step.type && step.type.toLowerCase() === 'decoction') {
        stepInfo.classification = 'decoction';
      } else if (step.type && step.type.toLowerCase() === 'temperature') {
        stepInfo.classification = 'temperature_ramp';
      }
    }

    stepAnalysis.push(stepInfo);
  });

  // Second pass: calculate water volumes based on classifications (prevents double-counting)
  stepAnalysis.forEach(stepInfo => {
    if (stepInfo.infuseAmount > 0) {
      switch (stepInfo.classification) {
        case 'strike_water':
        case 'additional_strike':
          strikeWaterL += stepInfo.infuseAmount;
          break;
        case 'sparge_water':
        case 'sparge_water_byname':
          spargeWaterL += stepInfo.infuseAmount;
          break;
        case 'mash_step':
          // For traditional systems, additional mash water is treated as sparge
          if (spargeDetection.usesSparge) {
            spargeWaterL += stepInfo.infuseAmount;
            stepInfo.classification = 'sparge_water_inferred';
          } else {
            // This shouldn't happen due to first pass logic, but safety check
            strikeWaterL += stepInfo.infuseAmount;
            stepInfo.classification = 'additional_strike';
          }
          break;
        case 'unknown_infusion':
          // Default to sparge if system uses sparge, otherwise strike
          if (spargeDetection.usesSparge) {
            spargeWaterL += stepInfo.infuseAmount;
            stepInfo.classification = 'sparge_water_unknown';
          } else {
            strikeWaterL += stepInfo.infuseAmount;
            stepInfo.classification = 'additional_strike';
          }
          break;
      }
    }
  });

  return { strikeWaterL, spargeWaterL, totalMashWaterL, stepAnalysis };
}

/**
 * Calculate grain absorption rate based on system type
 * @param {string} equipmentName - Equipment name
 * @param {Object} spargeDetection - Sparge detection result
 * @returns {number} Grain absorption rate in qt/lb
 */
function getGrainAbsorptionRate(equipmentName, spargeDetection) {
  const name = (equipmentName || '').toLowerCase();
  
  // BIAB and no-sparge systems have higher absorption
  if (name.includes('biab') || name.includes('no sparge') || !spargeDetection.usesSparge) {
    return GRAIN_ABSORPTION_ALLINONE; // 0.325 qt/lb
  }
  
  // All-in-one systems
  if (name.includes('foundry') || name.includes('grainfather') || 
      name.includes('brewzilla') || name.includes('all in one')) {
    return GRAIN_ABSORPTION_ALLINONE; // 0.325 qt/lb
  }
  
  // Traditional systems
  return GRAIN_ABSORPTION_DEFAULT; // 0.125 qt/lb
}

/**
 * Get description of grain absorption system type for display
 * @param {string} equipmentName - Equipment name
 * @param {Object} spargeDetection - Sparge detection result
 * @returns {string} System type description
 */
function getGrainAbsorptionSystemType(equipmentName, spargeDetection) {
  const name = (equipmentName || '').toLowerCase();
  
  if (name.includes('biab')) return 'BIAB System';
  if (name.includes('no sparge')) return 'No-Sparge System';
  if (!spargeDetection.usesSparge) return 'No-Sparge (detected)';
  if (name.includes('foundry') || name.includes('grainfather') || 
      name.includes('brewzilla') || name.includes('all in one')) {
    return 'All-in-One System';
  }
  return 'Traditional System';
}

/**
 * Validate sparge volume calculations for consistency (with batch-size-relative tolerances)
 * Uses RecipeValidator for consolidated validation logic
 * @param {Object} calculation - Sparge volume calculation data
 * @returns {Object} Validation warnings and errors
 */
function validateSpargeVolumeCalculation(calculation) {
  const validator = new RecipeValidator();
  
  // Create inputs object for unified validator
  const spargeInputs = {
    batchSizeL: calculation.targetPreBoilColdL,
    boilSizeL: calculation.targetPreBoilColdL,
    mashWaterData: {
      strikeWaterL: calculation.strikeWaterL,
      spargeWaterL: calculation.requiredSpargeL,
      totalMashWaterL: calculation.strikeWaterL + calculation.requiredSpargeL
    },
    spargeDetection: {
      usesSparge: calculation.requiredSpargeL > 0
    },
    equipment: {
      topUpKettle: calculation.topUpKettleL || 0
    }
  };
  
  // Use unified validator for water calculation validation
  const validationResult = validator.validateWaterCalculationInputs(spargeInputs);
  
  // Additional sparge-specific validation
  const additionalWarnings = [];
  const additionalErrors = [];
  
  // Check for negative sparge volume (specific to sparge calculations)
  if (calculation.requiredSpargeL < 0) {
    additionalWarnings.push(`Calculated sparge volume is negative (${calculation.requiredSpargeL.toFixed(2)}L) - strike water may be sufficient`);
    calculation.requiredSpargeL = 0;
  }
  
  // Check for water balance with relative tolerance
  const batchSizeTolerance = Math.max(0.1, calculation.targetPreBoilColdL * BATCH_SIZE_TOLERANCE_PERCENT);
  const totalWaterOut = calculation.volumeFromStrikeL + calculation.requiredSpargeL + (calculation.topUpKettleL || 0);
  const expectedOut = calculation.targetPreBoilColdL;
  const waterBalanceError = Math.abs(totalWaterOut - expectedOut);
  
  if (waterBalanceError > batchSizeTolerance) {
    const errorPercent = (waterBalanceError / expectedOut * 100).toFixed(1);
    additionalErrors.push(`Water balance error: ${waterBalanceError.toFixed(2)}L (${errorPercent}%) difference between calculated and target volumes`);
  }
  
  return { 
    warnings: [...validationResult.warnings, ...additionalWarnings], 
    errors: [...validationResult.errors, ...additionalErrors] 
  };
}

// Export safe wrappers for all calculation functions
const safeDetectSpargeUsage = (recipe) => 
    safeCalculation(() => detectSpargeUsage(recipe), {
        usesSparge: false,
        confidence: 'low',
        reason: 'Analysis failed',
        indicators: {
            explicit: null,
            equipment: null,
            temperature: null,
            volume: null,
            terminology: null,
            spargeStepData: null
        },
        conflictResolution: null
    }, {
        calculator: 'sparge',
        operation: 'detect_usage'
    });

const safeGetSpargeVolume = (recipe) => 
    safeCalculation(() => getSpargeVolume(recipe), null, {
        calculator: 'sparge',
        operation: 'get_volume'
    });

const safeExtractSpargeWaterFromMashSteps = (mashSteps, spargeDetection) => 
    safeCalculation(() => extractSpargeWaterFromMashSteps(mashSteps, spargeDetection), {
        strikeWaterL: 0,
        spargeWaterL: 0,
        totalMashWaterL: 0,
        stepAnalysis: [],
        hasExplicitSpargeVolume: false,
        spargeStepCount: 0
    }, {
        calculator: 'sparge',
        operation: 'extract_water'
    });

const safeGetGrainAbsorptionRate = (equipmentName, spargeDetection) => 
    safeCalculation(() => getGrainAbsorptionRate(equipmentName, spargeDetection), GRAIN_ABSORPTION_DEFAULT, {
        calculator: 'sparge',
        operation: 'grain_absorption_rate'
    });

const safeGetGrainAbsorptionSystemType = (equipmentName, spargeDetection) => 
    safeCalculation(() => getGrainAbsorptionSystemType(equipmentName, spargeDetection), 'Unknown System', {
        calculator: 'sparge',
        operation: 'system_type'
    });

const safeValidateSpargeVolumeCalculation = (calculation) => 
    safeCalculation(() => validateSpargeVolumeCalculation(calculation), {
        warnings: [],
        errors: ['Validation failed']
    }, {
        calculator: 'sparge',
        operation: 'validate'
    });

export {
    safeDetectSpargeUsage as detectSpargeUsage,
    safeGetSpargeVolume as getSpargeVolume,
    safeExtractSpargeWaterFromMashSteps as extractSpargeWaterFromMashSteps,
    safeGetGrainAbsorptionRate as getGrainAbsorptionRate,
    safeGetGrainAbsorptionSystemType as getGrainAbsorptionSystemType,
    safeValidateSpargeVolumeCalculation as validateSpargeVolumeCalculation
};
