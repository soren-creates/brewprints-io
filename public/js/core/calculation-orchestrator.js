/**
 * Calculation Orchestrator
 * Coordinates all brewing calculations and provides pre-calculated data to formatters
 * 
 * ARCHITECTURAL PATTERN: Orchestrator
 * - Single responsibility: Calculate all brewing values needed for recipe display
 * - Clear separation: Calculations happen here, formatting happens in formatter
 * - Data flow: Parser → Validator → CalculationOrchestrator → Formatter → Renderer
 */

import { calculationCoordinator } from '../calculations/calculation-coordinator.js';
import { 
  getYeastAttenuation
} from '../calculations/yeast-calculator.js';
import { 
  getRecipeFlags
} from '../utilities/data/recipe-utils.js';
import { 
  calculateTotalHopWeight,
  calculateDryHopRate,
  calculateAromaHopRate,
  getHopTimingBreakdown
} from '../calculations/hop-calculator.js';
import { 
  calculateTotalFermentablesWeight,
  calculateDiastaticPowerTotal,
  analyzeGrainBill
} from '../calculations/grain-bill-calculator.js';
import {
  calculateBuGuRatio,
  calculateSulfateChlorideRatio
} from '../calculations/recipe-metrics-calculator.js';
import { formatWeight, formatFermentableWeight } from '../formatters/unit-formatter.js';
import { CalculationError } from '../utilities/errors/application-errors.js';
import { safeExecute } from '../utilities/errors/error-utils.js';

export class CalculationOrchestrator {
  constructor() {
    this.calculationCoordinator = calculationCoordinator;
  }

  /**
   * Calculate all brewing values needed for recipe display
   * This is the main orchestration method that coordinates all calculations
   * @param {Object} validatedRecipeData - Validated recipe data from validator
   * @returns {Object} All calculated values needed for formatting
   */
  calculateAll(validatedRecipeData) {
    return safeExecute(
      () => {
        // Defensive check - ensure we have valid recipe data
        if (!validatedRecipeData || typeof validatedRecipeData !== 'object') {
          throw new CalculationError('Invalid recipe data provided to calculation orchestrator', {
            userMessage: 'Recipe data is corrupted or missing. Please try uploading the file again.',
            details: { 
              orchestrator: 'calculation-orchestrator', 
              dataType: typeof validatedRecipeData,
              dataAnalysis: {
                isNull: validatedRecipeData === null,
                isUndefined: validatedRecipeData === undefined,
                isObject: typeof validatedRecipeData === 'object',
                hasValidationMetadata: validatedRecipeData?._validation !== undefined
              },
              remediation: 'The recipe data failed validation. Try re-uploading the original recipe file.'
            }
          });
        }

        // Set the recipe in the calculation pipeline for caching
        this.calculationCoordinator.setRecipe(validatedRecipeData);
        
        // Calculate core brewing values
        const coreValues = this.calculateCoreBrewingValues(validatedRecipeData);
        
        // Calculate water volume tracking
        const waterVolumeTracking = this.calculateWaterVolumeTracking(validatedRecipeData);
        
        // Calculate estimated values
        const estimatedValues = this.calculateEstimatedValues(validatedRecipeData);
        
        // Calculate numeric values
        const numericValues = this.calculateNumericValues(validatedRecipeData);
        
        // Calculate recipe analysis
        const recipeAnalysis = this.calculateRecipeAnalysis(validatedRecipeData);
        
        // Calculate brew day measurements
        const brewDayMeasurements = this.calculateBrewDayMeasurements(validatedRecipeData);
        
        // Calculate style ranges (for fallback when recipe data is missing)
        const styleRanges = this.calculateStyleRanges(validatedRecipeData);

        return {
          coreValues,
          waterVolumeTracking,
          estimatedValues,
          numericValues,
          recipeAnalysis,
          brewDayMeasurements,
          styleRanges
        };
      },
      {
        fallback: this.getCalculationFallbacks(),
        errorType: CalculationError,
        context: { 
          operation: 'calculate-all', 
          recipeId: validatedRecipeData?.id || 'unknown' 
        }
      }
    );
  }

