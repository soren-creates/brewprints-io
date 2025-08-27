/**
 * Hop Use Normalizer
 * 
 * Provides unified hop use normalization across all recipe formats (BeerJSON, BeerXML, Brewfather)
 * to ensure consistent brewing calculations regardless of source format.
 * 
 * Addresses the core issue where hop rate calculations show 0.00 for Brewfather JSON recipes
 * due to incompatible hop use mappings between formats and calculators.
 */

import { errorHandler } from './errors/error-handler.js';

/**
 * Internal hop use types for brewing semantic accuracy
 */
export const INTERNAL_HOP_USES = {
  MASH: 'mash',              // Pre-boil mash additions
  FIRST_WORT: 'first_wort',  // First wort hopping
  BITTERING: 'bittering',    // Long boil (>15 min) - high utilization
  FLAVOR: 'flavor',          // Medium boil (5-15 min) - medium utilization  
  AROMA: 'aroma',            // Short boil (1-5 min) - low utilization
  WHIRLPOOL: 'whirlpool',    // Post-boil hopstand/whirlpool (0 min)
  DRY_HOP: 'dry_hop',        // Post-fermentation additions
  PACKAGING: 'packaging'     // Packaging additions (bottle/keg hopping)
};

/**
 * Format-specific normalization mappings
 */
const FORMAT_MAPPINGS = {
  beerxml: {
    'mash': INTERNAL_HOP_USES.MASH,
    'first wort': INTERNAL_HOP_USES.FIRST_WORT,
    'boil': 'TIMING_ANALYSIS', // Special case - requires timing analysis
    'aroma': INTERNAL_HOP_USES.WHIRLPOOL, // BeerXML "Aroma" typically means hopstand
    'dry hop': INTERNAL_HOP_USES.DRY_HOP
  },
  brewfather: {
    'mash': INTERNAL_HOP_USES.MASH,
    'first wort': INTERNAL_HOP_USES.FIRST_WORT,
    'boil': 'TIMING_ANALYSIS', // Special case - requires timing analysis
    'aroma': INTERNAL_HOP_USES.WHIRLPOOL,
    'aroma (hopstand)': INTERNAL_HOP_USES.WHIRLPOOL,
    'hopstand': INTERNAL_HOP_USES.WHIRLPOOL,
    'whirlpool': INTERNAL_HOP_USES.WHIRLPOOL,
    'dry hop': INTERNAL_HOP_USES.DRY_HOP
  },
  beerjson: {
    'add_to_mash': INTERNAL_HOP_USES.MASH,
    'add_to_boil': 'TIMING_ANALYSIS', // Special case - requires timing analysis
    'add_to_fermentation': INTERNAL_HOP_USES.DRY_HOP,
    'add_to_package': INTERNAL_HOP_USES.PACKAGING
  }
};

/**
 * Reverse mappings for denormalization
 */
const REVERSE_MAPPINGS = {
  beerxml: {
    [INTERNAL_HOP_USES.MASH]: 'Mash',
    [INTERNAL_HOP_USES.FIRST_WORT]: 'First Wort',
    [INTERNAL_HOP_USES.BITTERING]: 'Boil',
    [INTERNAL_HOP_USES.FLAVOR]: 'Boil',
    [INTERNAL_HOP_USES.AROMA]: 'Boil',
    [INTERNAL_HOP_USES.WHIRLPOOL]: 'Aroma',
    [INTERNAL_HOP_USES.DRY_HOP]: 'Dry Hop',
    [INTERNAL_HOP_USES.PACKAGING]: 'Boil'
  },
  brewfather: {
    [INTERNAL_HOP_USES.MASH]: 'Mash',
    [INTERNAL_HOP_USES.FIRST_WORT]: 'First Wort',
    [INTERNAL_HOP_USES.BITTERING]: 'Boil',
    [INTERNAL_HOP_USES.FLAVOR]: 'Boil',
    [INTERNAL_HOP_USES.AROMA]: 'Boil',
    [INTERNAL_HOP_USES.WHIRLPOOL]: 'Aroma (Hopstand)',
    [INTERNAL_HOP_USES.DRY_HOP]: 'Dry Hop',
    [INTERNAL_HOP_USES.PACKAGING]: 'Dry Hop'
  },
  beerjson: {
    [INTERNAL_HOP_USES.MASH]: 'add_to_mash',
    [INTERNAL_HOP_USES.FIRST_WORT]: 'add_to_boil',
    [INTERNAL_HOP_USES.BITTERING]: 'add_to_boil',
    [INTERNAL_HOP_USES.FLAVOR]: 'add_to_boil',
    [INTERNAL_HOP_USES.AROMA]: 'add_to_boil',
    [INTERNAL_HOP_USES.WHIRLPOOL]: 'add_to_boil',
    [INTERNAL_HOP_USES.DRY_HOP]: 'add_to_fermentation',
    [INTERNAL_HOP_USES.PACKAGING]: 'add_to_package'
  }
};

