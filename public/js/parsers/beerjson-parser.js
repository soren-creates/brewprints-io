/**
 * BeerJSON Parser
 * Converts BeerJSON 1.0 format to internal recipe data structure
 * Compatible with BeerXML parser output format
 */

import { RecipeParsingError } from '../utilities/errors/application-errors.js';
import { normalizeHopUse } from '../utilities/hop-use-normalizer.js';

class BeerJSONParser {
  constructor() {
    this.supportedVersions = ['1.0'];
  }

  parseFile(jsonContent) {
    try {
      const jsonData = JSON.parse(jsonContent);
      
      // Validate BeerJSON structure - handle both string and number versions
      let versionString = null;
      if (jsonData.version !== undefined && jsonData.version !== null) {
        if (typeof jsonData.version === 'number') {
          // Convert number to string with proper decimal places
          versionString = jsonData.version.toFixed(1);
        } else {
          versionString = jsonData.version.toString();
        }
      }
      if (!versionString || !this.supportedVersions.includes(versionString)) {
        throw new RecipeParsingError(`Unsupported BeerJSON version: ${jsonData.version || 'unknown'}`, {
          userMessage: `This BeerJSON file uses version ${jsonData.version || 'unknown'}, but only version ${this.supportedVersions.join(', ')} is supported.`,
          details: { parser: 'BeerJSON', phase: 'VERSION_VALIDATION', version: jsonData.version }
        });
      }

      if (!jsonData.recipes || !Array.isArray(jsonData.recipes) || jsonData.recipes.length === 0) {
        throw new RecipeParsingError('No recipes found in BeerJSON file', {
          userMessage: 'The BeerJSON file does not contain any recipe data.',
          details: { parser: 'BeerJSON', phase: 'RECIPE_DETECTION' }
        });
      }

      // Parse the first recipe
      const recipeData = jsonData.recipes[0];
      const equipmentData = jsonData.equipments ? jsonData.equipments[0] : null;
      
      return this.parseRecipe(recipeData, equipmentData);
    } catch (error) {
      // Re-throw RecipeParsingError instances as-is
      if (error instanceof RecipeParsingError) {
        throw error;
      }
      // Handle JSON syntax errors
      if (error instanceof SyntaxError) {
        throw new RecipeParsingError('Invalid JSON format detected', {
          userMessage: 'The uploaded file is not a valid JSON file. Please check the file format.',
          details: { parser: 'BeerJSON', phase: 'JSON_PARSING', error: error.message }
        });
      }
      // Wrap other errors in RecipeParsingError
      throw new RecipeParsingError(`Failed to parse BeerJSON: ${error.message}`, {
        userMessage: 'Unable to process the BeerJSON file. The file may be corrupted or use an unsupported format.',
        details: { parser: 'BeerJSON', phase: 'GENERAL_PARSING', originalError: error.message }
      });
    }
  }

  parseRecipe(recipeData, equipmentData) {
    const recipe = {
      name: recipeData.name,
      brewer: recipeData.author,
      coauthor: recipeData.coauthor,
      description: recipeData.description,
      date: recipeData.created,
      batchSize: this.extractValue(recipeData.batch_size),
      boilSize: this.extractValue(recipeData.boil?.pre_boil_size || recipeData.boil_size),
      boilTime: this.extractValue(recipeData.boil?.boil_time || recipeData.boil_time),
      og: this.extractValue(recipeData.original_gravity),
      fg: this.extractValue(recipeData.final_gravity),
      abv: this.extractValue(recipeData.alcohol_by_volume),
      ibu: this.extractIBU(recipeData.ibu_estimate),
      srm: this.extractValue(recipeData.color_estimate),
      carbonation: this.extractValue(recipeData.carbonation),
      notes: recipeData.notes,
      type: this.mapRecipeType(recipeData.type),
      isBrewfatherExport: false,
      // BeerJSON-specific basic info fields - create efficiency object with all values
      efficiency: {
        brewhouse: this.extractValue(recipeData.efficiency?.brewhouse),
        conversion: this.extractValue(recipeData.efficiency?.conversion),
        lauter: this.extractValue(recipeData.efficiency?.lauter),
        mash: this.extractValue(recipeData.efficiency?.mash)
      },
      'beer_pH': this.extractValue(recipeData.beer_pH),
      'calories_per_pint': this.extractValue(recipeData.calories_per_pint),
      'apparent_attenuation': this.extractValue(recipeData.apparent_attenuation),
      'preBoilGravity': this.extractValue(recipeData.pre_boil_gravity),
      'postBoilGravity': this.extractValue(recipeData.post_boil_gravity),
      style: this.parseStyle(recipeData.style),
      ingredients: this.parseIngredients(recipeData.ingredients),
      mash: this.parseMash(recipeData.mash),
      fermentation: this.parseFermentation(recipeData.fermentation),
      equipment: this.parseEquipment(equipmentData, recipeData)
    };

    return recipe;
  }