  /**
   * Calculate core brewing values (OG, FG, ABV, IBU, SRM, Carbonation)
   * @param {Object} recipeData - Recipe data
   * @returns {Object} Core brewing values
   */
  calculateCoreBrewingValues(recipeData) {
    return safeExecute(
      () => {
        const og = this.calculationCoordinator.getOG(recipeData);
        const fg = this.calculationCoordinator.getFG(recipeData);
        const abv = this.calculationCoordinator.getABV(recipeData);
        const ibu = this.calculationCoordinator.getIBU(recipeData);
        const srm = this.calculationCoordinator.getSRM(recipeData);
        const carbonation = this.calculationCoordinator.getCarbonation(recipeData);

        return {
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
          og: 1.050,
          fg: 1.012,
          abv: 5.0,
          ibu: 25,
          srm: 4,
          carbonation: 2.4
        },
        errorType: CalculationError,
        context: { operation: 'calculate-core-values', recipeId: recipeData.id || 'unknown' }
      }
    );
  }

  /**
   * Calculate water volume tracking data
   * @param {Object} recipeData - Recipe data
   * @returns {Object} Water volume tracking data
   */
  calculateWaterVolumeTracking(recipeData) {
    return safeExecute(
      () => this.calculationCoordinator.calculateWaterVolumeTracking(recipeData),
      {
        fallback: {
          strikeWaterFormatted: '—',
          spargeWaterFormatted: '—',
          totalMashWaterFormatted: '—',
          volumePreBoilFormatted: '—',
          volumePostBoilFormatted: '—',
          volumeToFermenterFormatted: '—',
          volumePackagingFormatted: '—'
        },
        errorType: CalculationError,
        context: { operation: 'calculate-water-volume', recipeId: recipeData.id || 'unknown' }
      }
    );
  }

  /**
   * Calculate estimated values (when recipe values are missing)
   * @param {Object} recipeData - Recipe data
   * @returns {Object} Estimated values
   */
  calculateEstimatedValues(recipeData) {
    return safeExecute(
      () => this.calculationCoordinator.calculateEstimatedValues(recipeData),
      {
        fallback: {
          estimatedOG: '—',
          estimatedFG: '—',
          estimatedABV: '—',
          yeastAttenuation: '—'
        },
        errorType: CalculationError,
        context: { operation: 'calculate-estimated-values', recipeId: recipeData.id || 'unknown' }
      }
    );
  }

  /**
   * Calculate numeric values for various calculations
   * @param {Object} recipeData - Recipe data
   * @returns {Object} Numeric values
   */
  calculateNumericValues(recipeData) {
    return safeExecute(
      () => this.calculationCoordinator.getNumericValues(recipeData),
      {
        fallback: {},
        errorType: CalculationError,
        context: { operation: 'calculate-numeric-values', recipeId: recipeData.id || 'unknown' }
      }
    );
  }

