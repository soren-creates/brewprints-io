/**
 * Recipe Data Formatter
 * Handles all data formatting for display without complex inheritance
 */

// Import calculation modules - calculation pipeline import removed to eliminate backwards dependencies
import { 
  calculateTotalFermentableWeight,
  getRecipeFlags
} from '../utilities/data/recipe-utils.js';
import {
  DEFAULT_OG,
  DEFAULT_FG,
  DEFAULT_ABV,
  DEFAULT_IBU,
  DEFAULT_SRM,
  DEFAULT_CARBONATION,
  DEFAULT_EFFICIENCY,
  DEFAULT_BOIL_TIME,
  DEFAULT_MASH_TIME
} from './constants.js';
import {
  formatWeight,
  formatFermentableWeight,
  formatVolume,
  formatTemperature
} from '../formatters/unit-formatter.js';
import {
  formatTime,
  formatDays,
  formatMashTime
} from '../formatters/time-formatter.js';
import {
  formatFermentable,
  formatHop,
  formatYeast,
  formatMisc
} from '../formatters/ingredient-formatter.js';
import {
  capitalizeFirst,
  toTitleCase,
  formatMashPh,
  formatSpargePh
} from '../formatters/text-formatter.js';
import {
  extractMashPh,
  extractSpargePh
} from '../utilities/data/ph-extraction-utils.js';
import {
  formatGravity,
  formatGravityRange,
  formatRange,
  formatPercentageRange,
  formatBrewDate,
  formatWaterProfile
} from '../utilities/formatting/formatting-utils.js';
import { safeExecute } from '../utilities/errors/error-utils.js';
import { ValidationError } from '../utilities/errors/application-errors.js';
import { FormatError, CalculationError } from '../utilities/errors/application-errors.js';

class RecipeFormatter {
  constructor() {
    this.units = {
      weight: 'lbs',
      volume: 'gallons',
      temperature: 'F'
    };
  }

  formatRecipe(recipeData, preCalculatedData = null) {
    return safeExecute(
      () => {
        // Defensive check - ensure we have valid recipe data
        if (!recipeData || typeof recipeData !== 'object') {
          throw new ValidationError('Invalid recipe data provided to formatter', {
            userMessage: 'Recipe data is corrupted or missing. Please try uploading the file again.',
            details: { 
              formatter: 'recipe-formatter', 
              dataType: typeof recipeData,
              dataAnalysis: {
                isNull: recipeData === null,
                isUndefined: recipeData === undefined,
                isObject: typeof recipeData === 'object',
                hasValidationMetadata: recipeData?._validation !== undefined
              },
              remediation: 'The recipe data failed validation. Try re-uploading the original recipe file.'
            }
          });
        }
        
        // Use pre-calculated data - this should always be provided by the calculation orchestrator
        if (!preCalculatedData) {
          throw new ValidationError('Pre-calculated data is required for formatting', {
            userMessage: 'Internal error: calculation data is missing. Please try again.',
            details: { 
              formatter: 'recipe-formatter',
              phase: 'formatting',
              remediation: 'The calculation orchestrator should provide pre-calculated data to the formatter.'
            }
          });
        }
        const calculatedData = preCalculatedData;
        
        // Extract data structures from pre-calculated data
        const waterVolumeTrackingData = calculatedData?.waterVolumeTracking;
        const recipeAnalysisData = calculatedData?.recipeAnalysis;
        
        // Build formatted recipe object
        const formatted = {
          ...recipeData,
          ...this.formatBasicInfo(recipeData),
          ...this.formatCalculatedValuesFromData(calculatedData),
          ...this.formatBrewDayMeasurementsFromData(calculatedData, recipeData),
          ...this.formatVolumeData(waterVolumeTrackingData),
          ...this.formatSubComponents(recipeData),
          ...this.getRecipeFlagsFromData(recipeData)
        };

        // Add estimated values as separate fields for reference
        formatted.estimatedOG = calculatedData?.estimatedValues?.estimatedOG || '—';
        formatted.estimatedFG = calculatedData?.estimatedValues?.estimatedFG || '—';
        formatted.estimatedABV = calculatedData?.estimatedValues?.estimatedABV || '—';
        formatted.yeastAttenuationFormatted = calculatedData?.estimatedValues?.yeastAttenuation || '—';

        // Add recipe analysis data
        formatted.recipeAnalysis = recipeAnalysisData;

        // Add calculatedValues property for test compatibility
        formatted.calculatedValues = {
          estimatedValues: calculatedData?.estimatedValues || {},
          numericValues: calculatedData?.numericValues || {},
          waterVolumeTracking: waterVolumeTrackingData,
          recipeAnalysis: recipeAnalysisData
        };

        // Apply carbonation range fallbacks if recipe data is missing
        if (formatted.style && calculatedData?.styleRanges?.carbonationRange) {
          const style = formatted.style;
          const carbonationRange = calculatedData.styleRanges.carbonationRange;
          
          // Priority: recipe data > orchestrator fallback > hard defaults
          if (style.carbMin === undefined || style.carbMax === undefined) {
            style.carbMin = style.carbMin ?? carbonationRange.min;
            style.carbMax = style.carbMax ?? carbonationRange.max;
            
            // Update formatted range if we added fallback values
            if (style.carbMin !== undefined && style.carbMax !== undefined) {
              style.carbRangeFormatted = formatRange(style.carbMin, style.carbMax, 1);
            }
          }
        }

        return formatted;
      },
      {
        fallback: { ...(recipeData || {}), formattingError: true },
        errorType: FormatError,
        context: { operation: 'recipe-formatting', recipeId: recipeData?.id || 'unknown' }
      }
    );
  }


