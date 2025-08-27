/**
 * Calculation Coordinator - Technical Coordination Pattern
 * 
 * Manages calculation dependencies and caching to avoid redundant calculations.
 * 
 * ARCHITECTURAL PATTERN: Coordinator
 * - Coordinates individual atomic calculations with caching and dependency management
 * - Uses errorHandler.handleError() for complex error scenarios with context
 * - Provides technical calculation services to the main CalculationOrchestrator
 * - Handles recipe-level state and fallback strategies
 * - Can delegate to atomic calculators or handle errors directly
 */

import { calculateWaterVolumeTracking } from './water-volume-calculator.js';
import { 
  calculateBrewhouseEfficiency, 
  calculateMashEfficiencyFormatted
} from './efficiency-calculator.js';
import {
  calculateApparentAttenuation,
  getEstimatedYeastAttenuation,
} from './yeast-calculator.js';
import { 
  calculatePreBoilGravity, 
  calculatePostBoilGravity,
  calculateEstimatedOG, 
  calculateEstimatedFG, 
  calculateEstimatedABV,
  calculateEstimatedValues,
  calculateFirstRunningsGravityFormatted,
  calculateLastRunningsGravityFormatted
} from './gravity-calculator.js';
import { 
  isValidGravity, 
  parseRawGravity,
  isValidABV
} from '../utilities/validation/validation-utils.js';
import { 
  calculateEstimatedIBU, 
  getNumericIBU 
} from './ibu-calculator.js';
import { 
  calculateEstimatedSRM, 
  getNumericSRM 
} from './srm-calculator.js';
import { 
  calculateEstimatedCarbonation, 
  getNumericCarbonation,
  getCarbonationRange
} from './carbonation-calculator.js';
import { 
  DEFAULT_OG,
  DEFAULT_FG,
  DEFAULT_ABV,
  DEFAULT_IBU,
  DEFAULT_SRM,
  DEFAULT_CARBONATION
} from '../core/constants.js';
import { errorHandler } from '../utilities/errors/error-handler.js';

export class CalculationCoordinator {
  constructor() {
    this.cache = new Map();
    this.currentRecipeId = null;
  }

  /**
   * Set the current recipe and clear cache if it's a new recipe
   * @param {Object} recipeData - Recipe data object
   */
  setRecipe(recipeData) {
    const recipeId = this.generateRecipeId(recipeData);
    if (this.currentRecipeId !== recipeId) {
      this.clearCache();
      this.currentRecipeId = recipeId;
    }
  }

  /**
   * Generate a simple recipe ID for cache management
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Recipe ID
   */
  generateRecipeId(recipeData) {
    return `${recipeData.name || 'unnamed'}_${recipeData.og || 1.000}_${recipeData.batchSize || 5}`;
  }