/**
 * Cache for normalized hop use values (performance optimization)
 */
const hopUseCache = new Map();

/**
 * Normalizes hop use values from any format to internal brewing semantics
 * 
 * @param {string} rawUse - Original use value from recipe format
 * @param {number} time - Timing in minutes (for boil differentiation)
 * @param {string} sourceFormat - 'beerxml', 'brewfather', 'beerjson'
 * @param {number} step - BeerJSON step property (which fermentation step: 1=Primary, 2=Secondary, 3=Tertiary)
 * @returns {Object} Normalized result with use type and validation warnings
 */
export function normalizeHopUse(rawUse, time, sourceFormat = 'unknown', step = null) {
  if (!rawUse) {
    return {
      use: INTERNAL_HOP_USES.BITTERING, // Default fallback
      warnings: ['Missing hop use value, defaulting to bittering'],
      sourceFormat,
      originalUse: rawUse,
      step: step
    };
  }

  // Generate cache key including step
  const cacheKey = `${rawUse}|${time}|${sourceFormat}|${step}`;
  if (hopUseCache.has(cacheKey)) {
    return hopUseCache.get(cacheKey);
  }

  const result = {
    use: null,
    warnings: [],
    sourceFormat,
    originalUse: rawUse,
    step: step
  };

  const useLower = rawUse.toLowerCase().trim();

  try {
    // Use configuration-driven normalization
    const formatMapping = FORMAT_MAPPINGS[sourceFormat];
    if (formatMapping) {
      const mappedUse = formatMapping[useLower];
      if (mappedUse === 'TIMING_ANALYSIS') {
        // Special case: requires timing analysis for boil additions
        if (sourceFormat === 'beerjson' && (time === undefined || time === null)) {
          result.warnings.push('BeerJSON add_to_boil without timing data - defaulting to bittering');
          result.use = INTERNAL_HOP_USES.BITTERING;
        } else {
          result.use = analyzeBoilTiming(time);
        }
      } else if (mappedUse) {
        result.use = mappedUse;
      } else {
        result.use = INTERNAL_HOP_USES.BITTERING; // Default fallback
      }
    } else {
      // Generic normalization for unknown formats
      result.use = normalizeGenericUse(useLower, time);
      result.warnings.push(`Unknown source format: ${sourceFormat}`);
    }

    // Enhanced validation warnings for brewing accuracy
    validateHopUseAndTiming(result, useLower, time, sourceFormat);
    
    // Report validation warnings through error system if any exist
    if (result.warnings.length > 0) {
      reportValidationWarnings(result.warnings, { rawUse, time, sourceFormat, step });
    }

  } catch (error) {
    errorHandler.handleError(error, { context: 'hop-use-normalizer', rawUse, time, sourceFormat });
    result.use = INTERNAL_HOP_USES.BITTERING;
    result.warnings.push('Error during normalization, defaulted to bittering');
  }

  // Cache the result
  hopUseCache.set(cacheKey, result);
  
  return result;
}


/**
 * Generic normalization for unknown formats
 */
function normalizeGenericUse(useLower, time) {
  if (useLower.includes('mash')) return INTERNAL_HOP_USES.MASH;
  if (useLower.includes('first') && useLower.includes('wort')) return INTERNAL_HOP_USES.FIRST_WORT;
  if (useLower.includes('dry') && useLower.includes('hop')) return INTERNAL_HOP_USES.DRY_HOP;
  if (useLower.includes('whirlpool') || useLower.includes('hopstand')) return INTERNAL_HOP_USES.WHIRLPOOL;
  if (useLower.includes('aroma')) return INTERNAL_HOP_USES.WHIRLPOOL;
  if (useLower.includes('boil')) return analyzeBoilTiming(time);
  
  return INTERNAL_HOP_USES.BITTERING; // Default fallback
}

/**
 * Analyze boil timing to determine hop use type
 * NOTE: This function should only be used for generic "boil" use types
 * First wort hops should be explicitly identified, not inferred from timing
 */
function analyzeBoilTiming(time) {
  if (time === undefined || time === null) {
    return INTERNAL_HOP_USES.BITTERING; // Default when no timing
  }

  // Bittering hops: 30+ minutes (includes long 90+ minute boils)
  if (time >= 30) return INTERNAL_HOP_USES.BITTERING;
  // Flavor hops: 15-29 minutes
  if (time >= 15) return INTERNAL_HOP_USES.FLAVOR;
  // Aroma hops: 0-14 minutes (includes flame-out at 0 min)
  return INTERNAL_HOP_USES.AROMA;
}

