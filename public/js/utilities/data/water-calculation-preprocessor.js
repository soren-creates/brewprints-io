/**
 * Recipe Water Processor Module
 * 
 * Handles all recipe format variations and data extraction complexity.
 * Converts raw recipe data into clean, standardized inputs for calculators.
 * 
 * Supports:
 * - BeerXML and BeerJSON formats
 * - Equipment field name variations
 * - System type classification (BIAB, Traditional, All-in-One)
 * - Missing data handling with sensible defaults
 */

import { 
  L_TO_GAL, 
  KG_TO_LB, 
  QT_TO_L,
  FERMENTER_LOSS_DEFAULT,
  GRAIN_DISPLACEMENT_RATE
} from '../../core/constants.js';
import { 
  detectSpargeUsage, 
  getSpargeVolume, 
  extractSpargeWaterFromMashSteps,
  getGrainAbsorptionRate,
  getGrainAbsorptionSystemType
} from '../../calculations/sparge-calculator.js';
import { RecipeValidator } from '../../core/recipe-validator.js';
import { ValidationError } from '../errors/application-errors.js';
import { sanitizeObject } from '../validation/security-utils.js';
import { isValidNumber } from '../validation/validation-utils.js';

/**
 * Extract grain data from recipe ingredients
 * @param {Object} recipeData - Recipe data object
 * @returns {Object} Grain data with weights and displacement
 */
export function extractGrainData(recipeData) {
  
  let totalGrainWeight = 0;
  
  // Extract solid fermentables that absorb water (exclude liquid extracts, sugars)
  if (recipeData.ingredients && recipeData.ingredients.fermentables) {
    recipeData.ingredients.fermentables.forEach(f => {
      if (f.amount && f.amount > 0) {
        if (f.type) {
          const type = f.type.toLowerCase();
          // Include solid fermentables that absorb water
          if (type === 'grain' || 
              type === 'adjunct' ||
              type === 'specialty' ||
              type === 'base malt' ||
              type === 'specialty malt' ||
              type.includes('malt') ||
              type.includes('grain')) {
            totalGrainWeight += f.amount;
          }
          // Exclude liquid extracts and sugars
          else if (type === 'extract' || type === 'sugar' || type === 'liquid extract' || type === 'dry extract') {
            // Don't include in grain weight
          }
        } else {
          // Assume fermentables without type are grains (graceful fallback)
          totalGrainWeight += f.amount;
        }
      }
    });
  }
  
  const totalGrainLbs = totalGrainWeight * KG_TO_LB;
  const grainDisplacementGal = totalGrainLbs * GRAIN_DISPLACEMENT_RATE;
  const grainDisplacementL = grainDisplacementGal / L_TO_GAL;
  
  return {
    totalGrainWeight,
    totalGrainLbs,
    grainDisplacementL
  };
}

/**
 * Classify the brewing system based on equipment name, recipe type, and sparge detection
 * @param {string} equipmentName - Equipment name
 * @param {Object} spargeDetection - Sparge detection result
 * @param {string} recipeType - Recipe type (Extract, All Grain, etc.)
 * @returns {Object} System classification data
 */