  /**
   * Extract time value for fermentation (keeps days as days)
   * @param {Object|number} valueObj - BeerJSON value object or simple number
   * @returns {number|undefined} Extracted time value in days
   */
  extractFermentationTime(valueObj) {
    if (valueObj === null || valueObj === undefined) {
      return undefined;
    }
    
    // Handle simple numeric values
    if (typeof valueObj === 'number') {
      return valueObj;
    }
    
    // Handle BeerJSON {unit, value} structure
    if (valueObj && typeof valueObj === 'object' && 'value' in valueObj) {
      const value = parseFloat(valueObj.value);
      if (isNaN(value)) return undefined;
      
      const unit = valueObj.unit?.toLowerCase();
      
      // Keep days as days for fermentation formatting
      if (unit === 'day') return value;
      
      // Convert other units to days
      if (unit === 'hour' || unit === 'hr') return value / 24;
      if (unit === 'min' || unit === 'minute') return value / 1440;
      
      return value; // Assume days if no unit specified
    }
    
    return undefined;
  }

  /**
   * Extract numeric value from BeerJSON {unit, value} structure
   * @param {Object|number} valueObj - BeerJSON value object or simple number
   * @param {number} maxValue - Optional maximum value to cap at
   * @returns {number|undefined} Extracted numeric value
   */
  extractValue(valueObj) {
    if (valueObj === null || valueObj === undefined) {
      return undefined;
    }
    
    // Handle simple numeric values
    if (typeof valueObj === 'number') {
      return valueObj;
    }
    
    // Handle string numeric values
    if (typeof valueObj === 'string') {
      const value = parseFloat(valueObj);
      if (isNaN(value)) return undefined;
      return value;
    }
    
    // Handle BeerJSON {unit, value} structure
    if (valueObj && typeof valueObj === 'object' && 'value' in valueObj) {
      const value = parseFloat(valueObj.value);
      if (isNaN(value)) return undefined;
      
      // Convert units if needed (basic conversions)
      return this.convertUnits(value, valueObj.unit);
    }
    
    return undefined;
  }

  /**
   * Basic unit conversion for common BeerJSON units to internal units
   * @param {number} value - The numeric value
   * @param {string} unit - The BeerJSON unit
   * @returns {number} Converted value
   */
  convertUnits(value, unit) {
    if (!unit) return value;
    
    const unitLower = unit.toLowerCase();
    
    // Volume conversions (convert to liters)
    if (unitLower === 'ml') return value / 1000;
    if (unitLower === 'gal') return value * 3.78541; // US gallons
    
    // Weight conversions (convert to kg)
    if (unitLower === 'g') return value / 1000;
    if (unitLower === 'oz') return value * 0.0283495;
    if (unitLower === 'lb') return value * 0.453592;
    
    // Temperature conversions (convert to Celsius)
    if (unitLower === 'f' || unitLower === 'fahrenheit') {
      return (value - 32) * 5/9;
    }
    
    // Time conversions (convert to minutes for mash steps)
    if (unitLower === 'sec' || unitLower === 'second') return value / 60;
    if (unitLower === 'hour' || unitLower === 'hr') return value * 60;
    if (unitLower === 'day') return value * 1440; // Convert days to minutes for mash steps
    
    // No conversion needed
    return value;
  }