  /**
   * Format calculated values using pre-calculated data
   * @param {Object} calculatedData - Pre-calculated data from orchestrator
   * @returns {Object} Formatted calculated values
   */
  formatCalculatedValuesFromData(calculatedData) {
    return safeExecute(
      () => {
        const coreValues = (calculatedData && calculatedData.coreValues) || {};
        
        return {
          ogFormatted: formatGravity(coreValues.og),
          fgFormatted: formatGravity(coreValues.fg),
          abvFormatted: `${(coreValues.abv || 0).toFixed(1)}%`,
          ibuFormatted: (coreValues.ibu || 0).toFixed(0),
          srmFormatted: (coreValues.srm || 0) < 10 ? (coreValues.srm || 0).toFixed(1) : (coreValues.srm || 0).toFixed(0),
          carbonationFormatted: (coreValues.carbonation || 0).toFixed(1),
          
          // Store raw values for subsequent calculations
          og: coreValues.og || 1.050,
          fg: coreValues.fg || 1.012,
          abv: coreValues.abv || 5.0,
          ibu: coreValues.ibu || 25,
          srm: coreValues.srm || 4,
          carbonation: coreValues.carbonation || 2.4
        };
      },
      {
        fallback: {
          ogFormatted: '1.050',
          fgFormatted: '1.012',
          abvFormatted: '5.0%',
          ibuFormatted: '25',
          srmFormatted: '4',
          carbonationFormatted: '2.4',
          og: 1.050,
          fg: 1.012,
          abv: 5.0,
          ibu: 25,
          srm: 4,
          carbonation: 2.4
        },
        errorType: FormatError,
        context: { operation: 'format-calculated-values-from-data' }
      }
    );
  }

  /**
   * Format brew day measurements using pre-calculated data
   * @param {Object} calculatedData - Pre-calculated data from orchestrator
   * @returns {Object} Formatted brew day measurements
   */
  formatBrewDayMeasurementsFromData(calculatedData, recipeData) {
    return safeExecute(
      () => {
        const brewDayMeasurements = (calculatedData && calculatedData.brewDayMeasurements) || {};
        
        // Extract pH values first, then format them
        const mashPhValue = extractMashPh(recipeData?.mash);
        const spargePhValue = extractSpargePh(recipeData?.mash);
        
        return {
          mashPhFormatted: formatMashPh(mashPhValue), // Format extracted mash pH
          spargePhFormatted: formatSpargePh(spargePhValue), // Format extracted sparge pH
          firstRunningsGravityFormatted: brewDayMeasurements.firstRunningsGravityFormatted || '—',
          lastRunningsGravityFormatted: brewDayMeasurements.lastRunningsGravityFormatted || '—',
          mashEfficiencyFormatted: brewDayMeasurements.mashEfficiencyFormatted || '—',
          preBoilGravityFormatted: brewDayMeasurements.preBoilGravityFormatted || '—',
          postBoilGravityFormatted: brewDayMeasurements.postBoilGravityFormatted || '—',
          brewhouseEfficiencyFormatted: brewDayMeasurements.brewhouseEfficiencyFormatted || '—',
          apparentAttenuationFormatted: brewDayMeasurements.apparentAttenuationFormatted || '—'
        };
      },
      {
        fallback: {
          mashPhFormatted: '—',
          spargePhFormatted: '—',
          firstRunningsGravityFormatted: '—',
          lastRunningsGravityFormatted: '—',
          mashEfficiencyFormatted: '—',
          preBoilGravityFormatted: '—',
          postBoilGravityFormatted: '—',
          brewhouseEfficiencyFormatted: '—',
          apparentAttenuationFormatted: '—'
        },
        errorType: FormatError,
        context: { operation: 'format-brew-day-measurements-from-data' }
      }
    );
  }