export function classifyBrewingSystem(equipmentName, spargeDetection, recipeType = '') {
  const name = (equipmentName || '').toLowerCase();
  const type = (recipeType || '').toLowerCase();
  
  // Check for extract recipes first - they have their own classification
  if (type === 'extract' || type.includes('extract')) {
    return {
      type: 'extract',
      isNoSparge: true,
      isAllInOne: false,
      isBIAB: false,
      isExtract: true,
      isPartialMash: false,
      description: 'extract brewing system',
      usesSparge: false
    };
  }
  
  // Check for partial mash recipes - hybrid extract/grain method
  if (type === 'partial mash' || type.includes('partial mash')) {
    return {
      type: 'partial_mash',
      isNoSparge: true,
      isAllInOne: false,
      isBIAB: false,
      isExtract: false,
      isPartialMash: true,
      description: 'partial mash brewing system',
      usesSparge: false
    };
  }
  
  const isNoSparge = name.includes('no sparge') || name.includes('biab') || !spargeDetection.usesSparge;
  const isAllInOne = name.includes('foundry') || name.includes('grainfather') || 
                     name.includes('brewzilla') || name.includes('all in one');
  const isBIAB = name.includes('biab');
  
  let systemType = 'traditional';
  if (isBIAB) systemType = 'biab';
  else if (isAllInOne) systemType = 'all-in-one';
  else if (isNoSparge) systemType = 'no-sparge';
  
  return {
    type: systemType,
    isNoSparge,
    isAllInOne,
    isBIAB,
    isExtract: false,
    isPartialMash: false,
    description: `${systemType} brewing system`,
    usesSparge: spargeDetection.usesSparge
  };
}

/**
 * Extract and normalize equipment data with system-appropriate defaults
 * @param {Object} equipment - Equipment object from recipe
 * @param {Object} systemType - System classification
 * @param {Object} spargeDetection - Sparge detection result
 * @returns {Object} Normalized equipment data
 */
export function extractEquipmentData(equipment, systemType, spargeDetection) {
  
  // Handle field name variations (BeerXML vs BeerJSON vs custom)
  const boilOffRateLHr = equipment.boilOffRate || equipment.BOIL_OFF_RATE || equipment.boil_off_rate;
  const evapRate = equipment.evapRate || equipment.EVAP_RATE || equipment.evap_rate;
  const trubChillerLoss = equipment.trubChillerLoss !== undefined ? equipment.trubChillerLoss : 
                         (equipment.TRUB_CHILLER_LOSS !== undefined ? equipment.TRUB_CHILLER_LOSS : undefined);

  // Set system-appropriate defaults
  const mashTunDeadspace = equipment.mashTunDeadspace || (systemType.isNoSparge ? 0 : 0.5);
  const lauterDeadspace = equipment.lauterDeadspace || equipment.LAUTER_DEADSPACE || 0;
  const topUpKettle = equipment.topUpKettle || 0;
  const topUpWater = equipment.topUpWater || 0;
  const fermenterLoss = equipment.fermenterLoss || FERMENTER_LOSS_DEFAULT;

  // Calculate grain absorption data
  const grainAbsorptionRate = getGrainAbsorptionRate(equipment.name, spargeDetection);
  const grainAbsorptionSystemType = getGrainAbsorptionSystemType(equipment.name, spargeDetection);

  // Determine data source priority for evaporation calculations
  let dataSourcePriority = 'defaults';
  if (boilOffRateLHr !== undefined && boilOffRateLHr > 0) dataSourcePriority = 'boil_off_rate';
  else if (trubChillerLoss !== undefined && trubChillerLoss >= 0) dataSourcePriority = 'trub_loss';
  else if (evapRate !== undefined && evapRate > 0) dataSourcePriority = 'evap_rate';
  
  return {
    mashTunDeadspace,
    lauterDeadspace,
    topUpKettle,
    topUpWater,
    fermenterLoss,
    boilOffRateLHr,
    evapRate,
    trubChillerLoss,
    grainAbsorptionRate,
    grainAbsorptionSystemType,
    dataSourcePriority
  };
}

/**
 * Extract mash water data from recipe with enhanced step analysis
 * @param {Object} recipeData - Recipe data object
 * @param {Object} spargeDetection - Sparge detection result
 * @param {Object} explicitSpargeVolume - Explicit sparge volume if available
 * @returns {Object} Mash water data
 */