  /**
   * Extract IBU value from BeerJSON IBU estimate structure
   * @param {Object} ibuEstimate - BeerJSON IBU estimate object
   * @returns {number|undefined} IBU value
   */
  extractIBU(ibuEstimate) {
    if (!ibuEstimate) return undefined;
    
    if (typeof ibuEstimate === 'number') {
      return ibuEstimate;
    }
    
    if (ibuEstimate.value !== undefined) {
      const value = parseFloat(ibuEstimate.value);
      return isNaN(value) ? undefined : value;
    }
    
    return undefined;
  }

  /**
   * Map BeerJSON recipe type to internal format
   * @param {string} beerJsonType - BeerJSON recipe type
   * @returns {string} Internal recipe type
   */
  mapRecipeType(beerJsonType) {
    if (!beerJsonType) return undefined;
    
    const typeMap = {
      'all grain': 'All Grain',
      'partial mash': 'Partial Mash',
      'extract': 'Extract',
      'cider': 'Cider',
      'mead': 'Mead',
      'wine': 'Wine',
      'kombucha': 'Kombucha',
      'soda': 'Soda',
      'other': 'Other'
    };
    
    return typeMap[beerJsonType.toLowerCase()];
  }

  parseStyle(styleData) {
    if (!styleData) return null;

    const style = {
      name: styleData.name,
      category: styleData.category,
      categoryNumber: styleData.category_number,
      styleLetter: styleData.style_letter,
      styleGuide: styleData.style_guide,
      type: styleData.type
    };

    // Extract style ranges if available
    if (styleData.original_gravity) {
      style.ogMin = this.extractValue(styleData.original_gravity.minimum);
      style.ogMax = this.extractValue(styleData.original_gravity.maximum);
    }

    if (styleData.final_gravity) {
      style.fgMin = this.extractValue(styleData.final_gravity.minimum);
      style.fgMax = this.extractValue(styleData.final_gravity.maximum);
    }

    if (styleData.international_bitterness_units) {
      style.ibuMin = this.extractValue(styleData.international_bitterness_units.minimum);
      style.ibuMax = this.extractValue(styleData.international_bitterness_units.maximum);
    }

    if (styleData.color) {
      style.colorMin = this.extractValue(styleData.color.minimum);
      style.colorMax = this.extractValue(styleData.color.maximum);
    }

    if (styleData.alcohol_by_volume) {
      style.abvMin = this.extractValue(styleData.alcohol_by_volume.minimum);
      style.abvMax = this.extractValue(styleData.alcohol_by_volume.maximum);
    }

    if (styleData.carbonation) {
      style.carbMin = this.extractValue(styleData.carbonation.minimum);
      style.carbMax = this.extractValue(styleData.carbonation.maximum);
    }

    // BeerJSON-specific descriptive fields
    style.aroma = styleData.aroma;
    style.appearance = styleData.appearance;
    style.flavor = styleData.flavor;
    style.mouthfeel = styleData.mouthfeel;
    style.overall_impression = styleData.overall_impression;
    style.ingredients = styleData.ingredients;
    style.examples = styleData.examples;

    return style;
  }

  parseIngredients(ingredientsData) {
    if (!ingredientsData) {
      return {
        fermentables: [],
        hops: [],
        yeasts: [],
        miscs: [],
        waters: []
      };
    }

    return {
      fermentables: this.parseFermentables(ingredientsData.fermentable_additions),
      hops: this.parseHops(ingredientsData.hop_additions),
      yeasts: this.parseYeasts(ingredientsData.culture_additions),
      miscs: this.parseMiscs(ingredientsData.miscellaneous_additions),
      waters: this.parseWaters(ingredientsData.water_additions)
    };
  }

