/**
 * Water Volume Calculator - Specialized Orchestrator Pattern
 * 
 * Simplified orchestration module for water volume calculations.
 * Coordinates between recipe processing, evaporation calculations, and volume flow.
 * Maintains backward compatibility with existing API.
 * 
 * ARCHITECTURAL PATTERN: Specialized Orchestrator
 * - Coordinates complex multi-step water volume calculations
 * - Throws CalculationError for structured error propagation to calling orchestrators
 * - Delegates to atomic calculators (evaporation, volume-flow, sparge)
 * - Focuses on water volume domain with comprehensive result building
 */

import { 
  QT_TO_L,
  L_TO_GAL, 
  KG_TO_LB, 
  GRAIN_DISPLACEMENT_RATE,
  BOIL_OFF_RATE_MIN_L_HR,
  BOIL_OFF_RATE_MAX_L_HR,
  BOIL_OFF_RATE_TYPICAL_L_HR,
  GRAIN_ABSORPTION_DEFAULT,
  GRAIN_ABSORPTION_ALLINONE,
  TRUB_LOSS_DEFAULT,
  FERMENTER_LOSS_DEFAULT,
  THERMAL_CONTRACTION_DEFAULT
} from '../core/constants.js';
import { formatVolume, formatWeight, formatFermentableWeight } from '../formatters/unit-formatter.js';
import { processRecipeForWaterCalculations } from '../utilities/data/water-calculation-preprocessor.js';
import { calculateEvaporationLoss } from './evaporation-calculator.js';
import { calculateVolumeFlow } from './volume-flow-calculator.js';
import { validateSpargeVolumeCalculation } from './sparge-calculator.js';
import { CalculationError } from '../utilities/errors/application-errors.js';

/**
 * Round volume for display consistency
 * @param {number} liters - Volume in liters
 * @returns {number} Rounded volume for display consistency
 */
function roundForDisplay(liters) {
  // Convert to gallons, round to 2 decimal places, then back to liters for calculations
  const gallons = liters * L_TO_GAL;
  const roundedGallons = Math.round(gallons * 100) / 100;
  return roundedGallons / L_TO_GAL;
}

/**
 * Calculate water requirements from processed data and evaporation results
 * @param {Object} processedData - Clean data from recipe processor
 * @param {Object} evaporationResults - Results from evaporation calculator
 * @returns {Object} Water requirements data
 */