  /**
   * Calculate recipe analysis data (hop rates, grain totals, ratios, etc.)
   * @param {Object} recipeData - Recipe data
   * @returns {Object} Recipe analysis data
   */
  calculateRecipeAnalysis(recipeData) {
    return safeExecute(
      () => {
        const ingredients = recipeData.ingredients || {};
        const fermentables = ingredients.fermentables || [];
        const hops = ingredients.hops || [];
        const waters = ingredients.waters || [];
        const batchSize = recipeData.batchSize || 0;
        
        // Calculate hop analysis
        const totalHopWeight = calculateTotalHopWeight(hops);
        const dryHopRate = calculateDryHopRate(hops, batchSize);
        const aromaHopRate = calculateAromaHopRate(hops, batchSize);
        const hopBreakdown = getHopTimingBreakdown(hops);
        
        // Calculate fermentable analysis  
        const totalFermentableWeight = calculateTotalFermentablesWeight(fermentables);
        const diastaticPower = calculateDiastaticPowerTotal(fermentables);
        const grainBillAnalysis = analyzeGrainBill(fermentables);
        
        // Calculate BU/GU ratio
        const ibu = this.calculationCoordinator.getIBU(recipeData);
        const og = this.calculationCoordinator.getOG(recipeData);
        const buGuRatio = calculateBuGuRatio(ibu, og);
        
        // Calculate water chemistry if available
        let sulfateChlorideRatio = 0;
        let sourceWaterProfile = null;
        let targetWaterProfile = null;
        
        if (waters.length > 0) {
          // Parse water profiles with type prefixes (e.g., "Source: Distilled Water")
          sourceWaterProfile = waters.find(w => {
            if (!w.name) return false;
            const nameLower = w.name.toLowerCase();
            // First check for our prefixed format
            return nameLower.startsWith('source:') || 
                   // Then check for legacy/other formats
                   nameLower.includes('source') || 
                   nameLower.includes('base') ||
                   nameLower.includes('distilled');
          });
          
          // If not found by keywords, use first water profile as source
          if (!sourceWaterProfile && waters.length > 0) {
            sourceWaterProfile = waters[0];
          }
          
          // Look for target water profile
          targetWaterProfile = waters.find(w => {
            if (!w.name) return false;
            const nameLower = w.name.toLowerCase();
            // First check for our prefixed format
            return nameLower.startsWith('target:') || 
                   // Then check for legacy/other formats
                   nameLower.includes('target') || 
                   nameLower.includes('profile') ||
                   nameLower.includes('style');
          });
          
          // If not found by keywords and we have multiple waters, use second as target
          if (!targetWaterProfile && waters.length > 1) {
            targetWaterProfile = waters[1];
          }
          
          // Calculate sulfate:chloride ratio from target profile (or source if no target)
          sulfateChlorideRatio = calculateSulfateChlorideRatio(targetWaterProfile || sourceWaterProfile);
        }
        
        
        return {
          // Hop analysis
          totalHopWeight,
          totalHopWeightFormatted: totalHopWeight > 0 ? formatWeight(totalHopWeight / 1000, 'oz') : '0.0 oz',
          dryHopRate,
          dryHopRateFormatted: dryHopRate > 0 ? `${dryHopRate.toFixed(2)} g/L` : '0.00 g/L',
          aromaHopRate,
          aromaHopRateFormatted: aromaHopRate > 0 ? `${aromaHopRate.toFixed(2)} g/L` : '0.00 g/L',
          hopBreakdown,
          
          // Fermentable analysis
          totalFermentableWeight,
          totalFermentableWeightFormatted: totalFermentableWeight > 0 ? formatFermentableWeight(totalFermentableWeight) : '0 oz',
          diastaticPower,
          diastaticPowerFormatted: diastaticPower > 0 ? `${diastaticPower.toFixed(0)}°L` : '0°L',
          grainBillAnalysis,
          
          // Recipe ratios
          buGuRatio,
          buGuRatioFormatted: buGuRatio > 0 ? buGuRatio.toFixed(2) : '0.00',
          
          // Water chemistry
          sulfateChlorideRatio,
          sulfateChlorideRatioFormatted: sulfateChlorideRatio > 0 ? 
            (sulfateChlorideRatio === Infinity ? '∞' : `${sulfateChlorideRatio.toFixed(1)}:1`) : '0:1',
          sourceWaterProfile,
          targetWaterProfile
        };
      },
      {
        fallback: {
          totalHopWeight: 0,
          totalHopWeightFormatted: '0.0 oz',
          dryHopRate: 0,
          dryHopRateFormatted: '0.00 g/L',
          aromaHopRate: 0,
          aromaHopRateFormatted: '0.00 g/L',
          hopBreakdown: { bittering: 0, flavor: 0, aroma: 0, dryHop: 0, total: 0 },
          totalFermentableWeight: 0,
          totalFermentableWeightFormatted: '0 oz',
          diastaticPower: 0,
          diastaticPowerFormatted: '0°L',
          grainBillAnalysis: { totalWeight: 0, basePercent: 0, specialtyPercent: 0, adjunctPercent: 0 },
          buGuRatio: 0,
          buGuRatioFormatted: '0.00',
          sulfateChlorideRatio: 0,
          sulfateChlorideRatioFormatted: '0:1',
          sourceWaterProfile: null,
          targetWaterProfile: null
        },
        errorType: CalculationError,
        context: { operation: 'calculate-recipe-analysis', recipeId: recipeData.id || 'unknown' }
      }
    );
  }