  parseFermentables(fermentableAdditions) {
    if (!Array.isArray(fermentableAdditions)) return [];

    return fermentableAdditions.map(ferm => {
      const obj = {};
      if (ferm.name) obj.name = ferm.name;
      if (ferm.type) obj.type = ferm.type;
      if (ferm.amount) obj.amount = this.extractValue(ferm.amount);
      if (ferm.yield?.fine_grind) obj.yield = this.extractValue(ferm.yield.fine_grind);
      // Handle empty yield objects by checking if yield exists but is empty
      else if (ferm.yield && Object.keys(ferm.yield).length === 0) obj.yield = undefined;
      if (ferm.yield?.coarse_fine_difference) obj.coarseFineDiff = this.extractValue(ferm.yield.coarse_fine_difference);
      if (ferm.color) obj.color = this.extractValue(ferm.color);
      if (ferm.timing?.use === 'late') obj.addAfterBoil = true;
      if (ferm.origin) obj.origin = ferm.origin;
      if (ferm.producer) obj.supplier = ferm.producer;
      if (ferm.moisture) obj.moisture = this.extractValue(ferm.moisture);
      if (ferm.diastatic_power) obj.diastaticPower = this.extractValue(ferm.diastatic_power);
      if (ferm.protein) obj.protein = this.extractValue(ferm.protein);
      if (ferm.max_in_batch) obj.maxInBatch = this.extractValue(ferm.max_in_batch);
      if (ferm.recommend_mash !== undefined) obj.recommendMash = ferm.recommend_mash;
      if (ferm.notes) obj.notes = ferm.notes;
      if (ferm.acid_content) obj.acid = this.extractValue(ferm.acid_content);
      
      // BeerJSON-specific extended fields
      if (ferm.kolbach_index) obj.kolbach_index = this.extractValue(ferm.kolbach_index);
      if (ferm.friability) obj.friability = this.extractValue(ferm.friability);
      if (ferm.di_ph) obj.di_ph = this.extractValue(ferm.di_ph);
      if (ferm.fan) obj.fan = this.extractValue(ferm.fan);
      if (ferm.fermentability) obj.fermentability = this.extractValue(ferm.fermentability);
      
      return obj;
    });
  }

  /**
   * Extract timing value from BeerJSON timing structure
   * Handles both duration and time fields used by different BeerJSON sources
   * @param {Object} timing - BeerJSON timing object
   * @returns {number|undefined} Extracted time value
   */
  extractTimingValue(timing) {
    if (!timing) return undefined;
    
    // Check for both duration and time fields (different BeerJSON structures)
    const timingData = timing.duration || timing.time;
    if (timingData === undefined || timingData === null) {
      return undefined;
    }
    
    // For hop timing, preserve original value without unit conversion for days
    if (timingData.unit && (timingData.unit.toLowerCase() === 'day' || timingData.unit.toLowerCase() === 'days')) {
      return timingData.value; // Keep days as days
    }
    
    return this.extractValue(timingData); // Convert other units
  }