export function extractMashWaterData(recipeData, spargeDetection, explicitSpargeVolume) {
  
  let totalMashWaterL = 0;
  let strikeWaterL = 0;
  let spargeWaterL = 0;
  let hasWaterGrainRatio = false;
  let waterGrainRatioQt = 0;
  let mashStepAnalysis = [];

  // Check if we have water-to-grain ratio from mash profile
  // Some formats store water-grain ratio in tunSpecificHeat (hacky but happens)
  if (recipeData.mash && recipeData.mash.tunSpecificHeat !== undefined) {
    const ratio = recipeData.mash.tunSpecificHeat;
    if (ratio > 0.5 && ratio < 5) { // Reasonable range for qt/lb
      hasWaterGrainRatio = true;
      waterGrainRatioQt = ratio;
    }
  }

  // Enhanced mash step analysis
  if (recipeData.mash && recipeData.mash.steps) {
    const stepResults = extractSpargeWaterFromMashSteps(recipeData.mash.steps, spargeDetection);
    strikeWaterL = stepResults.strikeWaterL;
    spargeWaterL = stepResults.spargeWaterL;
    totalMashWaterL = stepResults.totalMashWaterL;
    mashStepAnalysis = stepResults.stepAnalysis;
  }

  // Use explicit sparge volume if available
  if (explicitSpargeVolume && explicitSpargeVolume.volume > 0) {
    spargeWaterL = explicitSpargeVolume.volume;
    totalMashWaterL = strikeWaterL + spargeWaterL;
  }

  return {
    totalMashWaterL,
    strikeWaterL,
    spargeWaterL,
    hasWaterGrainRatio,
    waterGrainRatioQt,
    mashStepAnalysis
  };
}

/**
 * Validate and normalize processed input data using RecipeValidator
 * @param {Object} processedData - Processed data object
 * @returns {Object} Validated and normalized data
 */
export function validateAndNormalizeInputs(processedData) {
  const validator = new RecipeValidator();
  
  // Use RecipeValidator for comprehensive water calculation input validation
  const validationResult = validator.validateWaterCalculationInputs(processedData);
  
  // Additional validation specific to this processor
  const additionalWarnings = [];
  const additionalErrors = [];
  
  // Check equipment data source priority
  if (processedData.equipment?.dataSourcePriority === 'defaults') {
    additionalWarnings.push('No equipment data found, using defaults');
  }
  
  // Check mash water data availability
  if (processedData.mashWaterData?.totalMashWaterL <= 0 && 
      !processedData.mashWaterData?.hasWaterGrainRatio) {
    additionalWarnings.push('No mash water data found in recipe');
  }
  
  // Combine validation results
  const allWarnings = [...validationResult.warnings, ...additionalWarnings];
  const allErrors = [...validationResult.errors, ...additionalErrors];
  
  // Update processed data with validated inputs and results
  const validatedData = {
    ...processedData,
    ...validationResult.validatedInputs,
    validation: { 
      warnings: allWarnings, 
      errors: allErrors,
      isValid: allErrors.length === 0
    }
  };
  
  return validatedData;
}

/**
 * Main processing function - converts raw recipe data into clean, standardized inputs
 * @param {Object} recipeData - Raw recipe data from BeerXML, BeerJSON, etc.
 * @returns {Object} Clean, validated data ready for calculations
 */