  /**
   * Calculate brew day measurements
   * @param {Object} recipeData - Recipe data
   * @returns {Object} Brew day measurements
   */
  calculateBrewDayMeasurements(recipeData) {
    return safeExecute(
      () => ({
        firstRunningsGravityFormatted: this.calculationCoordinator.calculateFirstRunningsGravityFormatted(recipeData),
        lastRunningsGravityFormatted: this.calculationCoordinator.calculateLastRunningsGravityFormatted(recipeData),
        mashEfficiencyFormatted: this.calculationCoordinator.calculateMashEfficiencyFormatted(recipeData),
        preBoilGravityFormatted: this.calculationCoordinator.calculatePreBoilGravity(recipeData),
        postBoilGravityFormatted: this.calculationCoordinator.calculatePostBoilGravity(recipeData),
        brewhouseEfficiencyFormatted: this.calculationCoordinator.calculateBrewhouseEfficiency(recipeData),
        apparentAttenuationFormatted: this.calculationCoordinator.calculateApparentAttenuation(recipeData)
      }),
      {
        fallback: {
          firstRunningsGravityFormatted: '—',
          lastRunningsGravityFormatted: '—',
          mashEfficiencyFormatted: '—',
          preBoilGravityFormatted: '—',
          postBoilGravityFormatted: '—',
          brewhouseEfficiencyFormatted: '—',
          apparentAttenuationFormatted: '—'
        },
        errorType: CalculationError,
        context: { operation: 'calculate-brew-day-measurements', recipeId: recipeData.id || 'unknown' }
      }
    );
  }

  /**
   * Calculate style ranges for fallback when recipe data is missing
   * @param {Object} recipeData - Recipe data
   * @returns {Object} Style ranges including carbonation
   */
  calculateStyleRanges(recipeData) {
    return safeExecute(
      () => {
        // Get carbonation range from calculation coordinator
        const carbonationRange = this.calculationCoordinator.getCarbonationRange(recipeData);
        
        return {
          carbonationRange
        };
      },
      {
        fallback: {
          carbonationRange: {
            min: 2.0,
            max: 3.0,
            typical: 2.4
          }
        },
        errorType: CalculationError,
        context: { operation: 'calculate-style-ranges', recipeId: recipeData?.id || 'unknown' }
      }
    );
  }

  /**
   * Get recipe flags (extract, partial mash, etc.)
   * @param {Object} recipeData - Recipe data
   * @returns {Object} Recipe flags
   */
  getRecipeFlags(recipeData) {
    return safeExecute(
      () => getRecipeFlags(recipeData, recipeData.ingredients),
      {
        fallback: {},
        errorType: CalculationError,
        context: { operation: 'get-recipe-flags', recipeId: recipeData.id || 'unknown' }
      }
    );
  }

  /**
   * Get calculation fallbacks for when all calculations fail
   * @returns {Object} Fallback calculation results
   */
  getCalculationFallbacks() {
    return {
      coreValues: {
        og: 1.050,
        fg: 1.012,
        abv: 5.0,
        ibu: 25,
        srm: 4,
        carbonation: 2.4
      },
      waterVolumeTracking: {
        strikeWaterFormatted: '—',
        spargeWaterFormatted: '—',
        totalMashWaterFormatted: '—',
        volumePreBoilFormatted: '—',
        volumePostBoilFormatted: '—',
        volumeToFermenterFormatted: '—',
        volumePackagingFormatted: '—'
      },
      estimatedValues: {
        estimatedOG: '—',
        estimatedFG: '—',
        estimatedABV: '—',
        yeastAttenuation: '—'
      },
      numericValues: {},
      recipeAnalysis: {
        totalHopWeight: 0,
        totalHopWeightFormatted: '0.0 oz',
        dryHopRate: 0,
        dryHopRateFormatted: '0.00 g/L',
        aromaHopRate: 0,
        aromaHopRateFormatted: '0.00 g/L',
        hopBreakdown: { bittering: 0, flavor: 0, aroma: 0, dryHop: 0, total: 0 },
        totalFermentableWeight: 0,
        totalFermentableWeightFormatted: '0 oz',
        diastaticPower: 0,
        diastaticPowerFormatted: '0°L',
        grainBillAnalysis: { totalWeight: 0, basePercent: 0, specialtyPercent: 0, adjunctPercent: 0 },
        buGuRatio: 0,
        buGuRatioFormatted: '0.00',
        sulfateChlorideRatio: 0,
        sulfateChlorideRatioFormatted: '0:1',
        sourceWaterProfile: null,
        targetWaterProfile: null
      },
      brewDayMeasurements: {
        firstRunningsGravityFormatted: '—',
        lastRunningsGravityFormatted: '—',
        mashEfficiencyFormatted: '—',
        preBoilGravityFormatted: '—',
        postBoilGravityFormatted: '—',
        brewhouseEfficiencyFormatted: '—',
        apparentAttenuationFormatted: '—'
      },
      styleRanges: {
        carbonationRange: {
          min: 2.0,
          max: 3.0,
          typical: 2.4
        }
      }
    };
  }
}