function calculateWaterRequirements(processedData, evaporationResults) {
  const { 
    batchSizeL, 
    boilSizeL, 
    isNoBoil, 
    systemType, 
    grainData, 
    mashWaterData, 
    equipment 
  } = processedData;
  
  const { postBoilVolumeL, trubChillerLoss } = evaporationResults;
  
  // Use clean inputs from processed data
  let strikeWaterL = mashWaterData.strikeWaterL;
  let spargeWaterL = mashWaterData.spargeWaterL;
  let totalMashWaterL = mashWaterData.totalMashWaterL;
  
  // Target volume for calculations
  const targetVolumeForStrikeCalculation = isNoBoil ? postBoilVolumeL : boilSizeL;
  
  // For no-boil recipes, recalculate water requirements if needed
  if (isNoBoil && trubChillerLoss !== undefined && trubChillerLoss !== null) {
    // Work backwards from corrected Post-Mash Volume (no thermal expansion for no-boil)
    const requiredWaterL = postBoilVolumeL + grainData.grainAbsorptionL + equipment.lauterDeadspace - equipment.topUpKettle;
    if (systemType.isNoSparge || !processedData.spargeDetection.usesSparge) {
      strikeWaterL = requiredWaterL;
      spargeWaterL = 0;
    } else {
      // For sparge systems, split the water
      if (spargeWaterL > 0) {
        // Keep existing sparge volume
        strikeWaterL = requiredWaterL - spargeWaterL;
      } else {
        // Calculate reasonable split
        const reasonableStrikeRatio = 0.65;
        strikeWaterL = requiredWaterL * reasonableStrikeRatio;
        spargeWaterL = requiredWaterL - strikeWaterL;
      }
    }
    totalMashWaterL = strikeWaterL + spargeWaterL;
  } else if (!totalMashWaterL && !strikeWaterL) {
    // Calculate based on what data we have
    if (mashWaterData.hasWaterGrainRatio && grainData.totalGrainLbs > 0) {
      // Calculate forward from water-to-grain ratio
      const mashWaterQt = mashWaterData.waterGrainRatioQt * grainData.totalGrainLbs;
      const mashWaterL = mashWaterQt * QT_TO_L;
      strikeWaterL = mashWaterL + equipment.mashTunDeadspace;
      
      // Calculate additional water if needed
      const thermalExpansionFactor = isNoBoil ? 1.0 : 1.04;
      const volumeAtTargetTemp = (strikeWaterL + spargeWaterL - grainData.grainAbsorptionL - equipment.lauterDeadspace + equipment.topUpKettle) * thermalExpansionFactor;
      
      if (volumeAtTargetTemp < targetVolumeForStrikeCalculation) {
        // Need additional water
        const additionalWater = targetVolumeForStrikeCalculation - volumeAtTargetTemp;
        if (processedData.spargeDetection.usesSparge && !systemType.isNoSparge) {
          // Add to sparge
          spargeWaterL += additionalWater / thermalExpansionFactor;
        }
      }
      
      totalMashWaterL = strikeWaterL + spargeWaterL;
    } else {
      // Work backwards from target volume
      const thermalExpansionFactor = isNoBoil ? 1.0 : 1.04;
      const targetColdL = targetVolumeForStrikeCalculation / thermalExpansionFactor;
      const requiredWaterL = targetColdL + grainData.grainAbsorptionL + equipment.lauterDeadspace - equipment.topUpKettle;
      
      if (systemType.isNoSparge || !processedData.spargeDetection.usesSparge) {
        strikeWaterL = requiredWaterL;
        spargeWaterL = 0;
      } else {
        // For sparge systems, calculate needed sparge water
        if (spargeWaterL > 0) {
          // Keep existing sparge volume and adjust strike if needed
          strikeWaterL = requiredWaterL - spargeWaterL;
        } else if (strikeWaterL > 0) {
          // We have explicit strike water, calculate needed sparge
          spargeWaterL = Math.max(0, requiredWaterL - strikeWaterL);
        } else {
          // No explicit water volumes, calculate reasonable split
          const reasonableStrikeRatio = 0.65; // 65% strike, 35% sparge is typical
          strikeWaterL = requiredWaterL * reasonableStrikeRatio;
          spargeWaterL = requiredWaterL - strikeWaterL;
        }
      }
      
      totalMashWaterL = strikeWaterL + spargeWaterL;
    }
  } else {
    // Use existing values but check if sparge water needs to be calculated
    if (spargeWaterL === 0 && processedData.spargeDetection.usesSparge && !systemType.isNoSparge) {
      // We have strike water but no sparge water, yet sparge is needed - calculate it
      const thermalExpansionFactor = isNoBoil ? 1.0 : 1.04;
      const targetColdL = targetVolumeForStrikeCalculation / thermalExpansionFactor;
      const requiredWaterL = targetColdL + grainData.grainAbsorptionL + equipment.lauterDeadspace - equipment.topUpKettle;
      
      // Calculate needed sparge water
      spargeWaterL = Math.max(0, requiredWaterL - strikeWaterL);
    }
    
    // Ensure values are consistent
    totalMashWaterL = strikeWaterL + spargeWaterL;
  }

  // Calculate mash water (inside malt pipe)
  const mashWaterL = Math.max(0, strikeWaterL - equipment.mashTunDeadspace);
  
  // Calculate water-to-grain ratio
  let waterToGrainRatio = 0;
  if (grainData.totalGrainWeight > 0 && mashWaterL > 0) {
    const mashWaterGal = mashWaterL * L_TO_GAL;
    const mashWaterQt = mashWaterGal * 4;
    waterToGrainRatio = mashWaterQt / grainData.totalGrainLbs;
  }

  return {
    strikeWaterL,
    spargeWaterL,
    totalMashWaterL,
    mashWaterL,
    waterToGrainRatio,
    targetVolumeForStrikeCalculation
  };
}