/**
 * Comprehensive validation for hop use and timing data
 * Provides brewing-specific warnings for common issues
 */
function validateHopUseAndTiming(result, useLower, time, sourceFormat) {
  // Basic timing validation
  if (useLower.includes('boil') && (time === undefined || time === null)) {
    result.warnings.push('Missing timing data with boil use - may affect IBU calculations');
  }

  // Dry hop validation
  if (result.use === INTERNAL_HOP_USES.DRY_HOP) {
    if (time === undefined || time === null) {
      result.warnings.push('Missing timing data for dry hop addition - specify duration for proper scheduling');
    } else {
      if (time > 0 && time < 1440) {
        result.warnings.push(`Dry hop timing (${time} min) seems short - expected days not minutes`);
      }
      if (time > 20160) { // More than 14 days
        result.warnings.push(`Dry hop timing (${Math.round(time/1440)} days) is unusually long - consider shorter duration`);
      }
    }
  }

  // First wort hop validation
  if (result.use === INTERNAL_HOP_USES.FIRST_WORT) {
    if (time !== undefined && time !== null && time < 75) {
      result.warnings.push(`First wort hop timing (${time} min) may be too short - typically 90+ minutes`);
    }
  }

  // Whirlpool/Hopstand validation
  if (result.use === INTERNAL_HOP_USES.WHIRLPOOL) {
    if (time !== undefined && time !== null && time > 30) {
      result.warnings.push(`Whirlpool timing (${time} min) is unusually long - typical hopstands are 0-30 minutes`);
    }
  }

  // Aroma addition validation
  if (result.use === INTERNAL_HOP_USES.AROMA) {
    if (time !== undefined && time !== null && time > 14) {
      result.warnings.push(`Aroma hop timing (${time} min) may provide more flavor than aroma - consider shorter time`);
    }
  }

  // Bittering hop validation
  if (result.use === INTERNAL_HOP_USES.BITTERING) {
    if (time !== undefined && time !== null && time < 30) {
      result.warnings.push(`Bittering hop timing (${time} min) may provide limited isomerization - consider longer boil`);
    }
  }

  // Format-specific validation
  if (sourceFormat === 'beerjson') {
    if (useLower === 'add_to_boil' && (time === undefined || time === null)) {
      result.warnings.push('BeerJSON add_to_boil requires timing data for proper hop utilization calculation');
    }
    if (useLower === 'add_to_fermentation' && (time === undefined || time === null)) {
      result.warnings.push('BeerJSON add_to_fermentation should specify duration for scheduling');
    }
  }

  // Brewfather-specific validation
  if (sourceFormat === 'brewfather') {
    if (useLower.includes('aroma') && (time === undefined || time === null)) {
      result.warnings.push('Brewfather aroma additions should specify timing for accurate representation');
    }
  }

  // Cross-validation: timing consistency with use type
  if (time !== undefined && time !== null) {
    if (useLower.includes('dry') && time > 0 && time < 720) { // Less than 12 hours but not zero
      result.warnings.push(`Timing (${time} min) conflicts with dry hop use - dry hopping typically requires hours/days`);
    }
    if (useLower.includes('mash') && time > 120) { // More than 2 hours
      result.warnings.push(`Mash hop timing (${time} min) is unusually long - typical mash times are 60-90 minutes`);
    }
  }

  // Negative time validation
  if (time !== undefined && time !== null && time < 0) {
    result.warnings.push(`Invalid negative timing (${time} min) - using absolute value`);
  }
}

/**
 * Report validation warnings through the error handling system
 * @param {Array} warnings - Array of warning messages
 * @param {Object} context - Context information about the hop being validated
 */
function reportValidationWarnings(warnings, context) {
  // Group similar warnings and report through error system
  warnings.forEach(warning => {
    try {
      // Create a validation warning that integrates with the error system
      const validationError = new Error(`Hop validation: ${warning}`);
      validationError.name = 'HopValidationWarning';
      
      // Use the error handler in silent mode for warnings (no user toasts for validation)
      // These are brewing advisory warnings, not critical errors
      errorHandler.handleError(validationError, {
        context: 'hop-use-validation',
        severity: 'warning',
        silent: true, // Don't show user toasts for validation warnings
        recoverable: true,
        hopData: {
          originalUse: context.rawUse,
          time: context.time,
          sourceFormat: context.sourceFormat,
          step: context.step
        },
        validationWarning: warning
      });
    } catch (error) {
      // Fallback: don't let validation warning reporting break the main flow
      console.warn('Failed to report validation warning through error system:', warning, error);
    }
  });
}