  parseHops(hopAdditions) {
    if (!Array.isArray(hopAdditions)) return [];

    return hopAdditions.map(hop => {
      const obj = {};
      if (hop.name) obj.name = hop.name;
      if (hop.alpha_acid) obj.alpha = this.extractValue(hop.alpha_acid);
      if (hop.amount) obj.amount = this.extractValue(hop.amount);
      
      // Normalize hop use while preserving original for fidelity
      if (hop.timing?.use) {
        obj.originalUse = hop.timing.use; // Preserve for export
        
        // Extract timing value using centralized method
        const timeValue = this.extractTimingValue(hop.timing);
        
        const step = hop.timing?.step || null; // Extract BeerJSON step property
        
        // Use original Brewfather use if available for more accurate normalization
        const useForNormalization = hop.originalBrewfatherUse || hop.timing.use;
        const sourceFormat = hop.originalBrewfatherUse ? 'brewfather' : 'beerjson';
        
        const normalized = normalizeHopUse(useForNormalization, timeValue, sourceFormat, step);
        obj.use = normalized.use;
        obj.sourceFormat = sourceFormat;
        obj.step = normalized.step; // Store step for display purposes
        
        // Preserve original Brewfather use if available
        if (hop.originalBrewfatherUse) {
          obj.originalBrewfatherUse = hop.originalBrewfatherUse;
        }
        
        // Store the timing value used for display
        if (timeValue !== undefined) {
          obj.time = timeValue;
          // Store the unit for proper formatting
          const timingData = hop.timing.duration || hop.timing.time;
          if (timingData && timingData.unit) {
            obj.timeUnit = timingData.unit;
          }
        }
        
        // Store the original timing object for reference
        obj.timing = hop.timing;
        
        // Store normalization warnings if any
        if (normalized.warnings && normalized.warnings.length > 0) {
          obj.normalizationWarnings = normalized.warnings;
        }
      }
      
      // Store time separately if it exists (for fermentation timing)
      if (hop.timing?.time && !obj.time) {
        obj.time = this.extractValue(hop.timing.time);
      }
      if (hop.type) obj.type = hop.type;
      if (hop.form) obj.form = hop.form;
      if (hop.origin) obj.origin = hop.origin;
      if (hop.beta_acid) obj.beta = this.extractValue(hop.beta_acid);
      if (hop.hsi) obj.hsi = this.extractValue(hop.hsi);
      if (hop.notes) obj.notes = hop.notes;
      if (hop.substitutes) obj.substitutes = hop.substitutes;
      if (hop.year) obj.year = hop.year;
      if (hop.oil_total) obj.oil_total = this.extractValue(hop.oil_total);
      
      // BeerJSON-specific extended fields
      if (hop.producer) obj.producer = hop.producer;
      if (hop.product_id) obj.product_id = hop.product_id;
      if (hop.percent_lost) obj.percent_lost = this.extractValue(hop.percent_lost);
      
      // BeerJSON hop oil content - create nested oil_content object
      if (hop.oil_content) {
        obj.oil_content = {};
        if (hop.oil_content.humulene) {
          obj.humulene = this.extractValue(hop.oil_content.humulene);
          obj.oil_content.humulene = this.extractValue(hop.oil_content.humulene);
        }
        if (hop.oil_content.caryophyllene) {
          obj.caryophyllene = this.extractValue(hop.oil_content.caryophyllene);
          obj.oil_content.caryophyllene = this.extractValue(hop.oil_content.caryophyllene);
        }
        if (hop.oil_content.cohumulone) {
          obj.cohumulone = this.extractValue(hop.oil_content.cohumulone);
          obj.oil_content.cohumulone = this.extractValue(hop.oil_content.cohumulone);
        }
        if (hop.oil_content.myrcene) {
          obj.myrcene = this.extractValue(hop.oil_content.myrcene);
          obj.oil_content.myrcene = this.extractValue(hop.oil_content.myrcene);
        }
        if (hop.oil_content.farnesene) obj.oil_content.farnesene = this.extractValue(hop.oil_content.farnesene);
        if (hop.oil_content.linalool) obj.oil_content.linalool = this.extractValue(hop.oil_content.linalool);
        if (hop.oil_content.limonene) obj.oil_content.limonene = this.extractValue(hop.oil_content.limonene);
        if (hop.oil_content.nerol) obj.oil_content.nerol = this.extractValue(hop.oil_content.nerol);
        if (hop.oil_content.pinene) obj.oil_content.pinene = this.extractValue(hop.oil_content.pinene);
        if (hop.oil_content.other_oils) obj.oil_content.other_oils = this.extractValue(hop.oil_content.other_oils);
      }
      
      return obj;
    });
  }

  parseYeasts(cultureAdditions) {
    if (!Array.isArray(cultureAdditions)) return [];

    return cultureAdditions.map(culture => {
      const obj = {};
      if (culture.name) obj.name = culture.name;
      if (culture.type) obj.type = culture.type;
      if (culture.form) obj.form = culture.form;
      if (culture.amount) obj.amount = this.extractValue(culture.amount);
      
      // Map amount units - BeerJSON cultures often use 'each' for packages
      if (culture.amount && culture.amount.unit === 'each') {
        obj.displayAmount = `${culture.amount.value} pkg`;
      }
      
      // Only set amountIsWeight if form is explicitly provided
      if (culture.form) {
        obj.amountIsWeight = culture.form.toLowerCase() === 'dry';
      }
      
      if (culture.producer) obj.laboratory = culture.producer;
      if (culture.product_id) obj.productId = culture.product_id;
      
      // Create nested temperature_range object for data preview dot notation access
      if (culture.temperature_range) {
        obj.temperature_range = {};
        if (culture.temperature_range.minimum) {
          obj.minTemperature = this.extractValue(culture.temperature_range.minimum);
          obj.temperature_range.min = this.extractValue(culture.temperature_range.minimum);
        }
        if (culture.temperature_range.maximum) {
          obj.maxTemperature = this.extractValue(culture.temperature_range.maximum);
          obj.temperature_range.max = this.extractValue(culture.temperature_range.maximum);
        }
      }
      if (culture.attenuation_range?.minimum || culture.attenuation_range?.maximum) {
        // Use average of range if both available, otherwise use what's available
        const min = this.extractValue(culture.attenuation_range?.minimum);
        const max = this.extractValue(culture.attenuation_range?.maximum);
        if (min !== undefined && max !== undefined) {
          obj.attenuation = (min + max) / 2;
        } else {
          obj.attenuation = min || max;
        }
      }
      if (culture.alcohol_tolerance) obj.maxAbv = this.extractValue(culture.alcohol_tolerance);
      if (culture.notes) obj.notes = culture.notes;
      if (culture.best_for) obj.bestFor = culture.best_for;
      if (culture.max_reuse) obj.maxReuse = culture.max_reuse;
      if (culture.description) obj.description = culture.description;
      
      // BeerJSON-specific extended culture fields
      if (culture.alcohol_tolerance) obj.alcohol_tolerance = this.extractValue(culture.alcohol_tolerance);
      if (culture.flocculation) obj.flocculation = culture.flocculation;
      if (culture.best_for) obj.best_for = culture.best_for;
      if (culture.pof !== undefined) obj.pof = culture.pof;
      if (culture.glucoamylase !== undefined) obj.glucoamylase = culture.glucoamylase;
      
      return obj;
    });
  }

