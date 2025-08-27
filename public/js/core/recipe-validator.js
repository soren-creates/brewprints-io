/**
 * Recipe Validator
 * Handles data validation and applies brewing domain defaults
 * This is the bridge between pure parsing and calculation phases
 */

import { 
  parseNumber,
  parseRawPercentage,
  isValidString, 
  getValidString,
  isValidArray,
  getValidArray,
  isValidGravity,
  isValidABV,
  isValidTemperature,
  isValidPercentage,
  isValidAmount,
  isValidTime,
  isValidPH,
  isValidMineralContent,
  isValidNumber,
  validatePhysicalRange,
  createValidationResult
} from '../utilities/validation/validation-utils.js';
import { ValidationError } from '../utilities/errors/application-errors.js';
import { debug, DEBUG_CATEGORIES } from '../utilities/debug.js';

import {
  DEFAULT_EFFICIENCY,
  DEFAULT_BOIL_TIME,
  DEFAULT_CARBONATION,
  DEFAULT_FERMENTATION_TEMP,
  DEFAULT_MASH_TEMP,
  DEFAULT_SPARGE_TEMP,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BOIL_SIZE,
  DEFAULT_YEAST_ATTENUATION,
  BREWING_LIMITS,
  L_TO_GAL,
  KG_TO_LB,
  QT_TO_L,
  BOIL_OFF_RATE_MIN_L_HR,
  BOIL_OFF_RATE_MAX_L_HR,
  BATCH_SIZE_TOLERANCE_PERCENT,
  MAX_SPARGE_RATIO,
  MIN_STRIKE_RATIO,
  MAX_STRIKE_RATIO
} from './constants.js';

class RecipeValidator {
  constructor() {
    // Brewing domain defaults - only applied during validation phase
    this.brewingDefaults = {
      efficiency: DEFAULT_EFFICIENCY,
      boilTime: DEFAULT_BOIL_TIME,
      carbonation: DEFAULT_CARBONATION,
      fermentationTemp: DEFAULT_FERMENTATION_TEMP,
      mashTemp: DEFAULT_MASH_TEMP,
      spargeTemp: DEFAULT_SPARGE_TEMP,
      batchSize: DEFAULT_BATCH_SIZE,
      boilSize: DEFAULT_BOIL_SIZE,
      yeastAttenuation: DEFAULT_YEAST_ATTENUATION
    };

    // Brewing domain limits for sanity checking
    this.brewingLimits = BREWING_LIMITS;
    
    // Validation context for tracking applied defaults and errors
    this.validationContext = null;
  }