/**
 * Estimate sparge volume with validation
 * @param {Object} processedData - Clean data from recipe processor
 * @param {Object} waterRequirements - Water requirements data
 * @returns {Object|null} Sparge estimation result
 */
function estimateSpargeVolumeWithValidation(processedData, waterRequirements) {
  const { spargeDetection, explicitSpargeVolume, isNoBoil, equipment } = processedData;
  const { strikeWaterL, targetVolumeForStrikeCalculation } = waterRequirements;

  let estimatedSpargeVolume = null;

  if (spargeDetection.usesSparge && !explicitSpargeVolume) {
    // Calculate sparge volume based on water balance
    const thermalExpansionFactor = isNoBoil ? 1.0 : 1.04;
    const targetColdL = targetVolumeForStrikeCalculation / thermalExpansionFactor;
    const volumeFromStrike = strikeWaterL - processedData.grainData.grainAbsorptionL - equipment.lauterDeadspace;
    const requiredSpargeL = targetColdL - volumeFromStrike - equipment.topUpKettle;
    
    // Create calculation object for validation
    const calculation = {
      targetPreBoilColdL: targetColdL,
      strikeWaterL: strikeWaterL,
      grainAbsorptionL: processedData.grainData.grainAbsorptionL,
      lauterDeadspaceL: equipment.lauterDeadspace,
      topUpKettleL: equipment.topUpKettle,
      volumeFromStrikeL: volumeFromStrike,
      requiredSpargeL: Math.max(0, requiredSpargeL)
    };
    
    // Validate the calculation
    const validation = validateSpargeVolumeCalculation(calculation);
    
    if (calculation.requiredSpargeL > 0) {
      estimatedSpargeVolume = {
        volume: calculation.requiredSpargeL,
        source: 'calculated_with_validation',
        calculation: calculation,
        validation: validation,
        formatted: formatVolume(calculation.requiredSpargeL)
      };
    } else {
      estimatedSpargeVolume = {
        volume: 0,
        source: 'calculated_none',
        reason: 'Strike water sufficient for target pre-boil volume',
        calculation: calculation,
        validation: validation
      };
    }
  } else if (!spargeDetection.usesSparge) {
    estimatedSpargeVolume = {
      volume: 0,
      source: 'no_sparge_system',
      reason: `System does not use sparge (${spargeDetection.method})`,
      validation: { warnings: [], errors: [] }
    };
  }

  return estimatedSpargeVolume;
}

/**
 * Build comprehensive result object from all calculation components
 * @param {Object} processedData - Clean data from recipe processor
 * @param {Object} evaporationResults - Results from evaporation calculator
 * @param {Object} waterRequirements - Water requirements data
 * @param {Object} volumeFlow - Volume flow calculation results
 * @param {Object} spargeEstimation - Sparge estimation result
 * @returns {Object} Complete water volume tracking result
 */