  /**
   * Get recipe flags using safe execution
   * @param {Object} recipeData - Recipe data
   * @returns {Object} Recipe flags
   */
  getRecipeFlagsFromData(recipeData) {
    return safeExecute(
      () => getRecipeFlags(recipeData, recipeData.ingredients),
      {
        fallback: {},
        errorType: FormatError,
        context: { operation: 'get-recipe-flags-from-data' }
      }
    );
  }



  /**
   * Format boil time to always show in minutes
   * @param {number} minutes - Boil time in minutes
   * @returns {string} Formatted boil time in minutes
   */
  formatBoilTime(minutes) {
    if (minutes === undefined || minutes === null || isNaN(minutes)) return `${DEFAULT_BOIL_TIME} min`;
    return `${Math.round(minutes)} min`;
  }

  /**
   * Format basic recipe information
   * @param {Object} recipeData - Raw recipe data
   * @returns {Object} Formatted basic info
   */
  formatBasicInfo(recipeData) {
    return safeExecute(
      () => {
        // If recipe data is explicitly null, trigger fallback behavior
        if (recipeData === null) {
          throw new ValidationError('Recipe data is null');
        }
        
        // Defensive null checks and ensure default values
        const safeRecipeData = recipeData || {};
        const type = safeRecipeData.type || 'All Grain';
        const batchSize = safeRecipeData.batchSize || 0;
        const boilSize = safeRecipeData.boilSize || 0;
        const efficiency = safeRecipeData.efficiency || DEFAULT_EFFICIENCY;
        const boilTime = safeRecipeData.boilTime || DEFAULT_BOIL_TIME;
        
        return {
          name: safeRecipeData.name || '',
          type: type,
          brewer: safeRecipeData.brewer || '—',
          notes: safeRecipeData.notes || '',
          brewDateFormatted: formatBrewDate(safeRecipeData.date) || '',
          batchSizeFormatted: batchSize > 0 ? formatVolume(batchSize) : '—',
          typeFormatted: toTitleCase(type) || 'All Grain',
          mashTimeFormatted: formatMashTime(safeRecipeData.mash, type) || `${DEFAULT_MASH_TIME} min`,
          boilTimeFormatted: this.formatBoilTime(boilTime),
          boilSizeFormatted: boilSize > 0 ? formatVolume(boilSize) : '—',
          efficiencyFormatted: `${efficiency}%`
        };
      },
      {
        fallback: {
          name: 'Untitled Recipe',
          type: 'All Grain',
          brewer: '—',
          notes: '',
          brewDateFormatted: '',
          batchSizeFormatted: '—',
          typeFormatted: 'All Grain',
          mashTimeFormatted: `${DEFAULT_MASH_TIME} min`,
          boilTimeFormatted: `${DEFAULT_BOIL_TIME} min`,
          boilSizeFormatted: '—',
          efficiencyFormatted: `${DEFAULT_EFFICIENCY}%`
        },
        errorType: FormatError,
        context: { operation: 'format-basic-info', recipeId: recipeData?.id || 'unknown' }
      }
    );
  }