  /**
   * Validates and enhances raw recipe data with brewing domain defaults
   * 
   * TRUSTED INPUT CONTRACT: This method provides guarantees for calculators:
   * - All ingredient arrays are valid (may be empty, but never null/undefined)
   * - All ingredient objects have required valid numeric properties
   * - Core recipe values (batchSize, efficiency, etc.) are valid numbers with domain defaults
   * - Invalid ingredients are filtered out, remaining ones are calculation-ready
   * 
   * @param {Object} rawRecipeData - Raw data from parser (no defaults applied)
   * @returns {Object} Validated recipe data with calculation guarantees
   */
  validateRecipe(rawRecipeData) {
    if (!rawRecipeData || typeof rawRecipeData !== 'object') {
      throw new ValidationError('Invalid recipe data provided to validator', {
        userMessage: 'The recipe file data is corrupted or in an unrecognized format.',
        details: { 
          validator: 'recipe-validator', 
          inputType: typeof rawRecipeData, 
          dataProvided: !!rawRecipeData,
          dataAnalysis: {
            isNull: rawRecipeData === null,
            isUndefined: rawRecipeData === undefined,
            isObject: typeof rawRecipeData === 'object',
            hasKeys: rawRecipeData && typeof rawRecipeData === 'object' ? Object.keys(rawRecipeData).length > 0 : false
          },
          remediation: 'Ensure the recipe file is valid and properly formatted before uploading'
        }
      });
    }

    debug.log(DEBUG_CATEGORIES.VALIDATOR, 'Starting validation of:', rawRecipeData.name || 'Unnamed Recipe');

    // Set up validation context for tracking
    const validationContext = {
      timestamp: new Date().toISOString(),
      defaultsApplied: [], // Track which defaults were applied
      validationErrors: [], // Track non-fatal validation issues
      sanitizedValues: [] // Track values that were clamped to valid ranges
    };
    this.setValidationContext(validationContext);

    try {
      const validatedRecipe = {
        // Basic info - apply defaults for missing essential fields
        name: this.validateString(rawRecipeData.name, 'Untitled Recipe'),
        brewer: this.validateString(rawRecipeData.brewer, ''),
        date: this.validateString(rawRecipeData.date, ''),
        notes: this.validateString(rawRecipeData.notes, ''),
        type: this.validateString(rawRecipeData.type, 'All Grain'),

        // Core measurements - validate ranges, apply defaults for critical missing values
        batchSize: this.validateVolume(rawRecipeData.batchSize, this.brewingDefaults.batchSize),
        boilSize: this.validateVolume(rawRecipeData.boilSize, null), // Don't default, let calculations derive
        boilTime: this.validateTime(rawRecipeData.boilTime, this.brewingDefaults.boilTime),
        efficiency: this.validateEfficiency(rawRecipeData.efficiency),

        // Calculated values - validate ranges, keep undefined if missing (let calculations fill)
        og: this.validateGravity(rawRecipeData.og, 'og'),
        fg: this.validateGravity(rawRecipeData.fg, 'fg'),
        abv: this.validatePercentage(rawRecipeData.abv, 'abv'),
        ibu: this.validateRange(rawRecipeData.ibu, this.brewingLimits.ibu),
        srm: this.validateRange(rawRecipeData.srm, this.brewingLimits.srm),
        carbonation: this.validateRange(rawRecipeData.carbonation, this.brewingLimits.carbonation),

        // Complex objects - validate structure
        style: this.validateStyle(rawRecipeData.style),
        ingredients: this.validateIngredients(rawRecipeData.ingredients),
        mash: this.validateMash(rawRecipeData.mash),
        fermentation: this.validateFermentation(rawRecipeData.fermentation),
        equipment: this.validateEquipment(rawRecipeData.equipment),

        // Preserve metadata from parsers
        isBrewfatherExport: Boolean(rawRecipeData.isBrewfatherExport),
        sourceFormat: rawRecipeData.sourceFormat, // Preserve format detection from parser
        
        // Add validation metadata
        _validation: validationContext
      };

      // Preserve any Brewfather-specific fields
      this.preserveBrewfatherFields(rawRecipeData, validatedRecipe);

      debug.group(DEBUG_CATEGORIES.VALIDATOR, 'Validation completed successfully', () => {
        debug.log(DEBUG_CATEGORIES.VALIDATOR, `Defaults applied: ${validationContext.defaultsApplied.length}`);
        debug.log(DEBUG_CATEGORIES.VALIDATOR, `Validation errors: ${validationContext.validationErrors.length}`);
        debug.log(DEBUG_CATEGORIES.VALIDATOR, `Sanitized values: ${validationContext.sanitizedValues.length}`);
      });

      // Clear validation context
      this.setValidationContext(null);

      return validatedRecipe;
      
    } catch (error) {
      // Clear validation context on error
      this.setValidationContext(null);
      
      // Re-throw ValidationError instances as-is
      if (error instanceof ValidationError) {
        throw error;
      }
      
      // Wrap other errors in ValidationError with enhanced context
      throw new ValidationError(`Recipe validation failed: ${error.message}`, {
        userMessage: 'Unable to validate the recipe data. The file may contain invalid or corrupted brewing information.',
        details: { 
          validator: 'recipe-validator', 
          phase: 'VALIDATION_PROCESSING',
          originalError: error.message,
          validationContext,
          recipeInfo: {
            name: rawRecipeData?.name || 'Unknown Recipe',
            type: rawRecipeData?.type || 'Unknown Type',
            sourceFormat: rawRecipeData?.sourceFormat || 'Unknown Format',
            hasIngredients: !!(rawRecipeData?.ingredients),
            ingredientCounts: {
              fermentables: rawRecipeData?.ingredients?.fermentables?.length || 0,
              hops: rawRecipeData?.ingredients?.hops?.length || 0,
              yeasts: rawRecipeData?.ingredients?.yeasts?.length || 0
            }
          },
          remediation: 'Try re-exporting the recipe from your brewing software or check for missing required fields'
        }
      });
    }
  }