  parseMiscs(miscAdditions) {
    if (!Array.isArray(miscAdditions)) return [];

    return miscAdditions.map(misc => {
      const obj = {};
      if (misc.name) obj.name = misc.name;
      if (misc.type) obj.type = misc.type;
      if (misc.timing?.use) obj.use = misc.timing.use;
      // Use centralized timing extraction for consistency
      const timeValue = this.extractTimingValue(misc.timing);
      if (timeValue !== undefined) obj.time = timeValue;
      if (misc.amount) obj.amount = this.extractValue(misc.amount);
      
      // Create display amount from amount and unit
      if (misc.amount && misc.amount.unit) {
        obj.displayAmount = `${misc.amount.value} ${misc.amount.unit}`;
      }
      
      // Determine if amount is weight (most misc additions are)
      if (misc.amount?.unit) {
        const weightUnits = ['g', 'kg', 'oz', 'lb', 'tsp', 'tbsp'];
        obj.amountIsWeight = weightUnits.includes(misc.amount.unit.toLowerCase());
      }
      
      if (misc.use_for) obj.useFor = misc.use_for;
      if (misc.notes) obj.notes = misc.notes;
      
      // BeerJSON-specific extended misc fields
      if (misc.producer) obj.producer = misc.producer;
      if (misc.product_id) obj.product_id = misc.product_id;
      
      return obj;
    });
  }

  parseWaters(waterAdditions) {
    if (!Array.isArray(waterAdditions)) return [];

    return waterAdditions.map(water => {
      const obj = {};
      if (water.name) obj.name = water.name;
      if (water.amount) obj.amount = this.extractValue(water.amount);
      
      // Store both full names and chemical symbols for compatibility
      if (water.calcium) {
        const calciumValue = this.extractValue(water.calcium);
        obj.calcium = calciumValue;
        obj.Ca = calciumValue; // Add chemical symbol alias
      }
      if (water.bicarbonate) {
        const bicarbonateValue = this.extractValue(water.bicarbonate);
        obj.bicarbonate = bicarbonateValue;
        obj.HCO3 = bicarbonateValue; // Add chemical symbol alias
      }
      if (water.sulfate) {
        const sulfateValue = this.extractValue(water.sulfate);
        obj.sulfate = sulfateValue;
        obj.SO4 = sulfateValue; // Add chemical symbol alias
      }
      if (water.chloride) {
        const chlorideValue = this.extractValue(water.chloride);
        obj.chloride = chlorideValue;
        obj.Cl = chlorideValue; // Add chemical symbol alias
      }
      if (water.sodium) {
        const sodiumValue = this.extractValue(water.sodium);
        obj.sodium = sodiumValue;
        obj.Na = sodiumValue; // Add chemical symbol alias
      }
      if (water.magnesium) {
        const magnesiumValue = this.extractValue(water.magnesium);
        obj.magnesium = magnesiumValue;
        obj.Mg = magnesiumValue; // Add chemical symbol alias
      }
      
      if (water.ph) obj.ph = this.extractValue(water.ph);
      if (water.notes) obj.notes = water.notes;
      
      // BeerJSON-specific extended water fields
      if (water.producer) obj.producer = water.producer;
      if (water.carbonate) obj.carbonate = this.extractValue(water.carbonate);
      if (water.potassium) obj.potassium = this.extractValue(water.potassium);
      if (water.iron) obj.iron = this.extractValue(water.iron);
      if (water.nitrate) obj.nitrate = this.extractValue(water.nitrate);
      if (water.nitrite) obj.nitrite = this.extractValue(water.nitrite);
      if (water.fluoride) obj.fluoride = this.extractValue(water.fluoride);
      
      return obj;
    });
  }