function buildVolumeTrackingResult(processedData, evaporationResults, waterRequirements, volumeFlow, spargeEstimation) {
  const { grainData, equipment, systemType, spargeDetection, mashWaterData } = processedData;
  
  // Calculate additional values with clean inputs
  const mashVolumeExclDeadspaceL = waterRequirements.mashWaterL + grainData.grainDisplacementL;
  const totalMashVolumeL = volumeFlow.calculatedStrikeWaterL + grainData.grainDisplacementL;
  const boilOffRatePerHour = processedData.isNoBoil ? 0 : evaporationResults.boilOffRateLHr;

  // Build sparge analysis with clean data
  const spargeAnalysis = {
    ...spargeDetection,
    volume: processedData.explicitSpargeVolume,
    estimatedVolume: spargeEstimation,
    actualSpargeVolumeL: volumeFlow.roundedSpargeWaterL,
    actualSpargeVolumeFormatted: formatVolume(volumeFlow.roundedSpargeWaterL),
    mashStepAnalysis: mashWaterData.mashStepAnalysis,
    grainAbsorptionRate: equipment.grainAbsorptionRate,
    grainAbsorptionRateFormatted: `${equipment.grainAbsorptionRate.toFixed(3)} qt/lb`,
    summary: `${spargeDetection.usesSparge ? 'Uses' : 'Does not use'} sparge (${spargeDetection.confidence} confidence via ${spargeDetection.method})`,
    validationWarnings: spargeEstimation?.validation?.warnings || [],
    validationErrors: spargeEstimation?.validation?.errors || []
  };

  // Build result using clean inputs from processed data and calculations
  const result = {
    // Source data flags
    preBoilVolumeFlag: evaporationResults.preBoilVolumeFlag,
    evapRateFlag: evaporationResults.evapRateFlag,
    trubLossFlag: evaporationResults.trubLossFlag,

    isNoBoil: processedData.isNoBoil,
    systemType: systemType,
    spargeAnalysis: spargeAnalysis,
    
    // Grain data (using clean inputs)
    totalGrainWeight: grainData.totalGrainWeight,
    totalGrainWeightFormatted: formatFermentableWeight(grainData.totalGrainWeight),
    grainDisplacementFormatted: formatVolume(grainData.grainDisplacementL),
    
    // Water volumes (using flow-consistent rounded values)
    strikeWaterFormatted: formatVolume(volumeFlow.calculatedStrikeWaterL),
    spargeWater: volumeFlow.roundedSpargeWaterL,
    spargeWaterFormatted: formatVolume(volumeFlow.roundedSpargeWaterL),
    totalMashWaterFormatted: formatVolume(volumeFlow.calculatedTotalMashWaterL),
    mashWaterFormatted: formatVolume(volumeFlow.roundedMashWaterL),
    mashTunDeadspaceFormatted: formatVolume(volumeFlow.roundedMashTunDeadspace),
    
    // Top up volumes (rounded)
    topUpKettleFormatted: formatVolume(volumeFlow.roundedTopUpKettle),
    topUpWaterFormatted: formatVolume(volumeFlow.roundedTopUpWater),
    
    // Grain absorption (rounded)
    grainAbsorptionFormatted: formatVolume(volumeFlow.roundedGrainAbsorptionL),
    grainAbsorptionRateFormatted: `${equipment.grainAbsorptionRate.toFixed(3)} qt/lb`,
    waterToGrainRatio: waterRequirements.waterToGrainRatio,
    waterToGrainRatioFormatted: waterRequirements.waterToGrainRatio > 0 ? `${waterRequirements.waterToGrainRatio.toFixed(2)} qt/lb` : '—',

    // Thermal expansion/contraction (rounded)
    thermalExpansionFormatted: formatVolume(volumeFlow.thermalEffects.thermalExpansion),
    thermalContractionFormatted: formatVolume(volumeFlow.thermalEffects.thermalContraction),
    
    // Mash volumes
    mashVolumeExclDeadspaceL: mashVolumeExclDeadspaceL,
    mashVolumeExclDeadspaceFormatted: formatVolume(mashVolumeExclDeadspaceL),
    totalMashVolumeL: totalMashVolumeL,
    totalMashVolumeFormatted: formatVolume(totalMashVolumeL),
    
    // Volume tracking through process (using flow-consistent values)
    volumePostMashNoBoilFormatted: processedData.isNoBoil ? formatVolume(volumeFlow.calculatedPostBoilVolume) : null,
    volumePreBoilColdFormatted: formatVolume(processedData.isNoBoil ? volumeFlow.volumePreBoil : roundForDisplay(volumeFlow.volumePreBoil - volumeFlow.thermalEffects.thermalExpansion)),
    volumePreBoilHotFormatted: formatVolume(volumeFlow.volumePreBoil),
    volumePreBoilFormatted: formatVolume(volumeFlow.volumePreBoil),
    volumePreBoilNote: '(hot)',
    volumePostBoilFormatted: formatVolume(volumeFlow.calculatedPostBoilVolume),
    volumePostBoilNote: '(hot)',
    volumeToFermenterFormatted: formatVolume(volumeFlow.volumeToFermenter),
    volumePackagingFormatted: formatVolume(volumeFlow.volumePackaging),
    
    // Losses (rounded and potentially adjusted for flow consistency)
    lauterDeadspace: volumeFlow.roundedLauterDeadspace,
    lauterDeadspaceFormatted: formatVolume(volumeFlow.roundedLauterDeadspace),
    evaporationLossFormatted: formatVolume(volumeFlow.roundedEvapLossL),
    trubChillerLoss: volumeFlow.adjustedTrubChillerLoss,
    trubChillerLossFormatted: formatVolume(volumeFlow.adjustedTrubChillerLoss),
    
    // Rates
    boilOffRateWithPercentFormatted: formatVolume(boilOffRatePerHour) + `/hr (${evaporationResults.evapRate.toFixed(1)}%)`,
    
    // Equipment info (using clean inputs)
    equipment: {
      name: processedData.originalEquipment.name || 'Unknown',
      lauterDeadspace: equipment.lauterDeadspace,
      trubChillerLoss: evaporationResults.trubChillerLoss,
      topUpKettle: equipment.topUpKettle,
      topUpWater: equipment.topUpWater,
      mashTunDeadspace: equipment.mashTunDeadspace,
      boilOffRateLHr: evaporationResults.boilOffRateLHr,
      evapRate: evaporationResults.evapRate
    }
  };
  
  return result;
}

