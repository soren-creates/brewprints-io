/**
 * Ingredient Formatter Module
 * Handles consistent formatting of brewing ingredients with focus on brewing domain accuracy
 */
import { 
  formatFermentableWeight, 
  formatWeight, 
  formatVolume, 
  formatTemperatureRange 
} from './unit-formatter.js';
import { formatHopTime, formatTime, formatMiscTime } from './time-formatter.js';
import { capitalizeFirst, toTitleCase, formatUseType } from './text-formatter.js';
import { isValidNumber } from '../utilities/validation/validation-utils.js';
import { formatPercentage, formatConditionalAmount } from '../utilities/formatting/formatting-utils.js';
import { BREWING_TEMPERATURE_RANGES } from '../core/constants.js';

/**
 * Format fermentable ingredient
 * @param {Object} fermentable - Fermentable ingredient data
 * @param {number} totalWeight - Total weight of all fermentables
 * @returns {Object} Formatted fermentable
 */
export function formatFermentable(fermentable, totalWeight) {
  if (!fermentable) return null;
  
  return {
    ...fermentable,
    amountFormatted: fermentable.amount ? formatFermentableWeight(fermentable.amount) : '0 oz',
    colorFormatted: fermentable.color !== undefined ? 
      `${fermentable.color < 5 ? fermentable.color.toFixed(1) : Math.round(fermentable.color)} °L` : 
      '—',
    yieldFormatted: fermentable.yield !== undefined ? formatPercentage(fermentable.yield, 0) : '—',
    percentage: totalWeight > 0 && fermentable.amount ? 
      formatPercentage((fermentable.amount / totalWeight) * 100) : 
      '0%',
    typeFormatted: toTitleCase(fermentable.type || '')
  };
}

/**
 * Format hop ingredient
 * @param {Object} hop - Hop ingredient data
 * @returns {Object} Formatted hop
 */
export function formatHop(hop) {
  if (!hop) return null;
  
  return {
    ...hop,
    amountFormatted: hop.amount ? formatWeight(hop.amount, 'oz') : '0.0 oz',
    alphaFormatted: hop.alpha !== undefined ? formatPercentage(hop.alpha) : '—',
    timeFormatted: formatHopTime(hop.use || '', hop.time || 0, hop.timeUnit),
    useFormatted: formatUseType(hop.use || '', hop.step || null),
    typeFormatted: capitalizeFirst(hop.type || ''),
    formFormatted: capitalizeFirst(hop.form || '')
  };
}

/**
 * Format yeast ingredient with brewing domain-specific logic
 * @param {Object} yeast - Yeast ingredient data
 * @param {string} [calculatedAttenuation] - Pre-calculated attenuation percentage (e.g., "75%")
 * @returns {Object} Formatted yeast with all brewing-specific properties
 */
export function formatYeast(yeast, calculatedAttenuation = null) {
  if (!yeast) return null;
  
  return {
    ...yeast,
    // Preserve BeerXML displayAmount when available, generate *Formatted for UI
    amountFormatted: yeast.displayAmount || 
      (yeast.amount ? 
        formatConditionalAmount(yeast.amount, yeast.amountIsWeight, 'g', 'ml') : '—'),
    
    // Use provided calculation, yeast data, or brewing domain fallback
    attenuationFormatted: calculatedAttenuation || 
      (yeast.attenuation !== undefined ? formatPercentage(yeast.attenuation, 0) : '75%'),
    
    // Standard yeast formatting
    typeFormatted: capitalizeFirst(yeast.type || ''),
    formFormatted: capitalizeFirst(yeast.form || ''),
    
    // Brewing domain temperature range with intelligent fallbacks
    tempRangeFormatted: formatYeastTemperatureRange(
      yeast.minTemperature, 
      yeast.maxTemperature, 
      yeast.type
    ),
    
    // Additional yeast properties for brewing accuracy
    productIdFormatted: yeast.productId || '',
    laboratoryFormatted: yeast.laboratory || '—',
    flocculationFormatted: capitalizeFirst(yeast.flocculation || '—')
  };
}

/**
 * Format yeast temperature range with brewing domain fallbacks based on yeast strain characteristics
 * @param {number} minC - Minimum temperature in Celsius
 * @param {number} maxC - Maximum temperature in Celsius
 * @param {string} yeastType - Type of yeast (ale, lager, wine, etc.)
 * @returns {string} Formatted temperature range string with Fahrenheit display
 */
export function formatYeastTemperatureRange(minC, maxC, yeastType) {
  // If we have valid temperature range data from BeerXML, use it
  if (minC && maxC && minC > 0 && maxC > 0) {
    return formatTemperatureRange(minC, maxC);
  }
  
  // Use centralized brewing temperature ranges from constants
  
  // Normalize yeast type for brewing domain lookup
  const normalizedType = yeastType ? yeastType.toLowerCase().trim() : '';
  
  // Determine appropriate brewing temperature range based on yeast strain characteristics
  let range = BREWING_TEMPERATURE_RANGES['default'];
  
  // Check for specific brewing yeast types with domain-specific temperature requirements
  if (normalizedType.includes('lager')) {
    range = BREWING_TEMPERATURE_RANGES['lager'];
  } else if (normalizedType.includes('wheat')) {
    range = BREWING_TEMPERATURE_RANGES['wheat'];
  } else if (normalizedType.includes('wine')) {
    range = BREWING_TEMPERATURE_RANGES['wine'];
  } else if (normalizedType.includes('champagne')) {
    range = BREWING_TEMPERATURE_RANGES['champagne'];
  } else if (normalizedType.includes('brett')) {
    range = BREWING_TEMPERATURE_RANGES['brett'];
  } else if (normalizedType.includes('kveik')) {
    range = BREWING_TEMPERATURE_RANGES['kveik'];
  } else if (normalizedType.includes('saison')) {
    range = BREWING_TEMPERATURE_RANGES['saison'];
  } else if (normalizedType.includes('wild') || normalizedType.includes('mixed')) {
    range = BREWING_TEMPERATURE_RANGES['wild'];
  } else if (normalizedType.includes('ale') || normalizedType === '') {
    range = BREWING_TEMPERATURE_RANGES['ale'];
  }
  
  return formatTemperatureRange(range.min, range.max);
}

/**
 * Format misc ingredient
 * @param {Object} misc - Misc ingredient data
 * @returns {Object} Formatted misc ingredient
 */
export function formatMisc(misc) {
  if (!misc) return null;
  
  return {
    ...misc,
    // Preserve BeerXML displayAmount when available, otherwise format amount based on amountIsWeight flag
    amountFormatted: misc.displayAmount || 
      (misc.amount ? 
        formatConditionalAmount(misc.amount, misc.amountIsWeight, 'g', 'fl oz') : '—'),
    
    // Format time for brewing process integration
    timeFormatted: misc.time !== undefined ? formatMiscTime(misc.use, misc.time) : '—',
    
    // Format use and type for brewing domain clarity
    useFormatted: formatUseType(misc.use || ''),
    typeFormatted: capitalizeFirst(misc.type || ''),
    
    // Additional brewing domain properties
    usageInstructionFormatted: misc.use && misc.time ? 
      `Add ${misc.use.toLowerCase()} for ${formatTime(misc.time)}` : 
      (misc.use ? `Add ${misc.use.toLowerCase()}` : 'Add as directed')
  };
}