  parseMash(mashData) {
    if (!mashData) return null;

    const mash = {};
    if (mashData.name) mash.name = mashData.name;
    if (mashData.grain_temperature) mash.grainTemp = this.extractValue(mashData.grain_temperature);
    if (mashData.sparge_temperature) mash.spargeTemp = this.extractValue(mashData.sparge_temperature);
    if (mashData.ph) mash.ph = this.extractValue(mashData.ph);
    if (mashData.notes) mash.notes = mashData.notes;
    
    // BeerJSON-specific mash pH field - use the ph field for true mash pH
    if (mashData.ph) mash.mashPH = this.extractValue(mashData.ph);
    
    mash.steps = this.parseMashSteps(mashData.mash_steps);
    return mash;
  }

  parseMashSteps(mashSteps) {
    if (!Array.isArray(mashSteps)) return [];

    return mashSteps.map(step => {
      const obj = {};
      if (step.name) obj.name = step.name;
      if (step.type) obj.type = step.type;
      if (step.infuse_amount) obj.infuseAmount = this.extractValue(step.infuse_amount);
      if (step.step_temperature) obj.stepTemp = this.extractValue(step.step_temperature);
      if (step.step_time) obj.stepTime = this.extractValue(step.step_time);
      if (step.ramp_time) obj.rampTime = this.extractValue(step.ramp_time);
      if (step.end_temperature) obj.endTemp = this.extractValue(step.end_temperature);
      if (step.description) obj.description = step.description;
      if (step.water_grain_ratio) obj.waterGrainRatio = this.extractValue(step.water_grain_ratio);
      if (step.decoction_amount) obj.decoctionAmt = this.extractValue(step.decoction_amount);
      if (step.infuse_temperature) obj.infuseTemp = this.extractValue(step.infuse_temperature);
      
      // BeerJSON-specific mash step pH fields (proper schema compliance)
      if (step.start_ph) obj.start_ph = this.extractValue(step.start_ph);
      if (step.end_ph) obj.end_ph = this.extractValue(step.end_ph);
      
      // Handle invalid BeerJSON with ph at step level for backwards compatibility
      if (step.ph) obj.pH = this.extractValue(step.ph);
      
      return obj;
    });
  }

  parseFermentation(fermentationData) {
    if (!fermentationData) return {};

    const fermentation = {};
    
    // Extract fermentation steps into simple primary/secondary structure
    if (Array.isArray(fermentationData.fermentation_steps)) {
      const steps = fermentationData.fermentation_steps;
      
      if (steps[0]) {
        fermentation.primaryTemp = this.extractValue(steps[0].start_temperature || steps[0].step_temperature);
        fermentation.primaryAge = this.extractFermentationTime(steps[0].step_time);
      }
      
      if (steps[1]) {
        fermentation.secondaryTemp = this.extractValue(steps[1].start_temperature || steps[1].step_temperature);
        fermentation.secondaryAge = this.extractFermentationTime(steps[1].step_time);
      }
      
      if (steps[2]) {
        fermentation.tertiaryTemp = this.extractValue(steps[2].start_temperature || steps[2].step_temperature);
        fermentation.tertiaryAge = this.extractFermentationTime(steps[2].step_time);
      }
      
      fermentation.fermentationStages = steps.length;
      
      // Preserve original fermentation steps for detailed formatting
      fermentation.steps = steps.map(step => ({
        name: step.name || 'Fermentation Step',
        temperature: this.extractValue(step.start_temperature || step.step_temperature),
        time: this.extractFermentationTime(step.step_time)
      }));
    }
    
    return fermentation;
  }