  /**
   * Validate string field with optional default
   */
  validateString(value, defaultValue = null) {
    // Handle undefined, null, empty string, or whitespace-only strings
    if (value && typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (defaultValue !== null && defaultValue !== undefined) {
      if (defaultValue !== '') {
        this.recordDefaultApplied('string field', defaultValue);
      }
      return defaultValue;
    }
    return undefined; // Return undefined if no valid value and no default
  }

  /**
   * Validate volume measurements with brewing-specific range checking
   * @param {any} value - Volume value to validate
   * @param {number|null} defaultValue - Default value if validation fails
   * @param {Object} options - Validation options
   * @param {Object} options.limits - Custom volume limits (default: BREWING_LIMITS.amount)
   * @param {string} options.unit - Unit for error messages (default: 'L')
   * @param {string} options.fieldName - Field name for error tracking
   * @returns {number|undefined} Validated volume or default
   */
  validateVolume(value, defaultValue = null, options = {}) {
    const { 
      limits = BREWING_LIMITS.amount, 
      unit = 'L', 
      fieldName = 'volume' 
    } = options;

    // Parse volume value using pure parsing
    const parsedValue = parseNumber(value);
    
    // Apply brewing domain validation
    if (isValidAmount(parsedValue)) {
      // Clamp to specified limits if provided
      if (limits) {
        const clamped = this.clampToRange(parsedValue, limits);
        if (clamped !== parsedValue) {
          this.recordSanitizedValue(fieldName, parsedValue, clamped);
        }
        return clamped;
      }
      return parsedValue;
    }
    
    if (defaultValue !== null) {
      this.recordDefaultApplied(fieldName, defaultValue);
      return defaultValue;
    }
    return undefined;
  }

  /**
   * Validate time measurement
   */
  validateTime(value, defaultValue = null) {
    // Parse time value using pure parsing
    const parsedValue = parseNumber(value);
    
    // Apply brewing domain validation using constants
    if (isValidTime(parsedValue)) {
      return parsedValue;
    }
    
    if (defaultValue !== null) {
      this.recordDefaultApplied('time', defaultValue);
      return defaultValue;
    }
    return undefined;
  }

  /**
   * Validate efficiency with brewing domain default
   */
  validateEfficiency(value) {
    // Handle both simple number and complex efficiency object from BeerJSON
    let efficiencyValue;
    
    if (typeof value === 'object' && value !== null) {
      // BeerJSON efficiency object - prefer brewhouse efficiency
      efficiencyValue = value.brewhouse || value.conversion || value.mash;
    } else {
      efficiencyValue = value;
    }

    // CRITICAL: Check for undefined/null BEFORE parsing to apply proper defaults
    if (efficiencyValue === undefined || efficiencyValue === null) {
      this.recordDefaultApplied('efficiency', this.brewingDefaults.efficiency);
      return this.brewingDefaults.efficiency;
    }
    
    // Parse without domain validation using pure parsing
    const parsedValue = parseRawPercentage(efficiencyValue);
    
    // Apply domain validation using constants
    if (isValidPercentage(parsedValue)) {
      return this.clampToRange(parsedValue, this.brewingLimits.efficiency);
    }
    
    // Apply brewing domain default for invalid values
    this.recordDefaultApplied('efficiency', this.brewingDefaults.efficiency);
    return this.brewingDefaults.efficiency;
  }

  /**
   * Validate gravity measurements
   */
  validateGravity(value, type) {
    // If value is null/undefined, return undefined to let calculations derive it
    if (value === null || value === undefined) {
      return undefined;
    }
    
    // Parse gravity value using pure parsing (handles legacy format conversion)
    const parsedValue = parseNumber(value);
    
    // Apply domain validation using constants
    if (isValidGravity(parsedValue)) {
      const limits = this.brewingLimits[type] || this.brewingLimits.gravity;
      const clamped = this.clampToRange(parsedValue, limits);
      if (clamped !== parsedValue) {
        this.recordSanitizedValue(type, parsedValue, clamped);
      }
      return clamped;
    }
    return undefined; // Let calculations derive missing gravities
  }

  /**
   * Validate percentage measurements
   */
  validatePercentage(value, type) {
    // If value is null/undefined, return undefined to let calculations derive it
    if (value === null || value === undefined) {
      return undefined;
    }
    
    // Parse percentage value using pure parsing (handles format conversion)
    const parsedValue = parseRawPercentage(value);
    
    // Apply domain validation using constants
    if (isValidPercentage(parsedValue)) {
      const limits = this.brewingLimits[type] || this.brewingLimits.percentage;
      const clamped = this.clampToRange(parsedValue, limits);
      if (clamped !== parsedValue) {
        this.recordSanitizedValue(type, parsedValue, clamped);
      }
      return clamped;
    }
    return undefined;
  }

  /**
   * Validate numerical values against specified ranges with brewing context
   * @param {any} value - Value to validate
   * @param {Object} limits - Range limits object with min/max
   * @param {Object} options - Validation options
   * @param {string} options.unit - Unit for display
   * @param {string} options.fieldName - Field name for tracking
   * @param {boolean} options.allowZero - Whether zero is valid (default: true)
   * @param {boolean} options.allowNegative - Whether negative values are valid (default: false)
   * @returns {Object|number} Validation result with value, warnings, and errors (or just value for backward compatibility)
   */
  validateRange(value, limits, options = {}) {
    const { 
      unit = '',
      fieldName = 'range value',
      allowZero = true,
      allowNegative = false,
      returnValidationResult = false
    } = options;

    // If value is null/undefined, return undefined to let calculations derive it (backward compatibility)
    if (value === null || value === undefined) {
      return returnValidationResult ? createValidationResult([], [], { value: undefined }) : undefined;
    }

    // Parse value using pure parsing
    const parsedValue = parseNumber(value);
    
    // Check if value is valid number
    if (!isValidNumber(parsedValue, { allowZero, allowNegative })) {
      if (returnValidationResult) {
        return createValidationResult(
          [],
          [`${fieldName} must be a valid ${allowNegative ? '' : 'positive '}number`]
        );
      }
      return undefined;
    }

    // Apply range validation if limits provided
    if (limits) {
      const result = validatePhysicalRange(parsedValue, {
        ...limits,
        unit,
        name: fieldName
      });

      // Clamp value to range if it's outside bounds
      let finalValue = parsedValue;
      if (parsedValue < limits.min) {
        finalValue = limits.min;
        this.recordSanitizedValue(fieldName, parsedValue, finalValue);
      } else if (parsedValue > limits.max) {
        finalValue = limits.max;
        this.recordSanitizedValue(fieldName, parsedValue, finalValue);
      }

      if (returnValidationResult) {
        return {
          ...result,
          value: finalValue
        };
      } else {
        // Backward compatibility - just return the clamped value
        return finalValue;
      }
    }

    return returnValidationResult ? createValidationResult([], [], { value: parsedValue }) : parsedValue;
  }

  /**
   * Validate style object
   */
  validateStyle(style) {
    if (!style || typeof style !== 'object') {
      return null;
    }

    return {
      ...style,
      name: this.validateString(style.name, 'Unknown Style'),
      // Validate style ranges if present
      ogMin: this.validateRange(style.ogMin, this.brewingLimits.og),
      ogMax: this.validateRange(style.ogMax, this.brewingLimits.og),
      fgMin: this.validateRange(style.fgMin, this.brewingLimits.fg),
      fgMax: this.validateRange(style.fgMax, this.brewingLimits.fg),
      ibuMin: this.validateRange(style.ibuMin, this.brewingLimits.ibu),
      ibuMax: this.validateRange(style.ibuMax, this.brewingLimits.ibu),
      srmMin: this.validateRange(style.srmMin, this.brewingLimits.srm),
      srmMax: this.validateRange(style.srmMax, this.brewingLimits.srm),
      abvMin: this.validateRange(style.abvMin, this.brewingLimits.abv),
      abvMax: this.validateRange(style.abvMax, this.brewingLimits.abv)
    };
  }

  /**
   * Validate ingredients object
   */
  validateIngredients(ingredients) {
    if (!ingredients || typeof ingredients !== 'object') {
      return { fermentables: [], hops: [], yeasts: [], miscs: [], waters: [] };
    }

    return {
      fermentables: this.validateFermentableArray(ingredients.fermentables),
      hops: this.validateHopArray(ingredients.hops),
      yeasts: this.validateYeastArray(ingredients.yeasts),
      miscs: this.validateMiscArray(ingredients.miscs),
      waters: this.validateWaterArray(ingredients.waters)
    };
  }

  /**
   * Validate mash object
   */
  validateMash(mash) {
    if (!mash || typeof mash !== 'object') {
      return null;
    }

    return {
      ...mash,
      grainTemp: this.validateTemperature(mash.grainTemp),
      tunTemp: this.validateTemperature(mash.tunTemp),
      spargeTemp: this.validateTemperature(mash.spargeTemp),
      ph: this.validateRange(mash.ph, this.brewingLimits.ph),
      steps: this.validateMashSteps(mash.steps)
    };
  }

  /**
   * Validate fermentation object
   */
  validateFermentation(fermentation) {
    if (!fermentation || typeof fermentation !== 'object') {
      return null;
    }

    return {
      ...fermentation,
      primaryTemp: this.validateTemperature(fermentation.primaryTemp),
      secondaryTemp: this.validateTemperature(fermentation.secondaryTemp),
      tertiaryTemp: this.validateTemperature(fermentation.tertiaryTemp),
      ageTemp: this.validateTemperature(fermentation.ageTemp),
      primaryAge: this.validateTime(fermentation.primaryAge),
      secondaryAge: this.validateTime(fermentation.secondaryAge),
      tertiaryAge: this.validateTime(fermentation.tertiaryAge),
      age: this.validateTime(fermentation.age)
    };
  }

  /**
   * Validate equipment object
   */
  validateEquipment(equipment) {
    if (!equipment || typeof equipment !== 'object') {
      return null;
    }

    return {
      ...equipment,
      boilSize: this.validateVolume(equipment.boilSize),
      batchSize: this.validateVolume(equipment.batchSize),
      tunVolume: this.validateVolume(equipment.tunVolume),
      evapRate: this.validatePercentage(equipment.evapRate),
      boilTime: this.validateTime(equipment.boilTime),
      efficiency: this.validatePercentage(equipment.efficiency),
      // Add water-related equipment validations
      trubChillerLoss: this.validateVolume(equipment.trubChillerLoss),
      mashTunDeadspace: this.validateVolume(equipment.mashTunDeadspace),
      lauterDeadspace: this.validateVolume(equipment.lauterDeadspace),
      topUpKettle: this.validateVolume(equipment.topUpKettle),
      topUpWater: this.validateVolume(equipment.topUpWater),
      fermenterLoss: this.validateVolume(equipment.fermenterLoss),
      boilOffRate: this.validateRange(equipment.boilOffRate, this.brewingLimits.boilOffRate)
    };
  }

  // Ingredient validation methods

  /**
   * Validate fermentable array - ensures all fermentables have valid brewing data
   */
  validateFermentableArray(fermentableArray) {
    if (!isValidArray(fermentableArray)) {
      return [];
    }
    
    return fermentableArray
      .map(fermentable => this.validateFermentable(fermentable))
      .filter(fermentable => fermentable !== null); // Remove invalid fermentables
  }

  /**
   * Validate individual fermentable ingredient
   */
  validateFermentable(fermentable) {
    if (!fermentable || typeof fermentable !== 'object') {
      this.recordValidationError('fermentable', 'Invalid fermentable object');
      return null;
    }

    // Parse critical numeric fields
    const amount = parseNumber(fermentable.amount);
    const color = parseNumber(fermentable.color);
    const yieldPercent = parseRawPercentage(fermentable.yield);

    // Validate essential fields - fermentable is unusable without these
    if (!isValidAmount(amount) || amount <= 0) {
      this.recordValidationError('fermentable.amount', `Invalid amount: ${fermentable.amount}`);
      return null;
    }

    if (!isValidAmount(color) || color < 0) {
      this.recordValidationError('fermentable.color', `Invalid color: ${fermentable.color}`);
      return null;
    }

    // Yield is required for gravity calculations - validate range
    const validatedYield = isValidPercentage(yieldPercent) && 
                          yieldPercent >= this.brewingLimits.fermentableYield.min && 
                          yieldPercent <= this.brewingLimits.fermentableYield.max 
                          ? yieldPercent : 80; // Reasonable default for base malt
    if ((yieldPercent === undefined && fermentable.yield !== undefined) || 
        (yieldPercent && (yieldPercent < this.brewingLimits.fermentableYield.min || yieldPercent > this.brewingLimits.fermentableYield.max))) {
      this.recordDefaultApplied('fermentable.yield', validatedYield);
    }

    return {
      ...fermentable,
      name: this.validateString(fermentable.name, 'Unknown Fermentable'),
      type: this.validateString(fermentable.type, 'grain'),
      amount,
      color,
      yield: validatedYield,
      addAfterBoil: Boolean(fermentable.addAfterBoil)
    };
  }

  /**
   * Validate hop array - ensures all hops have valid brewing data
   */
  validateHopArray(hopArray) {
    if (!isValidArray(hopArray)) {
      return [];
    }
    
    return hopArray
      .map(hop => this.validateHop(hop))
      .filter(hop => hop !== null); // Remove invalid hops
  }

  /**
   * Validate individual hop ingredient
   */
  validateHop(hop) {
    if (!hop || typeof hop !== 'object') {
      this.recordValidationError('hop', 'Invalid hop object');
      return null;
    }

    // Parse critical numeric fields
    const amount = parseNumber(hop.amount);
    const alpha = parseRawPercentage(hop.alpha);
    const time = parseNumber(hop.time);

    // Validate essential fields - hop is unusable without these
    if (!isValidAmount(amount) || amount <= 0) {
      this.recordValidationError('hop.amount', `Invalid amount: ${hop.amount}`);
      return null;
    }

    if (!isValidPercentage(alpha) || alpha <= 0 || alpha > this.brewingLimits.alphaAcid.max) {
      this.recordValidationError('hop.alpha', `Alpha acid out of range (${this.brewingLimits.alphaAcid.min}-${this.brewingLimits.alphaAcid.max}%): ${hop.alpha}`);
      return null;
    }

    // Time defaults to 0 for aroma/dry hop additions
    const validatedTime = isValidTime(time) ? time : 0;
    if (time === undefined && hop.time !== undefined) {
      this.recordDefaultApplied('hop.time', validatedTime);
    }

    return {
      ...hop,
      name: this.validateString(hop.name, 'Unknown Hop'),
      use: this.validateString(hop.use, 'boil'),
      amount,
      alpha,
      time: validatedTime
    };
  }

  /**
   * Validate misc ingredient array
   */
  validateMiscArray(miscArray) {
    if (!isValidArray(miscArray)) {
      return [];
    }
    
    return miscArray
      .map(misc => this.validateMisc(misc))
      .filter(misc => misc !== null); // Remove invalid miscs
  }

  /**
   * Validate individual misc ingredient
   */
  validateMisc(misc) {
    if (!misc || typeof misc !== 'object') {
      this.recordValidationError('misc', 'Invalid misc object');
      return null;
    }

    // Parse amount if present
    const amount = parseNumber(misc.amount);
    const time = parseNumber(misc.time);

    // For misc ingredients, amount can be optional (some are just "to taste")
    const validatedAmount = isValidAmount(amount) ? amount : 0;
    const validatedTime = isValidTime(time) ? time : 0;

    return {
      ...misc,
      name: this.validateString(misc.name, 'Unknown Addition'),
      type: this.validateString(misc.type, 'other'),
      use: this.validateString(misc.use, 'boil'),
      amount: validatedAmount,
      time: validatedTime
    };
  }

  /**
   * Validate water ingredient array
   */
  validateWaterArray(waterArray) {
    if (!isValidArray(waterArray)) {
      return [];
    }
    
    return waterArray
      .map(water => this.validateWater(water))
      .filter(water => water !== null); // Remove invalid waters
  }

  /**
   * Validate individual water ingredient
   */
  validateWater(water) {
    if (!water || typeof water !== 'object') {
      this.recordValidationError('water', 'Invalid water object');
      return null;
    }

    // Parse mineral content fields
    const calcium = parseNumber(water.calcium);
    const magnesium = parseNumber(water.magnesium);
    const sodium = parseNumber(water.sodium);
    const chloride = parseNumber(water.chloride);
    const sulfate = parseNumber(water.sulfate);
    const bicarbonate = parseNumber(water.bicarbonate);

    // Preserve distinction between explicit zeros and missing data
    // Only include ion properties if they have valid values (including 0)
    const validatedWater = {
      ...water,
      name: this.validateString(water.name, 'Unknown Water')
    };

    // Only add ion properties if they were explicitly provided
    if (isValidMineralContent(calcium)) {
      validatedWater.calcium = calcium;
      validatedWater.Ca = calcium; // Add alias for compatibility
    }
    if (isValidMineralContent(magnesium)) {
      validatedWater.magnesium = magnesium;
      validatedWater.Mg = magnesium;
    }
    if (isValidMineralContent(sodium)) {
      validatedWater.sodium = sodium;
      validatedWater.Na = sodium;
    }
    if (isValidMineralContent(chloride)) {
      validatedWater.chloride = chloride;
      validatedWater.Cl = chloride;
    }
    if (isValidMineralContent(sulfate)) {
      validatedWater.sulfate = sulfate;
      validatedWater.SO4 = sulfate;
    }
    if (isValidMineralContent(bicarbonate)) {
      validatedWater.bicarbonate = bicarbonate;
      validatedWater.HCO3 = bicarbonate;
    }

    return validatedWater;
  }

  validateYeastArray(yeastArray) {
    if (!isValidArray(yeastArray)) {
      return [];
    }
    
    return yeastArray
      .map(yeast => this.validateYeast(yeast))
      .filter(yeast => yeast !== null); // Remove invalid yeasts
  }

  /**
   * Validate individual yeast ingredient and set amountIsWeight based on form
   */
  validateYeast(yeast) {
    if (!yeast || typeof yeast !== 'object') {
      this.recordValidationError('yeast', 'Invalid yeast object');
      return null;
    }

    // Parse amount if present
    const amount = parseNumber(yeast.amount);
    const attenuation = parseRawPercentage(yeast.attenuation);

    // Validate amount - required for yeast calculations
    if (!isValidAmount(amount) || amount <= 0) {
      this.recordValidationError('yeast.amount', `Invalid yeast amount: ${yeast.amount}`);
      return null;
    }

    const validatedYeast = { 
      ...yeast,
      name: this.validateString(yeast.name, 'Unknown Yeast'),
      type: this.validateString(yeast.type, 'ale'),
      form: this.validateString(yeast.form, 'liquid'),
      amount,
      attenuation: isValidPercentage(attenuation) ? attenuation : this.brewingDefaults.yeastAttenuation
    };
    
    // If we don't have an amountIsWeight value but we do have a form value
    if (validatedYeast.amountIsWeight === undefined && validatedYeast.form) {
      const form = validatedYeast.form.toLowerCase().trim();
      
      // If form is "Dry", set amountIsWeight to true
      // If form is not "Dry", set amountIsWeight to false
      validatedYeast.amountIsWeight = form === 'dry';
      
      this.recordDefaultApplied('yeast.amountIsWeight', validatedYeast.amountIsWeight);
    }
    
    return validatedYeast;
  }

  validateMashSteps(steps) {
    if (!isValidArray(steps)) {
      return [];
    }
    return steps.map(step => ({
      ...step,
      stepTemp: this.validateTemperature(step.stepTemp),
      stepTime: this.validateTime(step.stepTime),
      infuseTemp: this.validateTemperature(step.infuseTemp),
      endTemp: this.validateTemperature(step.endTemp),
      rampTime: this.validateTime(step.rampTime),
      infuseAmount: this.validateVolume(step.infuseAmount)
    }));
  }

  validateTemperature(value) {
    // Parse temperature value using pure parsing
    const parsedValue = parseNumber(value);
    
    // Apply brewing domain validation using constants
    if (isValidTemperature(parsedValue)) {
      return parsedValue;
    }
    
    return undefined;
  }

  clampToRange(value, limits) {
    if (!limits || value === undefined || value === null) {
      return value;
    }
    return Math.max(limits.min, Math.min(limits.max, value));
  }

  preserveBrewfatherFields(source, target) {
    const brewfatherFields = [
      'BF_FERMENTATION_PROFILE_ID',
      'BF_FERMENTATION_PROFILE_NAME'
    ];

    brewfatherFields.forEach(field => {
      if (source[field] !== undefined) {
        target[field] = source[field];
      }
    });
  }

  // Validation tracking methods

  /**
   * Set validation context for tracking applied defaults and errors
   * @param {Object|null} context - Validation context object
   */
  setValidationContext(context) {
    this.validationContext = context;
  }

  /**
   * Record when a default value was applied during validation
   * @param {string} field - Field name
   * @param {any} value - Default value applied
   */
  recordDefaultApplied(field, value) {
    if (this.validationContext) {
      this.validationContext.defaultsApplied.push({ field, value });
    }
  }

  /**
   * Record when a value was sanitized/clamped during validation
   * @param {string} field - Field name
   * @param {any} original - Original value
   * @param {any} sanitized - Sanitized value
   */
  recordSanitizedValue(field, original, sanitized) {
    if (this.validationContext) {
      this.validationContext.sanitizedValues.push({ field, original, sanitized });
    }
  }

  /**
   * Record validation errors (non-fatal issues)
   * @param {string} field - Field name
   * @param {string} error - Error description
   */
  recordValidationError(field, error) {
    if (this.validationContext) {
      this.validationContext.validationErrors.push({ field, error });
    }
  }

  // Water calculation validation methods (migrated from UnifiedValidator)

  /**
   * Validate water calculation inputs with comprehensive checks
   * @param {Object} inputs - Water calculation input data
   * @returns {Object} Validation result with sanitized inputs and issues
   */
  validateWaterCalculationInputs(inputs) {
    if (!inputs || typeof inputs !== 'object') {
      throw new ValidationError('Water calculation inputs must be an object', {
        userMessage: 'Invalid water calculation data provided.',
        details: { validator: 'recipe-validator', inputType: typeof inputs }
      });
    }

    const warnings = [];
    const errors = [];
    const validatedInputs = { ...inputs };

    // Validate basic volume requirements
    if (!inputs.batchSizeL || inputs.batchSizeL <= 0) {
      errors.push('Batch size must be greater than 0');
    } else {
      const batchResult = this.validateVolume(
        inputs.batchSizeL,
        null,
        { fieldName: 'batchSize', unit: 'L' }
      );
      validatedInputs.batchSizeL = batchResult;
    }

    if (!inputs.boilSizeL || inputs.boilSizeL <= 0) {
      warnings.push('Boil size not specified or invalid');
    } else {
      const boilResult = this.validateVolume(
        inputs.boilSizeL,
        null,
        { fieldName: 'boilSize', unit: 'L' }
      );
      validatedInputs.boilSizeL = boilResult;
    }

    // Validate grain data
    if (inputs.grainData) {
      if (inputs.grainData.totalGrainWeight <= 0) {
        warnings.push('No grain detected in recipe');
      }

      // Validate grain displacement calculation
      if (inputs.grainData.grainDisplacementL < 0) {
        warnings.push('Negative grain displacement calculated - check grain weights');
        validatedInputs.grainData.grainDisplacementL = 0;
      }
    } else {
      warnings.push('No grain data provided');
    }

    // Validate system type
    if (!inputs.systemType || !inputs.systemType.type) {
      warnings.push('Unable to classify brewing system type');
    }

    // Validate equipment data using equipment validator
    if (inputs.equipment) {
      const equipmentValidation = this.validateEquipmentData(
        inputs.equipment,
        inputs.systemType
      );
      validatedInputs.equipment = equipmentValidation.validatedEquipment;
      warnings.push(...equipmentValidation.warnings);
      errors.push(...equipmentValidation.errors);
    }

    // Validate mash water data
    if (inputs.mashWaterData) {
      if (inputs.mashWaterData.totalMashWaterL < 0) {
        warnings.push('Negative total mash water calculated');
        validatedInputs.mashWaterData.totalMashWaterL = 0;
      }

      if (inputs.mashWaterData.spargeWaterL < 0) {
        warnings.push('Negative sparge water calculated');
        validatedInputs.mashWaterData.spargeWaterL = 0;
      }

      // Validate water-to-grain ratio if provided
      if (inputs.mashWaterData.waterGrainRatioQt) {
        const ratioResult = this.validateRange(
          inputs.mashWaterData.waterGrainRatioQt,
          { min: 0.5, max: 5.0 },
          { unit: 'qt/lb', fieldName: 'waterGrainRatio', returnValidationResult: true }
        );
        validatedInputs.mashWaterData.waterGrainRatioQt = ratioResult.value;
        warnings.push(...ratioResult.warnings);
        errors.push(...ratioResult.errors);
      }
    }

    // Validate sparge-specific parameters
    if (inputs.spargeDetection) {
      if (inputs.spargeDetection.usesSparge && inputs.mashWaterData) {
        // Validate sparge water balance
        const totalWater = inputs.mashWaterData.strikeWaterL + inputs.mashWaterData.spargeWaterL;
        if (totalWater > 0) {
          const strikeRatio = inputs.mashWaterData.strikeWaterL / totalWater;
          
          if (strikeRatio < MIN_STRIKE_RATIO && inputs.mashWaterData.spargeWaterL > 0) {
            warnings.push(`Strike water ratio (${(strikeRatio * 100).toFixed(1)}%) is very low - consider increasing strike water`);
          } else if (strikeRatio > MAX_STRIKE_RATIO && inputs.mashWaterData.spargeWaterL > 0) {
            warnings.push(`Strike water ratio (${(strikeRatio * 100).toFixed(1)}%) is very high - sparge volume may be too low`);
          }
        }

        // Check for unreasonably high sparge volume
        if (inputs.mashWaterData.spargeWaterL > inputs.boilSizeL * MAX_SPARGE_RATIO) {
          warnings.push(`Sparge volume (${inputs.mashWaterData.spargeWaterL.toFixed(2)}L) is very high (>75% of target volume)`);
        }
      }
    }

    // Validate water balance with batch-size-relative tolerance
    if (validatedInputs.batchSizeL && validatedInputs.boilSizeL) {
      const batchSizeTolerance = Math.max(0.1, validatedInputs.batchSizeL * BATCH_SIZE_TOLERANCE_PERCENT);
      const volumeDifference = Math.abs(validatedInputs.boilSizeL - validatedInputs.batchSizeL);
      
      if (volumeDifference < batchSizeTolerance) {
        warnings.push('Boil size and batch size are very similar - check evaporation calculations');
      }
    }

    return {
      validatedInputs,
      warnings,
      errors,
      isValid: errors.length === 0
    };
  }

  /**
   * Validate boil-off rate against physical constraints
   * @param {number} boilOffRateLHr - Boil-off rate in liters per hour
   * @returns {Object} Validation result with warnings/errors
   */
  validateBoilOffRate(boilOffRateLHr) {
    return this.validateRange(boilOffRateLHr, {
      min: 0,
      max: 20,
      warnMin: BOIL_OFF_RATE_MIN_L_HR,
      warnMax: BOIL_OFF_RATE_MAX_L_HR
    }, {
      unit: 'L/hr',
      fieldName: 'Boil-off rate',
      returnValidationResult: true
    });
  }

  /**
   * Validate mineral content values for water profiles
   * @param {Object} waterProfile - Water profile with mineral content
   * @returns {Object} Validated water profile with warnings/errors
   */
  validateWaterProfile(waterProfile) {
    if (!waterProfile || typeof waterProfile !== 'object') {
      return {
        validatedProfile: {},
        warnings: ['No water profile provided'],
        errors: []
      };
    }

    const warnings = [];
    const errors = [];
    const validatedProfile = { ...waterProfile };

    const mineralFields = ['calcium', 'magnesium', 'sodium', 'chloride', 'sulfate', 'bicarbonate'];

    mineralFields.forEach(field => {
      if (waterProfile[field] !== undefined) {
        const parsedValue = parseNumber(waterProfile[field]);
        if (isValidMineralContent(parsedValue)) {
          validatedProfile[field] = parsedValue;
        } else {
          warnings.push(`Invalid ${field} value: ${waterProfile[field]}`);
          validatedProfile[field] = 0;
        }
      }
    });

    return {
      validatedProfile,
      warnings,
      errors
    };
  }

  /**
   * Validate recipe type classification for water calculations
   * @param {string} recipeType - Recipe type string
   * @param {number} totalGrainWeight - Total grain weight for context
   * @returns {Object} Classification result with validation info
   */
  validateRecipeTypeForWaterCalculations(recipeType, totalGrainWeight = 0) {
    const type = (recipeType || 'all grain').toLowerCase();
    const warnings = [];
    const errors = [];

    // Check for mismatched recipe type and grain content
    if ((type === 'all grain' || type === 'partial mash') && totalGrainWeight <= 0) {
      errors.push('Recipe must include fermentables for all-grain brewing');
    }

    if (type === 'extract' && totalGrainWeight > 0) {
      warnings.push('Extract recipe contains grain - may be mislabeled as extract recipe');
    }

    return {
      isValid: errors.length === 0,
      normalizedType: type,
      warnings,
      errors
    };
  }

  /**
   * Validate equipment data with system-specific patterns (migrated from UnifiedValidator)
   * @param {Object} equipment - Equipment object to validate
   * @param {Object} systemType - System classification for context
   * @returns {Object} Validated equipment data with warnings/errors
   */
  validateEquipmentData(equipment, systemType = {}) {
    if (!equipment || typeof equipment !== 'object') {
      return {
        validatedEquipment: {},
        warnings: ['No equipment data provided'],
        errors: []
      };
    }

    const warnings = [];
    const errors = [];
    const validatedEquipment = { ...equipment };

    // Validate boil-off rate
    if (equipment.boilOffRate !== undefined) {
      const boilOffResult = this.validateRange(
        equipment.boilOffRate,
        {
          min: 0,
          max: 20,
          warnMin: BOIL_OFF_RATE_MIN_L_HR,
          warnMax: BOIL_OFF_RATE_MAX_L_HR
        },
        { unit: 'L/hr', fieldName: 'boilOffRate', returnValidationResult: true }
      );
      validatedEquipment.boilOffRate = boilOffResult.value;
      warnings.push(...boilOffResult.warnings);
      errors.push(...boilOffResult.errors);
    }

    // Validate evaporation rate (percentage)
    if (equipment.evapRate !== undefined) {
      const evapResult = this.validateRange(
        equipment.evapRate,
        BREWING_LIMITS.percentage,
        { unit: '%', fieldName: 'evapRate', returnValidationResult: true }
      );
      validatedEquipment.evapRate = evapResult.value;
      warnings.push(...evapResult.warnings);
      errors.push(...evapResult.errors);
    }

    // Validate volume-based equipment fields
    const volumeFields = [
      'boilSize', 'batchSize', 'tunVolume', 'trubChillerLoss',
      'mashTunDeadspace', 'lauterDeadspace', 'topUpKettle',
      'topUpWater', 'fermenterLoss'
    ];

    volumeFields.forEach(field => {
      if (equipment[field] !== undefined) {
        const validated = this.validateVolume(
          equipment[field],
          null,
          { fieldName: field }
        );
        if (validated !== undefined) {
          validatedEquipment[field] = validated;
        }
      }
    });

    // System-specific validation
    if (systemType.isNoSparge && equipment.mashTunDeadspace > 1) {
      warnings.push('High mash tun deadspace for no-sparge system - consider reducing');
    }

    if (systemType.isBIAB && equipment.lauterDeadspace > 0) {
      warnings.push('Lauter deadspace not applicable for BIAB systems');
      validatedEquipment.lauterDeadspace = 0;
    }

    return {
      validatedEquipment,
      warnings,
      errors
    };
  }
}

export { RecipeValidator };