/**
 * Hop type predicates for better readability
 */
export function isDryHop(hopUse) {
  return hopUse === INTERNAL_HOP_USES.DRY_HOP;
}

export function isAromaHop(hopUse) {
  return hopUse === INTERNAL_HOP_USES.AROMA || hopUse === INTERNAL_HOP_USES.WHIRLPOOL;
}



export function isBoilHop(hopUse) {
  return hopUse === INTERNAL_HOP_USES.BITTERING || 
         hopUse === INTERNAL_HOP_USES.FLAVOR || 
         hopUse === INTERNAL_HOP_USES.AROMA;
}

export function isBitteringHop(hopUse) {
  return hopUse === INTERNAL_HOP_USES.BITTERING || hopUse === INTERNAL_HOP_USES.FIRST_WORT;
}

export function isFlavorHop(hopUse) {
  return hopUse === INTERNAL_HOP_USES.FLAVOR;
}

/**
 * Maps internal use types back to format-specific values for export
 * 
 * @param {string} internalUse - Internal use type
 * @param {string} targetFormat - Format to export to
 * @returns {string} Format-specific use value
 */
export function denormalizeHopUse(internalUse, targetFormat) {
  if (!internalUse || !Object.values(INTERNAL_HOP_USES).includes(internalUse)) {
    return targetFormat === 'beerjson' ? 'add_to_boil' : 'boil'; // Safe default
  }

  try {
    const reverseMapping = REVERSE_MAPPINGS[targetFormat];
    if (reverseMapping && reverseMapping[internalUse]) {
      return reverseMapping[internalUse];
    }
    
    // Fallback to generic denormalization
    return denormalizeToGeneric(internalUse);
  } catch (error) {
    errorHandler.handleError(error, { context: 'hop-use-normalizer', internalUse, targetFormat });
    return targetFormat === 'beerjson' ? 'add_to_boil' : 'boil';
  }
}


/**
 * Denormalize to generic format
 */
function denormalizeToGeneric(internalUse) {
  switch (internalUse) {
    case INTERNAL_HOP_USES.MASH:
      return 'mash';
    case INTERNAL_HOP_USES.FIRST_WORT:
      return 'first wort';
    case INTERNAL_HOP_USES.BITTERING:
    case INTERNAL_HOP_USES.FLAVOR:
    case INTERNAL_HOP_USES.AROMA:
      return 'boil';
    case INTERNAL_HOP_USES.WHIRLPOOL:
      return 'aroma';
    case INTERNAL_HOP_USES.DRY_HOP:
      return 'dry hop';
    default:
      return 'boil';
  }
}

/**
 * Clear the hop use cache (useful for testing)
 */
export function clearHopUseCache() {
  hopUseCache.clear();
}

/**
 * Get user-friendly display name for internal hop use type
 * @param {string} internalUse - Internal hop use type
 * @param {number} step - Fermentation step (1=Primary, 2=Secondary, 3=Tertiary, 4+=Step N)
 * @returns {string} User-friendly display name
 */
export function getHopUseDisplayName(internalUse, step = null) {
  switch (internalUse) {
    case INTERNAL_HOP_USES.MASH:
      return 'Mash';
    case INTERNAL_HOP_USES.FIRST_WORT:
      return 'First Wort';
    case INTERNAL_HOP_USES.BITTERING:
    case INTERNAL_HOP_USES.FLAVOR:
    case INTERNAL_HOP_USES.AROMA:
      return 'Boil'; // Simplified display for all boil additions
    case INTERNAL_HOP_USES.WHIRLPOOL:
      return 'Whirlpool';
    case INTERNAL_HOP_USES.DRY_HOP:
      // Add fermentation step information for dry hops
      if (step === 2) {
        return 'Dry Hop (Secondary)';
      } else if (step === 3) {
        return 'Dry Hop (Tertiary)';
      } else if (step && step > 3) {
        return `Dry Hop (Step ${step})`; // For step 4, 5, etc.
      }
      return 'Dry Hop'; // Default for primary (step 1) or unspecified
    case INTERNAL_HOP_USES.PACKAGING:
      return 'Packaging';
    default:
      return 'Boil'; // Default fallback
  }
}

/**
 * Get cache statistics (useful for debugging)
 */
export function getHopUseCacheStats() {
  return {
    size: hopUseCache.size,
    keys: Array.from(hopUseCache.keys())
  };
}