  parseEquipment(equipmentData, recipeData = null) {
    if (!equipmentData || !equipmentData.equipment_items) return null;

    const equipment = {};
    equipment.name = equipmentData.name || '';
    
    // Consolidate equipment items into flat structure for compatibility
    equipmentData.equipment_items.forEach(item => {
      const form = item.form?.toLowerCase();
      
      if (form === 'mash tun') {
        if (item.maximum_volume) equipment.tunVolume = this.extractValue(item.maximum_volume);
        // Note: mash tun loss is unrecoverable loss, different from mashTunDeadspace (recoverable)
        // mashTunDeadspace should be set directly on equipment object, not from loss
        if (item.weight) equipment.tunWeight = this.extractValue(item.weight);
        if (item.specific_heat) equipment.tunSpecificHeat = this.extractValue(item.specific_heat);
        if (item.grain_absorption_rate) {
          // Store grain absorption rate in notes for now
          const rate = this.extractValue(item.grain_absorption_rate);
          if (rate) {
            equipment.notes = (equipment.notes || '') + ` Grain absorption: ${rate} L/kg.`;
          }
        }
      } else if (form === 'brew kettle') {
        if (item.maximum_volume) equipment.boilSize = this.extractValue(item.maximum_volume);
        if (item.loss) equipment.trubChillerLoss = this.extractValue(item.loss);
        if (item.boil_rate_per_hour) {
          const boilRate = this.extractValue(item.boil_rate_per_hour);
          // Convert to evaporation percentage (rough estimate)
          if (boilRate && equipment.boilSize) {
            equipment.evapRate = (boilRate / equipment.boilSize) * 100;
          }
        }
      } else if (form === 'fermenter') {
        if (item.maximum_volume) equipment.batchSize = this.extractValue(item.maximum_volume);
        if (item.loss) {
          // Could be used for fermenter loss calculations
          const loss = this.extractValue(item.loss);
          if (loss) {
            equipment.notes = (equipment.notes || '') + ` Fermenter loss: ${loss} L.`;
          }
        }
      }
      
      // Add item notes to equipment notes
      if (item.notes) {
        equipment.notes = (equipment.notes || '') + ` ${item.notes}`;
      }
    });

    // Add fallbacks for missing equipment values using recipe data
    if (recipeData) {
      // If boilSize wasn't set from brew kettle, use recipe pre_boil_size
      if (!equipment.boilSize && (recipeData.boil?.pre_boil_size || recipeData.boil_size)) {
        equipment.boilSize = this.extractValue(recipeData.boil?.pre_boil_size || recipeData.boil_size);
      }
      
      // If batchSize wasn't set from fermenter, use recipe batch_size
      if (!equipment.batchSize && recipeData.batch_size) {
        equipment.batchSize = this.extractValue(recipeData.batch_size);
      }
      
      // Set equipment boil time from recipe boil time
      if (recipeData.boil?.boil_time || recipeData.boil_time) {
        equipment.boilTime = this.extractValue(recipeData.boil?.boil_time || recipeData.boil_time);
      }
    }

    // Add Brewfather-specific fields if present (set by Brewfather converter)
    if (equipmentData.mashTunDeadspace !== undefined) {
      equipment.mashTunDeadspace = equipmentData.mashTunDeadspace;
    }
    if (equipmentData.topUpWater) {
      equipment.topUpWater = equipmentData.topUpWater;
    }
    if (equipmentData.topUpKettle) {
      equipment.topUpKettle = equipmentData.topUpKettle;
    }

    // Store the equipment items array for BeerJSON compatibility
    equipment.items = equipmentData.equipment_items || [];

    // Set BeerJSON-specific defaults during parsing (validator expects these values)
    equipment.lauterDeadspace = 0;      // BeerJSON doesn't distinguish lauter deadspace
    equipment.calcBoilVolume = true;    // BeerJSON defaults to true for calculation method
    equipment.hopUtilization = 100;     // BeerJSON defaults to 100% hop utilization
    
    return equipment;
  }
}

export { BeerJSONParser };