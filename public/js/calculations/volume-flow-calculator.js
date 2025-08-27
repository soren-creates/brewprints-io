/**
 * Volume Flow Calculator - Atomic Calculator Pattern
 * 
 * Handles volume flow calculations through the brewing process including:
 * - Step-by-step volume tracking
 * - Thermal expansion/contraction calculations
 * - Volume balance validation
 * - Display consistency rounding
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific volume flow calculations
 */

import { 
  L_TO_GAL, 
  THERMAL_CONTRACTION_DEFAULT,
  VOLUME_TOLERANCE_L,
  THERMAL_EXPANSION_WARNING_THRESHOLD
} from '../core/constants.js';
import { formatVolume } from '../formatters/unit-formatter.js';
import { safeCalculation } from '../utilities/errors/error-utils.js';

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
 * Calculate thermal expansion/contraction effects
 * @param {Object} volumeData - Volume data object
 * @param {boolean} isNoBoil - Whether this is a no-boil recipe
 * @returns {Object} Thermal effects data
 */
function calculateThermalEffects(volumeData, isNoBoil) {
  let thermalExpansion = 0;
  let thermalContraction = 0;
  
  if (!isNoBoil) {
    // Calculate thermal expansion based on volume into kettle
    thermalExpansion = roundForDisplay(volumeData.volumeIntoKettle * THERMAL_CONTRACTION_DEFAULT);
    
    // Calculate thermal contraction based on post-boil volume
    thermalContraction = roundForDisplay(volumeData.postBoilVolumeL * THERMAL_CONTRACTION_DEFAULT);
  }
  
  return {
    thermalExpansion,
    thermalContraction,
    thermalExpansionL: thermalExpansion,
    thermalContractionL: thermalContraction,
    thermalExpansionFormatted: formatVolume(thermalExpansion),
    thermalContractionFormatted: formatVolume(thermalContraction)
  };
}

/**
 * Calculate comprehensive volume flow through the brewing process
 * @param {Object} calculationData - Pre-validated calculation data with water requirements
 * @returns {Object} Complete volume flow tracking results
 * @precondition calculationData contains valid water requirements from water calculator
 * @precondition calculationData.grainData has valid grain weight and absorption data
 * @precondition calculationData.equipment has valid equipment parameters
 */