  /**
   * Format calculated values (OG, FG, ABV, etc.) with simplified error handling
   * Uses guaranteed calculation methods from the pipeline for clean separation of concerns
   * @param {Object} recipeData - Raw recipe data from BeerXML or user input
   * @param {Object} calculatedData - Calculated data from brewing calculation pipeline
   * @returns {Object} Formatted calculated values with brewing domain-appropriate fallbacks
   */
  formatCalculatedValues(recipeData, calculatedData) {
    return safeExecute(
      () => {
        // Use fallback values - this method should not make calculation calls
        // All calculations should come from the calculation orchestrator
        const og = DEFAULT_OG;
        const fg = DEFAULT_FG;
        const abv = DEFAULT_ABV;
        const ibu = DEFAULT_IBU;
        const srm = DEFAULT_SRM;
        const carbonation = DEFAULT_CARBONATION;
        
        // Format values (no error handling needed here since values are guaranteed)
        return {
          ogFormatted: formatGravity(og),
          fgFormatted: formatGravity(fg),
          abvFormatted: `${abv.toFixed(1)}%`,
          ibuFormatted: ibu.toFixed(0),
          srmFormatted: srm < 10 ? srm.toFixed(1) : srm.toFixed(0),
          carbonationFormatted: carbonation.toFixed(1),
          
          // Store raw values for subsequent calculations
          og,
          fg,
          abv,
          ibu,
          srm,
          carbonation
        };
      },
      {
        fallback: {
          ogFormatted: DEFAULT_OG.toFixed(3),
          fgFormatted: DEFAULT_FG.toFixed(3),
          abvFormatted: `${DEFAULT_ABV}%`,
          ibuFormatted: DEFAULT_IBU.toString(),
          srmFormatted: DEFAULT_SRM.toString(),
          carbonationFormatted: DEFAULT_CARBONATION.toString(),
          og: DEFAULT_OG,
          fg: DEFAULT_FG,
          abv: DEFAULT_ABV,
          ibu: DEFAULT_IBU,
          srm: DEFAULT_SRM,
          carbonation: DEFAULT_CARBONATION
        },
        errorType: FormatError,
        context: { 
          operation: 'format-calculated-values', 
          recipeId: recipeData.id || 'unknown'
        }
      }
    );
  }

  /**
   * Format brew day measurements
   * @param {Object} recipeData - Raw recipe data
   * @returns {Object} Formatted brew day measurements
   */
  formatBrewDayMeasurements(recipeData) {
    return safeExecute(
      () => {
        // Extract pH value first, then format it
        const mashPhValue = extractMashPh(recipeData?.mash);
        
        return {
          mashPhFormatted: formatMashPh(mashPhValue),
          // Use fallback values - this method should not make calculation calls
          // All calculations should come from the calculation orchestrator
          firstRunningsGravityFormatted: '—',
          lastRunningsGravityFormatted: '—',
          mashEfficiencyFormatted: '—',
          preBoilGravityFormatted: '—',
          postBoilGravityFormatted: '—',
          brewhouseEfficiencyFormatted: '—',
          apparentAttenuationFormatted: '—'
        };
      },
      {
        fallback: {
          mashPhFormatted: '—',
          firstRunningsGravityFormatted: '—',
          lastRunningsGravityFormatted: '—',
          mashEfficiencyFormatted: '—',
          preBoilGravityFormatted: '—',
          postBoilGravityFormatted: '—',
          brewhouseEfficiencyFormatted: '—',
          apparentAttenuationFormatted: '—'
        },
        errorType: FormatError,
        context: { operation: 'format-brew-day-measurements', recipeId: recipeData.id || 'unknown' }
      }
    );
  }

  /**
   * Format volume data from water volume tracking
   * @param {Object} waterVolumeTrackingData - Water volume tracking data
   * @returns {Object} Formatted volume data
   */
  formatVolumeData(waterVolumeTrackingData) {
    return safeExecute(
      () => {
        // Handle case where waterVolumeTrackingData is undefined
        if (!waterVolumeTrackingData) {
          return {
            // Detailed Water/Wort Volume Tracking
            waterVolumeTracking: null,
            
            // Extract volume measurements from water volume tracking for Brew Day Measurements section
            preBoilVolumeFormatted: '—',
            postBoilVolumeFormatted: '—',
            fermenterVolumeFormatted: '—',
            packagingVolumeFormatted: '—'
          };
        }
        
        return {
          // Detailed Water/Wort Volume Tracking
          waterVolumeTracking: waterVolumeTrackingData,
          
          // Extract volume measurements from water volume tracking for Brew Day Measurements section
          preBoilVolumeFormatted: waterVolumeTrackingData.volumePreBoilFormatted || '—',
          postBoilVolumeFormatted: waterVolumeTrackingData.volumePostBoilFormatted || '—',
          fermenterVolumeFormatted: waterVolumeTrackingData.volumeToFermenterFormatted || '—',
          packagingVolumeFormatted: waterVolumeTrackingData.volumePackagingFormatted || '—'
        };
      },
      {
        fallback: {
          waterVolumeTracking: null,
          preBoilVolumeFormatted: '—',
          postBoilVolumeFormatted: '—',
          fermenterVolumeFormatted: '—',
          packagingVolumeFormatted: '—'
        },
        errorType: FormatError,
        context: { 
          operation: 'format-volume-data', 
          hasData: !!waterVolumeTrackingData 
        }
      }
    );
  }