  /**
   * Clear the calculation cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cached result or calculate and cache
   * @param {string} key - Cache key
   * @param {Function} calculator - Function to calculate result
   * @param {Array} args - Arguments for calculator function
   * @returns {*} Calculated result
   */
  getCachedOrCalculate(key, calculator, ...args) {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    try {
      const result = calculator(...args);
      this.cache.set(key, result);
      return result;
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'calculation',
        calculator: key,
        arguments: args
      });
      throw error; // Re-throw to allow proper error testing
    }
  }

  /**
   * Generic wrapper for brewing calculations with fallback patterns
   * @param {Object} config - Configuration object
   * @param {Object} config.recipeData - Recipe data object
   * @param {string} config.operation - Operation name for error handling
   * @param {string} config.existingValueKey - Key to check for existing value in recipe
   * @param {Function} config.validator - Validation function for existing value
   * @param {Function} config.calculator - Calculation function
   * @param {Function} config.parser - Parser function for string values
   * @param {*} config.fallback - Fallback value if all else fails
   * @param {Function} [config.specialCheck] - Optional special validation function
   * @returns {*} Valid calculated value (guaranteed)
   */
  getValidBrewingValue(config) {
    const {
      recipeData,
      operation,
      existingValueKey,
      validator,
      calculator,
      parser,
      fallback,
      specialCheck
    } = config;

    try {
      // Apply special check first if provided (e.g., IBU no-hops check)
      if (specialCheck) {
        const specialResult = specialCheck(recipeData);
        if (specialResult !== undefined) {
          return specialResult;
        }
      }

      // Use existing recipe value if available and valid
      if (recipeData[existingValueKey] !== undefined && validator(recipeData[existingValueKey])) {
        return recipeData[existingValueKey];
      }
      
      // Try to calculate
      const calculated = calculator(recipeData);
      
      // Handle different return types
      if (typeof calculated === 'number' && validator(calculated)) {
        return calculated;
      }
      
      if (typeof calculated === 'string' && parser) {
        const parsed = parser(calculated);
        if (parsed !== undefined) {
          return parsed;
        }
      }
      
      // Brewing domain fallback
      return fallback;
    } catch (error) {
      errorHandler.handleError(error, { 
        operation, 
        recipeId: recipeData.id || 'unknown' 
      });
      return fallback;
    }
  }

  /**
   * Calculate water volume tracking with caching and fallback
   * @param {Object} recipeData - Recipe data object
   * @returns {Object} Water volume tracking data
   */
  calculateWaterVolumeTracking(recipeData) {
    try {
      return this.getCachedOrCalculate(
        'waterVolumeTracking',
        calculateWaterVolumeTracking,
        recipeData
      );
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'water-volume-tracking',
        recipeId: recipeData.id || 'unknown'
      });
      return {
        strikeWaterFormatted: '—',
        spargeWaterFormatted: '—',
        totalMashWaterFormatted: '—',
        volumePreBoilFormatted: '—',
        volumePostBoilFormatted: '—',
        volumeToFermenterFormatted: '—',
        volumePackagingFormatted: '—'
      };
    }
  }

  /**
   * Calculate estimated values with caching and fallback
   * @param {Object} recipeData - Recipe data object
   * @returns {Object} Estimated values
   */
  calculateEstimatedValues(recipeData) {
    try {
      return this.getCachedOrCalculate(
        'estimatedValues',
        calculateEstimatedValues,
        recipeData,
        getEstimatedYeastAttenuation
      );
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'estimated-values',
        recipeId: recipeData.id || 'unknown'
      });
      return {
        estimatedOG: '—',
        estimatedFG: '—',
        estimatedABV: '—',
        yeastAttenuation: '—'
      };
    }
  }

  /**
   * Calculate estimated OG with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted OG
   */
  calculateEstimatedOG(recipeData) {
    return this.getCachedOrCalculate(
      'estimatedOG',
      calculateEstimatedOG,
      recipeData
    );
  }

  /**
   * Calculate estimated FG with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted FG
   */
  calculateEstimatedFG(recipeData) {
    return this.getCachedOrCalculate(
      'estimatedFG',
      calculateEstimatedFG,
      recipeData,
      getEstimatedYeastAttenuation
    );
  }

  /**
   * Calculate estimated ABV with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted ABV
   */
  calculateEstimatedABV(recipeData) {
    return this.getCachedOrCalculate(
      'estimatedABV',
      calculateEstimatedABV,
      recipeData,
      getEstimatedYeastAttenuation
    );
  }

  /**
   * Calculate estimated IBU with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted IBU
   */
  calculateEstimatedIBU(recipeData) {
    return this.getCachedOrCalculate(
      'estimatedIBU',
      calculateEstimatedIBU,
      recipeData
    );
  }

  /**
   * Calculate estimated SRM with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted SRM
   */
  calculateEstimatedSRM(recipeData) {
    return this.getCachedOrCalculate(
      'estimatedSRM',
      calculateEstimatedSRM,
      recipeData
    );
  }

  /**
   * Calculate estimated carbonation with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted carbonation
   */
  calculateEstimatedCarbonation(recipeData) {
    return this.getCachedOrCalculate(
      'estimatedCarbonation',
      calculateEstimatedCarbonation,
      recipeData
    );
  }

  /**
   * Calculate pre-boil gravity with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted pre-boil gravity
   */
  calculatePreBoilGravity(recipeData) {
    try {
      return this.getCachedOrCalculate(
        'preBoilGravity',
        calculatePreBoilGravity,
        recipeData
      );
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'pre-boil-gravity',
        recipeId: recipeData.id || 'unknown'
      });
      return '—'; // Fallback for brewery measurements
    }
  }

  /**
   * Calculate post-boil gravity with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted post-boil gravity
   */
  calculatePostBoilGravity(recipeData) {
    try {
      return this.getCachedOrCalculate(
        'postBoilGravity',
        calculatePostBoilGravity,
        recipeData
      );
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'post-boil-gravity',
        recipeId: recipeData.id || 'unknown'
      });
      return '—'; // Fallback for brewery measurements
    }
  }

  /**
   * Calculate first runnings gravity with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted first runnings gravity
   */
  calculateFirstRunningsGravityFormatted(recipeData) {
    try {
      return this.getCachedOrCalculate(
        'firstRunningsGravity',
        calculateFirstRunningsGravityFormatted,
        recipeData
      );
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'first-runnings-gravity',
        recipeId: recipeData.id || 'unknown'
      });
      return '—'; // Fallback for brewery measurements
    }
  }

  /**
   * Calculate last runnings gravity with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted last runnings gravity
   */
  calculateLastRunningsGravityFormatted(recipeData) {
    try {
      return this.getCachedOrCalculate(
        'lastRunningsGravity',
        calculateLastRunningsGravityFormatted,
        recipeData
      );
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'last-runnings-gravity',
        recipeId: recipeData.id || 'unknown'
      });
      return '—'; // Fallback for brewery measurements
    }
  }

  /**
   * Calculate mash efficiency with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted mash efficiency
   */
  calculateMashEfficiencyFormatted(recipeData) {
    try {
      return this.getCachedOrCalculate(
        'mashEfficiency',
        calculateMashEfficiencyFormatted,
        recipeData
      );
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'mash-efficiency',
        recipeId: recipeData.id || 'unknown'
      });
      return '—'; // Fallback for brewery measurements
    }
  }

  /**
   * Calculate brewhouse efficiency with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted brewhouse efficiency
   */
  calculateBrewhouseEfficiency(recipeData) {
    try {
      return this.getCachedOrCalculate(
        'brewhouseEfficiency',
        calculateBrewhouseEfficiency,
        recipeData,
        calculatePostBoilGravity
      );
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'brewhouse-efficiency',
        recipeId: recipeData.id || 'unknown'
      });
      return '—'; // Fallback for brewery measurements
    }
  }

  /**
   * Calculate apparent attenuation with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {string} Formatted apparent attenuation
   */
  calculateApparentAttenuation(recipeData) {
    try {
      return this.getCachedOrCalculate(
        'apparentAttenuation',
        calculateApparentAttenuation,
        recipeData
      );
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'apparent-attenuation',
        recipeId: recipeData.id || 'unknown'
      });
      return '—'; // Fallback for brewery measurements
    }
  }

  /**
   * Get numeric values with caching and fallback
   * @param {Object} recipeData - Recipe data object
   * @returns {Object} Numeric values
   */
  getNumericValues(recipeData) {
    try {
      return this.getCachedOrCalculate(
        'numericValues',
        (data) => ({
          ibu: getNumericIBU(data) ?? data.ibu,
          srm: getNumericSRM(data) || data.srm,
          carbonation: getNumericCarbonation(data) || data.carbonation
        }),
        recipeData
      );
    } catch (error) {
      errorHandler.handleError(error, {
        operation: 'numeric-values',
        recipeId: recipeData.id || 'unknown'
      });
      return {}; // Fallback to empty object
    }
  }

  /**
   * Get carbonation range for style with caching
   * @param {Object} recipeData - Recipe data object
   * @returns {Object} Carbonation range
   */
  getCarbonationRange(recipeData) {
    return this.getCachedOrCalculate(
      'carbonationRange',
      getCarbonationRange,
      recipeData
    );
  }

  /**
   * Get OG with brewing domain fallbacks (guaranteed to return valid value)
   * @param {Object} recipeData - Recipe data object
   * @returns {number} Valid OG value (guaranteed)
   */
  getOG(recipeData) {
    return this.getValidBrewingValue({
      recipeData,
      operation: 'get-og',
      existingValueKey: 'og',
      validator: isValidGravity,
      calculator: (data) => this.calculateEstimatedOG(data),
      fallback: DEFAULT_OG // Typical all-grain OG
    });
  }

  /**
   * Get FG with brewing domain fallbacks (guaranteed to return valid value)
   * @param {Object} recipeData - Recipe data object
   * @returns {number} Valid FG value (guaranteed)
   */
  getFG(recipeData) {
    return this.getValidBrewingValue({
      recipeData,
      operation: 'get-fg',
      existingValueKey: 'fg',
      validator: isValidGravity,
      calculator: (data) => this.calculateEstimatedFG(data),
      parser: (value) => {
        const parsed = parseRawGravity(value);
        return isValidGravity(parsed) ? parsed : undefined;
      },
      fallback: DEFAULT_FG // Typical ale final gravity
    });
  }

  /**
   * Get ABV with brewing domain fallbacks (guaranteed to return valid value)
   * @param {Object} recipeData - Recipe data object
   * @returns {number} Valid ABV value (guaranteed)
   */
  getABV(recipeData) {
    return this.getValidBrewingValue({
      recipeData,
      operation: 'get-abv',
      existingValueKey: 'abv',
      validator: isValidABV,
      calculator: (data) => this.calculateEstimatedABV(data),
      fallback: DEFAULT_ABV // Typical ale ABV
    });
  }

  /**
   * Get IBU with brewing domain fallbacks (guaranteed to return valid value)
   * @param {Object} recipeData - Recipe data object
   * @returns {number} Valid IBU value (guaranteed)
   */
  getIBU(recipeData) {
    return this.getValidBrewingValue({
      recipeData,
      operation: 'get-ibu',
      existingValueKey: 'ibu',
      validator: (value) => value !== undefined && value >= 0,
      calculator: (data) => this.calculateEstimatedIBU(data),
      parser: (value) => {
        const parsed = parseFloat(value);
        return !isNaN(parsed) && parsed >= 0 ? parsed : undefined;
      },
      fallback: DEFAULT_IBU, // No hops or calculation error
      specialCheck: (data) => {
        // Critical brewing check: no hops = 0 IBU (brewing accuracy requirement)
        if (!data.ingredients?.hops || data.ingredients.hops.length === 0) {
          return DEFAULT_IBU;
        }
        return undefined; // Continue with normal processing
      }
    });
  }

  /**
   * Get SRM with brewing domain fallbacks (guaranteed to return valid value)
   * @param {Object} recipeData - Recipe data object
   * @returns {number} Valid SRM value (guaranteed)
   */
  getSRM(recipeData) {
    return this.getValidBrewingValue({
      recipeData,
      operation: 'get-srm',
      existingValueKey: 'srm',
      validator: (value) => value !== undefined && value !== null && value >= 0,
      calculator: (data) => this.calculateEstimatedSRM(data),
      parser: (value) => {
        const parsed = parseFloat(value);
        return !isNaN(parsed) && parsed >= 0 ? parsed : undefined;
      },
      fallback: DEFAULT_SRM // Pale malt baseline color
    });
  }

  /**
   * Get carbonation with brewing domain fallbacks (guaranteed to return valid value)
   * @param {Object} recipeData - Recipe data object
   * @returns {number} Valid carbonation value (guaranteed)
   */
  getCarbonation(recipeData) {
    return this.getValidBrewingValue({
      recipeData,
      operation: 'get-carbonation',
      existingValueKey: 'carbonation',
      validator: (value) => value !== undefined && value > 0,
      calculator: (data) => this.calculateEstimatedCarbonation(data),
      parser: (value) => {
        const parsed = parseFloat(value);
        return !isNaN(parsed) && parsed > 0 ? parsed : undefined;
      },
      fallback: DEFAULT_CARBONATION // Standard ale carbonation
    });
  }

  /**
   * Get cache statistics for debugging
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      currentRecipeId: this.currentRecipeId
    };
  }
}

// Create singleton instance
export const calculationCoordinator = new CalculationCoordinator();