function calculateVolumeFlow(calculationData) {
  const {
    strikeWaterL,
    spargeWaterL,
    mashTunDeadspace,
    grainAbsorptionL,
    topUpKettle,
    topUpWater,
    boilSizeL,
    postBoilVolumeL,
    evapLossL,
    trubChillerLoss,
    fermenterLoss,
    batchSizeL,
    isNoBoil,
    lauterDeadspace = 0  // Add lauterDeadspace parameter
  } = calculationData;

  // ======= VOLUME FLOW CALCULATIONS WITH DISPLAY CONSISTENCY =======
  // Track volumes through the process, accounting for thermal expansion
  // Round intermediate calculations to match display precision (2 decimal places in gallons)

  // Calculate the volume flow step by step, rounding each step for display consistency
  
  // Step 1: Mash Water (cold) + Mash Tun Deadspace = Strike Water (cold)
  const roundedMashWaterL = roundForDisplay(Math.max(0, strikeWaterL - mashTunDeadspace));
  const roundedMashTunDeadspace = roundForDisplay(mashTunDeadspace);
  const calculatedStrikeWaterL = roundForDisplay(roundedMashWaterL + roundedMashTunDeadspace);
  
  // Step 2: Strike Water (cold) + Sparge Water = Total Water
  const roundedSpargeWaterL = roundForDisplay(spargeWaterL);
  const calculatedTotalMashWaterL = roundForDisplay(calculatedStrikeWaterL + roundedSpargeWaterL);
  
  // Step 3: Total Water - Grain Absorption + Top-Up Kettle = Volume into Kettle
  const roundedGrainAbsorptionL = roundForDisplay(grainAbsorptionL);
  const roundedTopUpKettle = roundForDisplay(topUpKettle);
  const volumeIntoKettle = roundForDisplay(calculatedTotalMashWaterL - roundedGrainAbsorptionL + roundedTopUpKettle);
  
  // Step 4: Volume into Kettle + Thermal Expansion = Pre-Boil Volume (for regular boil)
  let volumePreBoil = boilSizeL;
  const thermalEffects = calculateThermalEffects({ volumeIntoKettle, postBoilVolumeL }, isNoBoil);
  
  if (isNoBoil) {
    // No thermal expansion/contraction for no-boil recipes
    volumePreBoil = volumeIntoKettle; // Pre-boil volume is same as into kettle for no-boil
  } else {
    // Calculate thermal expansion based on volume into kettle
    const calculatedPreBoilVolume = roundForDisplay(volumeIntoKettle + thermalEffects.thermalExpansion);
    
    // Use the calculated pre-boil volume for consistency in the flow
    volumePreBoil = calculatedPreBoilVolume;
  }
  
  // Step 5: Pre-Boil Volume - Boil-Off Loss = Post-Boil Volume (for regular boil)
  const roundedEvapLossL = roundForDisplay(evapLossL);
  let calculatedPostBoilVolume = postBoilVolumeL;
  
  if (!isNoBoil) {
    calculatedPostBoilVolume = roundForDisplay(volumePreBoil - roundedEvapLossL);
    // Update thermal contraction based on the consistent post-boil volume
    thermalEffects.thermalContraction = roundForDisplay(calculatedPostBoilVolume * THERMAL_CONTRACTION_DEFAULT);
    thermalEffects.thermalContractionL = thermalEffects.thermalContraction;
    thermalEffects.thermalContractionFormatted = formatVolume(thermalEffects.thermalContraction);
  }
  
  // Step 6: Post-Boil Volume - Thermal Contraction - Trub/Chiller Loss + Top-Up Fermenter = Into Fermenter
  const roundedTrubChillerLoss = roundForDisplay(trubChillerLoss);
  const roundedTopUpWater = roundForDisplay(topUpWater);
  
  const volumeAfterCooling = isNoBoil ? calculatedPostBoilVolume : roundForDisplay(calculatedPostBoilVolume - thermalEffects.thermalContraction);
  
  // IMPORTANT: Ensure the final fermenter volume matches the target batch size exactly
  // Calculate what the fermenter volume would be with current flow
  const calculatedVolumeToFermenter = roundForDisplay(volumeAfterCooling - roundedTrubChillerLoss + roundedTopUpWater);
  
  // Check if it matches the target batch size (within rounding tolerance)
  const targetBatchSizeRounded = roundForDisplay(batchSizeL);
  const volumeDifference = Math.abs(calculatedVolumeToFermenter - targetBatchSizeRounded);
  
  let volumeToFermenter;
  let adjustedTrubChillerLoss = roundedTrubChillerLoss;
  
  if (volumeDifference > VOLUME_TOLERANCE_L) { // More than tiny rounding difference
    // Force the fermenter volume to match target by adjusting trub/chiller loss
    const requiredTrubChillerLoss = volumeAfterCooling + roundedTopUpWater - targetBatchSizeRounded;
    adjustedTrubChillerLoss = roundForDisplay(requiredTrubChillerLoss);
    volumeToFermenter = targetBatchSizeRounded;
  } else {
    // Use calculated value if it's already very close
    volumeToFermenter = calculatedVolumeToFermenter;
  }
  
  // Step 7: Into Fermenter - Fermenter Loss = Final Package Volume
  const volumePackaging = roundForDisplay(volumeToFermenter - fermenterLoss);

  // Volume after mash calculation (for reference, not part of main flow)
  const volumePostMash = roundForDisplay(calculatedTotalMashWaterL - roundedGrainAbsorptionL);

  return {
    // Rounded values used in flow
    roundedMashWaterL,
    roundedMashTunDeadspace,
    roundedSpargeWaterL,
    roundedGrainAbsorptionL,
    roundedTopUpKettle,
    roundedTopUpWater,
    roundedEvapLossL,
    adjustedTrubChillerLoss,
    roundedLauterDeadspace: roundForDisplay(lauterDeadspace),
    
    // Calculated flow volumes
    calculatedStrikeWaterL,
    calculatedTotalMashWaterL,
    volumeIntoKettle,
    volumePreBoil,
    calculatedPostBoilVolume,
    volumeAfterCooling,
    volumeToFermenter,
    volumePackaging,
    volumePostMash,
    
    // Thermal effects
    thermalEffects,
    
    // Additional calculated values
    volumePreBoilColdL: isNoBoil ? volumePreBoil : roundForDisplay(volumePreBoil - thermalEffects.thermalExpansion),
    
    // Validation data
    volumeDifference,
    trubChillerLossAdjusted: volumeDifference > VOLUME_TOLERANCE_L
  };
}