  /**
   * Format sub-components (ingredients, mash, fermentation, etc.)
   * @param {Object} recipeData - Raw recipe data
   * @returns {Object} Formatted sub-components
   */
  formatSubComponents(recipeData) {
    return safeExecute(
      () => {
        return {
          // Formatted ingredients
          ingredients: this.formatIngredients(recipeData?.ingredients, recipeData),
          
          // Formatted style info
          style: this.formatStyle(recipeData?.style),
          
          // Formatted mash
          mash: this.formatMash(recipeData?.mash),
          
          // Formatted fermentation
          fermentation: this.formatFermentation(recipeData?.fermentation),
          
          // Formatted equipment
          equipment: this.formatEquipment(recipeData?.equipment)
        };
      },
      {
        fallback: {
          ingredients: null,
          style: null,
          mash: null,
          fermentation: null,
          equipment: null
        },
        errorType: FormatError,
        context: { operation: 'format-sub-components', recipeId: recipeData?.id || 'unknown' }
      }
    );
  }

  formatIngredients(ingredients, recipeData) {
    return safeExecute(
      () => {
        if (!ingredients) {
          // Use fallback structure when ingredients is null/undefined
          return {
            fermentables: [],
            hops: [],
            yeasts: [],
            miscs: [],
            waters: []
          };
        }

        const totalFermentableWeight = calculateTotalFermentableWeight(ingredients.fermentables || []);

        return {
          fermentables: safeExecute(
            () => (ingredients.fermentables || []).map(f => 
              formatFermentable(f, totalFermentableWeight)
            ),
            {
              fallback: [],
              errorType: FormatError,
              context: { operation: 'format-fermentables', count: (ingredients.fermentables || []).length }
            }
          ),
          
          hops: safeExecute(
            () => (ingredients.hops || []).map(h => 
              formatHop(h)
            ),
            {
              fallback: [],
              errorType: FormatError,
              context: { operation: 'format-hops', count: (ingredients.hops || []).length }
            }
          ),
          
          yeasts: safeExecute(
            () => (ingredients.yeasts || []).map(y => {
              // If attenuation is not provided, calculate it using brewing domain logic
              const calculatedAttenuation = (y.attenuation === undefined && recipeData) ? 
                `${getYeastAttenuation(y, recipeData).toFixed(0)}%` : null;
              
              // Use specialized ingredient formatter with brewing domain logic
              return formatYeast(y, calculatedAttenuation);
            }),
            {
              fallback: [],
              errorType: FormatError,
              context: { operation: 'format-yeasts', count: (ingredients.yeasts || []).length }
            }
          ),
          
          miscs: safeExecute(
            () => (ingredients.miscs || []).map(m => ({
              ...formatMisc(m),
              // Preserve BeerXML displayAmount when available, override if needed
              amountFormatted: m.displayAmount || (m.amount ? (m.amountIsWeight ? formatWeight(m.amount, 'g') : formatVolume(m.amount, 'fl oz')) : '—')
            })),
            {
              fallback: [],
              errorType: FormatError,
              context: { operation: 'format-miscs', count: (ingredients.miscs || []).length }
            }
          ),
          
          waters: safeExecute(
            () => (ingredients.waters || []).map(w => ({
              ...w,
              amountFormatted: w.amount ? formatVolume(w.amount) : '0 gal',
              profileFormatted: formatWaterProfile(w)
            })),
            {
              fallback: [],
              errorType: FormatError,
              context: { operation: 'format-waters', count: (ingredients.waters || []).length }
            }
          )
        };
      },
      {
        fallback: {
          fermentables: [],
          hops: [],
          yeasts: [],
          miscs: [],
          waters: []
        },
        errorType: FormatError,
        context: { operation: 'format-ingredients', hasIngredients: !!ingredients }
      }
    );
  }