/**
 * Calculate comprehensive water volume tracking through the brewing process
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {Object} Water volume tracking results
 * @precondition recipeData.ingredients.fermentables is valid array with valid amount
 * @precondition recipeData.batchSize and recipeData.boilSize are valid numbers > 0 if present
 * @precondition recipeData.equipment is valid object or undefined
 */
export function calculateWaterVolumeTracking(recipeData) {
  try {
    // Step 1: Process recipe into clean data
    const processedData = processRecipeForWaterCalculations(recipeData);
  
  // Step 2: Calculate evaporation with clean inputs
  const evaporationResults = calculateEvaporationLoss(processedData);
  
  // Step 3: Calculate water requirements
  const waterRequirements = calculateWaterRequirements(processedData, evaporationResults);
  
  // Step 4: Calculate volume flow
  const volumeFlow = calculateVolumeFlow({
    strikeWaterL: waterRequirements.strikeWaterL,
    spargeWaterL: waterRequirements.spargeWaterL,
    mashTunDeadspace: processedData.equipment.mashTunDeadspace,
    grainAbsorptionL: processedData.grainData.grainAbsorptionL,
    topUpKettle: processedData.equipment.topUpKettle,
    topUpWater: processedData.equipment.topUpWater,
    boilSizeL: processedData.boilSizeL,
    postBoilVolumeL: evaporationResults.postBoilVolumeL,
    evapLossL: evaporationResults.evapLossL,
    trubChillerLoss: evaporationResults.trubChillerLoss,
    fermenterLoss: processedData.equipment.fermenterLoss,
    batchSizeL: processedData.batchSizeL,
    isNoBoil: processedData.isNoBoil,
    lauterDeadspace: processedData.equipment.lauterDeadspace
  });
  
  // Step 5: Estimate sparge volumes if needed
  const spargeEstimation = estimateSpargeVolumeWithValidation(processedData, waterRequirements);
  
  // Step 6: Build comprehensive result object
  return buildVolumeTrackingResult(processedData, evaporationResults, waterRequirements, volumeFlow, spargeEstimation);
  } catch (error) {
    // Re-throw CalculationError instances as-is
    if (error instanceof CalculationError) {
      throw error;
    }
    // Handle calculation errors gracefully
    throw new CalculationError(`Water volume calculation failed: ${error.message}`, {
      userMessage: 'Unable to calculate water volumes for this recipe. Please check the recipe data.',
      details: { 
        calculator: 'water-volume', 
        originalError: error.message,
        recipeContext: {
          recipeName: recipeData?.name || 'Unknown Recipe',
          batchSize: recipeData?.batchSize,
          boilTime: recipeData?.boilTime,
          type: recipeData?.type
        },
        calculationInputs: {
          hasEquipment: !!(recipeData?.equipment),
          hasFermentables: !!(recipeData?.ingredients?.fermentables?.length),
          fermentableCount: recipeData?.ingredients?.fermentables?.length || 0,
          equipmentData: recipeData?.equipment ? {
            mashTunDeadspace: recipeData.equipment.mashTunDeadspace,
            boilOffRate: recipeData.equipment.boilOffRate,
            evapRate: recipeData.equipment.evapRate
          } : null
        },
        remediation: 'Verify equipment settings and fermentable amounts are properly specified'
      }
    });
  }
}