export function processRecipeForWaterCalculations(recipeData) {
  // Handle null/undefined input
  if (!recipeData || typeof recipeData !== 'object') {
    throw new ValidationError('Recipe data is required and must be an object', {
      userMessage: 'Invalid recipe data provided for water calculations.',
      details: { processor: 'water-calculation-preprocessor', inputType: typeof recipeData, dataProvided: !!recipeData }
    });
  }

  // Sanitize input data to prevent XSS and path traversal attacks
  const sanitizedRecipeData = sanitizeObject(recipeData, {
    textFields: ['name', 'brewer', 'notes', 'description', 'type'],
    pathFields: ['path', 'file', 'filename'],
    numericFields: ['batchSize', 'boilSize', 'boilTime', 'amount', 'efficiency', 'alpha', 'time', 'yield', 'color'],
    recursive: true
  });
  
  // Additional null check after sanitization
  if (!sanitizedRecipeData || typeof sanitizedRecipeData !== 'object') {
    throw new ValidationError('Sanitized recipe data is invalid', {
      userMessage: 'Recipe data failed security validation for water calculations.',
      details: { processor: 'water-calculation-preprocessor', phase: 'sanitization', inputType: typeof sanitizedRecipeData }
    });
  }
  
  // Basic recipe data extraction
  const equipment = sanitizedRecipeData.equipment || {};
  const boilTime = sanitizedRecipeData.boilTime !== undefined ? sanitizedRecipeData.boilTime : 60;
  const isNoBoil = !isValidNumber(boilTime, { allowZero: false, allowNegative: false });
  const batchSizeL = sanitizedRecipeData.batchSize || 0;
  let boilSizeL = sanitizedRecipeData.boilSize;
  
  // Calculate fallback boil size if missing (typical 25% evaporation loss)
  if (!boilSizeL || boilSizeL <= 0) {
    boilSizeL = batchSizeL * 1.33; // Assume ~25% evaporation loss
  }
  
  // Validate critical recipe data
  if (batchSizeL <= 0) {
    throw new ValidationError('Recipe must have a valid batch size greater than 0', {
      userMessage: 'Recipe batch size is invalid or missing.',
      details: { processor: 'water-calculation-preprocessor', field: 'batchSize', value: batchSizeL }
    });
  }
  
  if (batchSizeL < 0 || boilSizeL < 0) {
    throw new ValidationError('Recipe cannot have negative batch size or boil size', {
      userMessage: 'Recipe contains invalid negative volume values.',
      details: { processor: 'water-calculation-preprocessor', batchSize: batchSizeL, boilSize: boilSizeL }
    });
  }

  // Enhanced sparge detection
  const spargeDetection = detectSpargeUsage(sanitizedRecipeData);
  const explicitSpargeVolume = getSpargeVolume(sanitizedRecipeData);
  
  // System classification
  const systemType = classifyBrewingSystem(equipment.name || '', spargeDetection, sanitizedRecipeData.type);
  
  // Data extraction with system context
  const grainData = extractGrainData(sanitizedRecipeData);
  
  // Validate recipe type and grain content using RecipeValidator
  const validator = new RecipeValidator();
  const recipeTypeValidation = validator.validateRecipeTypeForWaterCalculations(
    sanitizedRecipeData.type,
    grainData.totalGrainWeight
  );
  
  if (!recipeTypeValidation.isValid) {
    throw new ValidationError(recipeTypeValidation.errors.join('; '), {
      userMessage: 'Recipe type and ingredient mismatch detected.',
      details: { 
        processor: 'water-calculation-preprocessor', 
        recipeType: recipeTypeValidation.normalizedType, 
        totalGrainWeight: grainData.totalGrainWeight,
        errors: recipeTypeValidation.errors
      }
    });
  }
  
  const equipmentData = extractEquipmentData(equipment, systemType, spargeDetection);
  const mashWaterData = extractMashWaterData(sanitizedRecipeData, spargeDetection, explicitSpargeVolume);

  // Calculate grain absorption using extracted grain data
  const grainAbsorptionQt = grainData.totalGrainLbs * equipmentData.grainAbsorptionRate;
  const grainAbsorptionL = grainAbsorptionQt * QT_TO_L;
  
  // Add grain absorption to grain data
  grainData.grainAbsorptionL = grainAbsorptionL;
  
  // Assemble processed data
  const processedData = {
    // Basic recipe info
    batchSizeL,
    boilSizeL,
    boilTime,
    isNoBoil,
    
    // System classification
    systemType,
    spargeDetection,
    explicitSpargeVolume,
    
    // Extracted data
    equipment: equipmentData,
    grainData,
    mashWaterData,
    
    // Original references for debugging
    originalEquipment: equipment,
    originalRecipe: sanitizedRecipeData
  };
  
  return validateAndNormalizeInputs(processedData);
}