  formatStyle(style) {
    return safeExecute(
      () => {
        if (style === null) {
          // Return fallback object when style is explicitly null
          return {
            name: '—',
            category: '—',
            categoryName: '—',
            fullName: 'Unknown Style',
            ogRangeFormatted: null,
            fgRangeFormatted: null,
            ibuRangeFormatted: null,
            srmRangeFormatted: null,
            abvRangeFormatted: null,
            carbRangeFormatted: null
          };
        }
        if (style === undefined) {
          // Return null when style is undefined (no data provided)
          return null;
        }

        return {
          ...style,
          // Combine category and styleLetter into category field
          category: (style.category && style.styleLetter) ? 
            `${style.category}${style.styleLetter}` : 
            (style.category || '—'),
          // Format category name with fallback
          categoryName: style.categoryName || '—',
          fullName: style.categoryNumber && style.styleLetter ? 
            `${style.categoryNumber}${style.styleLetter}. ${style.name}` : 
            (style.name || 'Unknown Style'),
          ogRangeFormatted: formatGravityRange(style.ogMin, style.ogMax),
          fgRangeFormatted: formatGravityRange(style.fgMin, style.fgMax),
          ibuRangeFormatted: formatRange(style.ibuMin, style.ibuMax),
          srmRangeFormatted: formatRange(style.srmMin, style.srmMax),
          abvRangeFormatted: formatPercentageRange(style.abvMin, style.abvMax),
          carbRangeFormatted: (style.carbMin !== undefined && style.carbMax !== undefined) ? 
            formatRange(style.carbMin, style.carbMax, 1) : null
        };
      },
      {
        fallback: null,
        errorType: FormatError,
        context: { operation: 'format-style', styleName: style?.name || 'unknown' }
      }
    );
  }

  formatMash(mash) {
    return safeExecute(
      () => {
        if (mash === null) {
          // Return fallback object when mash is explicitly null
          return {
            name: 'Single Infusion',
            grainTempFormatted: '—',
            tunTempFormatted: '—',
            spargeTempFormatted: '—',
            phFormatted: '—',
            steps: []
          };
        }
        if (mash === undefined) {
          // Return null when mash is undefined (no data provided)
          return null;
        }

        return {
          ...mash,
          grainTempFormatted: formatTemperature(mash.grainTemp),
          tunTempFormatted: formatTemperature(mash.tunTemp),
          spargeTempFormatted: formatTemperature(mash.spargeTemp),
          phFormatted: mash.ph > 0 ? mash.ph.toFixed(2) : '—',
          steps: safeExecute(
            () => mash.steps ? mash.steps.map(step => ({
              ...step,
              stepTempFormatted: formatTemperature(step.stepTemp),
              stepTimeFormatted: formatTime(step.stepTime),
              infuseAmountFormatted: step.infuseAmount ? formatVolume(step.infuseAmount, 'gal') : '0 gal',
              infuseTempFormatted: formatTemperature(step.infuseTemp),
              endTempFormatted: formatTemperature(step.endTemp),
              rampTimeFormatted: formatTime(step.rampTime),
              typeFormatted: toTitleCase(step.type || 'Infusion'),
              // Add instruction formatting for each step
              instructionFormatted: step.stepTemp && step.stepTime ? 
                `${toTitleCase(step.type || 'Infusion')} mash at ${formatTemperature(step.stepTemp)} for ${formatTime(step.stepTime)}` : 
                'Mash step'
            })) : [],
            {
              fallback: [],
              errorType: FormatError,
              context: { operation: 'format-mash-steps', stepCount: mash.steps?.length || 0 }
            }
          )
        };
      },
      {
        fallback: null,
        errorType: FormatError,
        context: { operation: 'format-mash', hasMash: !!mash }
      }
    );
  }

  formatFermentation(fermentation) {
    return safeExecute(
      () => {
        if (fermentation === null) {
          // Return fallback object when fermentation is explicitly null
          return {
            name: 'Ale Fermentation',
            primaryAgeFormatted: '—',
            primaryTempFormatted: '—',
            secondaryAgeFormatted: '—',
            secondaryTempFormatted: '—',
            tertiaryAgeFormatted: '—',
            tertiaryTempFormatted: '—',
            ageFormatted: '—',
            ageTempFormatted: '—',
            steps: []
          };
        }
        if (fermentation === undefined) {
          // Return null when fermentation is undefined (no data provided)
          return null;
        }

        return {
          ...fermentation,
          primaryAgeFormatted: formatDays(fermentation.primaryAge),
          primaryTempFormatted: formatTemperature(fermentation.primaryTemp),
          secondaryAgeFormatted: formatDays(fermentation.secondaryAge),
          secondaryTempFormatted: formatTemperature(fermentation.secondaryTemp),
          tertiaryAgeFormatted: formatDays(fermentation.tertiaryAge),
          tertiaryTempFormatted: formatTemperature(fermentation.tertiaryTemp),
          ageFormatted: formatDays(fermentation.age),
          ageTempFormatted: formatTemperature(fermentation.ageTemp),
          steps: fermentation.steps ? 
            fermentation.steps.map(step => ({
              ...step,
              tempFormatted: formatTemperature(step.temperature),
              ageFormatted: step.time ? `${step.time} days` : '—'
            })) : 
            this.generateFermentationStageSteps(fermentation, formatTemperature)
        };
      },
      {
        fallback: null,
        errorType: FormatError,
        context: { operation: 'format-fermentation', hasFermentation: !!fermentation }
      }
    );
  }