/**
 * Validate volume flow calculations for consistency
 * @param {Object} volumeFlow - Volume flow calculation results
 * @param {Object} targetVolumes - Target volume values
 * @returns {Object} Validation warnings and errors
 */
function validateVolumeFlow(volumeFlow, targetVolumes) {
  const warnings = [];
  const errors = [];
  
  // Check if trub/chiller loss was adjusted significantly
  if (volumeFlow.trubChillerLossAdjusted && volumeFlow.volumeDifference > 0.1) {
    warnings.push(`Trub/chiller loss adjusted by ${volumeFlow.volumeDifference.toFixed(2)}L to match target fermenter volume`);
  }
  
  // Check for reasonable volume relationships
  if (volumeFlow.volumePreBoil < volumeFlow.volumeToFermenter) {
    warnings.push('Pre-boil volume is less than fermenter volume - check calculation inputs');
  }
  
  if (volumeFlow.thermalEffects.thermalExpansion > volumeFlow.volumeIntoKettle * THERMAL_EXPANSION_WARNING_THRESHOLD) {
    warnings.push('Thermal expansion seems unusually high (>10% of kettle volume)');
  }
  
  return { warnings, errors };
}

// Export safe wrappers for all calculation functions
const safeCalculateThermalEffects = (volumeData, isNoBoil) => 
    safeCalculation(() => calculateThermalEffects(volumeData, isNoBoil), {
        thermalExpansion: 0,
        thermalContraction: 0,
        thermalExpansionL: 0,
        thermalContractionL: 0,
        thermalExpansionFormatted: '0.0 L',
        thermalContractionFormatted: '0.0 L'
    }, {
        calculator: 'volume_flow',
        operation: 'thermal_effects'
    });

const safeCalculateVolumeFlow = (calculationData) => 
    safeCalculation(() => calculateVolumeFlow(calculationData), {
        strikeWaterL: 0,
        spargeWaterL: 0,
        totalWaterL: 0,
        volumeIntoKettle: 0,
        volumePreBoil: 0,
        volumePostBoil: 0,
        volumeToFermenter: 0,
        grainAbsorptionL: 0,
        mashTunDeadspace: 0,
        topUpKettle: 0,
        trubChillerLoss: 0,
        thermalEffects: {
            thermalExpansion: 0,
            thermalContraction: 0,
            thermalExpansionL: 0,
            thermalContractionL: 0,
            thermalExpansionFormatted: '0.0 L',
            thermalContractionFormatted: '0.0 L'
        },
        volumeDifference: 0,
        trubChillerLossAdjusted: false
    }, {
        calculator: 'volume_flow',
        operation: 'volume_flow'
    });

const safeValidateVolumeFlow = (volumeFlow, targetVolumes) => 
    safeCalculation(() => validateVolumeFlow(volumeFlow, targetVolumes), {
        warnings: [],
        errors: ['Validation failed']
    }, {
        calculator: 'volume_flow',
        operation: 'validate'
    });

export {
    safeCalculateThermalEffects as calculateThermalEffects,
    safeCalculateVolumeFlow as calculateVolumeFlow,
    safeValidateVolumeFlow as validateVolumeFlow
};