  /**
   * Generate fermentation stage steps for detailed fermentation display
   * @param {Object} fermentation - Fermentation data object
   * @param {Function} formatTemperature - Function to format temperature
   * @returns {Array} Array of fermentation stage objects
   */
  generateFermentationStageSteps(fermentation, formatTemperature) {
    if (!fermentation) return [];
    
    const steps = [];
    
    // Primary stage (always present if fermentation stages >= 1)
    if (fermentation.fermentationStages >= 1 && fermentation.primaryAge > 0) {
      steps.push({
        name: 'Primary',
        temp: fermentation.primaryTemp,
        tempFormatted: formatTemperature(fermentation.primaryTemp),
        age: fermentation.primaryAge,
        ageFormatted: `${fermentation.primaryAge} days`
      });
    }
    
    // Secondary stage (if fermentation stages >= 2)
    if (fermentation.fermentationStages >= 2 && fermentation.secondaryAge > 0) {
      steps.push({
        name: 'Secondary',
        temp: fermentation.secondaryTemp,
        tempFormatted: formatTemperature(fermentation.secondaryTemp),
        age: fermentation.secondaryAge,
        ageFormatted: `${fermentation.secondaryAge} days`
      });
    }
    
    // Tertiary stage (if fermentation stages >= 3)
    if (fermentation.fermentationStages >= 3 && fermentation.tertiaryAge > 0) {
      steps.push({
        name: 'Tertiary',
        temp: fermentation.tertiaryTemp,
        tempFormatted: formatTemperature(fermentation.tertiaryTemp),
        age: fermentation.tertiaryAge,
        ageFormatted: `${fermentation.tertiaryAge} days`
      });
    }
    
    return steps;
  }

  formatEquipment(equipment) {
    return safeExecute(
      () => {
        if (equipment === null) {
          // Return fallback object when equipment is explicitly null
          return {
            name: 'Standard Equipment',
            boilSizeFormatted: '—',
            batchSizeFormatted: '—',
            tunVolumeFormatted: '—',
            evapRateFormatted: '—',
            efficiencyFormatted: '—',
            boilTimeFormatted: '—'
          };
        }
        if (equipment === undefined) {
          // Return null when equipment is undefined (no data provided)
          return null;
        }

        return {
          ...equipment,
          boilSizeFormatted: formatVolume(equipment.boilSize),
          batchSizeFormatted: formatVolume(equipment.batchSize),
          tunVolumeFormatted: formatVolume(equipment.tunVolume),
          mashTunVolumeFormatted: formatVolume(equipment.mashTunVolume),
          mashTunDeadspaceFormatted: formatVolume(equipment.mashTunDeadspace),
          lauterDeadspaceFormatted: formatVolume(equipment.lauterDeadspace),
          boilOffRateFormatted: equipment.boilOffRate ? `${equipment.boilOffRate} L/hr` : '—',
          evapRateFormatted: `${equipment.evapRate || 0}%/hr`,
          fermenterVolumeFormatted: formatVolume(equipment.fermenterVolume),
          fermenterLossFormatted: formatVolume(equipment.fermenterLoss),
          trubChillerLossFormatted: formatVolume(equipment.trubChillerLoss),
          efficiencyFormatted: `${equipment.efficiency || 0}%`,
          boilTimeFormatted: this.formatBoilTime(equipment.boilTime)
        };
      },
      {
        fallback: null,
        errorType: FormatError,
        context: { operation: 'format-equipment', hasEquipment: !!equipment }
      }
    );
  }
}

export { RecipeFormatter };
