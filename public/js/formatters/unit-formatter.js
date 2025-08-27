/**
 * Unit Formatter Module
 * Handles consistent formatting of physical units (weight, volume, temperature)
 */
import { 
  KG_TO_LB, 
  KG_TO_OZ, 
  OZ_PER_LB, 
  L_TO_GAL,
  L_TO_QT,
  CELSIUS_TO_FAHRENHEIT_MULTIPLIER,
  CELSIUS_TO_FAHRENHEIT_OFFSET
} from '../core/constants.js';

/**
 * Format a decimal number with appropriate precision
 * @param {number} value - Value to format
 * @param {number} [minDecimalPlaces=0] - Minimum decimal places
 * @param {number} [maxDecimalPlaces=2] - Maximum decimal places
 * @returns {string} Formatted decimal number
 */
export function formatDecimalPlaces(value, minDecimalPlaces = 0, maxDecimalPlaces = 2) {
  if (value === undefined || value === null || isNaN(value)) return '—';
  
  // Use fixed decimal places if needed
  if (minDecimalPlaces === maxDecimalPlaces) {
    return value.toFixed(minDecimalPlaces);
  }
  
  // Check if value is close enough to a whole number (accounting for floating-point precision)
  const rounded = Math.round(value);
  const isCloseToWholeNumber = Math.abs(value - rounded) < 0.0001;
  
  // Dynamically determine decimal places based on value
  const decimalPlaces = isCloseToWholeNumber ? 
    minDecimalPlaces : 
    Math.min(maxDecimalPlaces, Math.max(minDecimalPlaces, 
      // Count significant decimal places
      (value.toString().split('.')[1] || '').length
    ));
  
  // Use toFixed for the decimal places, then remove trailing zeros if min != max
  const formatted = value.toFixed(decimalPlaces);
  
  // Only remove trailing zeros if we have flexible decimal places (min != max)
  if (minDecimalPlaces !== maxDecimalPlaces) {
    // Remove trailing zeros only after decimal point, not before it
    const trimmed = formatted.replace(/\.0+$/, '');
    return trimmed === '' ? '0' : trimmed;
  }
  
  return formatted;
}

/**
 * Format weight with appropriate units
 * @param {number} kg - Weight in kilograms
 * @param {string} [preferredUnit='lb'] - Preferred output unit ('lb', 'oz', 'g')
 * @returns {string} Formatted weight string
 */
export function formatWeight(kg, preferredUnit = 'lb') {
  if (kg === undefined || kg === null || isNaN(kg)) return '—';
  
  if (preferredUnit === 'oz') {
    const oz = kg * KG_TO_OZ;
    return `${formatDecimalPlaces(oz, 0, 2)} oz`;
  }
  
  if (preferredUnit === 'g') {
    const grams = kg * 1000;
    return `${formatDecimalPlaces(grams, 0, 1)} g`;
  }
  
  // Default to pounds
  const lbs = kg * KG_TO_LB;
  return `${formatDecimalPlaces(lbs, 0, 2)} lb`;
}

/**
 * Format fermentable weight in brewing-appropriate format
 * @param {number} kg - Weight in kilograms
 * @returns {string} Formatted weight (e.g. "5 lbs 6 oz" or "12 oz")
 */
export function formatFermentableWeight(kg) {
  if (kg === undefined || kg === null || isNaN(kg)) return '—';
  
  const totalOz = kg * KG_TO_OZ;
  
  // Small amounts shown in ounces
  if (totalOz < 16) {
    return `${formatDecimalPlaces(totalOz, 0, 1)} oz`;
  }
  
  // Larger amounts shown in pounds and ounces
  const lbs = Math.floor(totalOz / OZ_PER_LB);
  const oz = totalOz % OZ_PER_LB;
  
  // Skip ounces if less than 0.1
  if (oz < 0.1) {
    return `${lbs} lb${lbs !== 1 ? 's' : ''}`;
  }
  
  return `${lbs} lb${lbs !== 1 ? 's' : ''} ${formatDecimalPlaces(oz, 0, 1)} oz`;
}

/**
 * Format volume with appropriate units
 * @param {number} liters - Volume in liters
 * @param {string} [unit='gal'] - Output unit ('gal', 'qt', 'L')
 * @returns {string} Formatted volume string
 */
export function formatVolume(liters, unit = 'gal') {
  if (liters === undefined || liters === null || isNaN(liters)) return '—';
  
  let converted;
  switch (unit.toLowerCase()) {
    case 'gal':
      converted = liters * L_TO_GAL;
      break;
    case 'qt':
      converted = liters * L_TO_QT;
      break;
    case 'l':
    default:
      converted = liters;
      unit = 'L';
      break;
  }
  
  return `${formatDecimalPlaces(converted, 0, 2)} ${unit}`;
}

/**
 * Format temperature with appropriate units
 * @param {number} celsius - Temperature in Celsius
 * @param {string} [unit='F'] - Output unit ('F', 'C')
 * @returns {string} Formatted temperature string
 */
export function formatTemperature(celsius, unit = 'F') {
  if (celsius === undefined || celsius === null || isNaN(celsius)) return '—';
  
  const temp = unit.toUpperCase() === 'F' ? 
    celsius * CELSIUS_TO_FAHRENHEIT_MULTIPLIER + CELSIUS_TO_FAHRENHEIT_OFFSET : 
    celsius;
  
  return `${Math.round(temp)}°${unit.toUpperCase()}`;
}

/**
 * Format temperature range
 * @param {number} minCelsius - Minimum temperature in Celsius
 * @param {number} maxCelsius - Maximum temperature in Celsius
 * @param {string} [unit='F'] - Output unit ('F', 'C')
 * @returns {string} Formatted temperature range
 */
export function formatTemperatureRange(minCelsius, maxCelsius, unit = 'F') {
  if (minCelsius === undefined || maxCelsius === undefined) return '—';
  
  const minFormatted = formatTemperature(minCelsius, unit);
  const maxFormatted = formatTemperature(maxCelsius, unit);
  
  if (minFormatted === maxFormatted) return minFormatted;
  return `${minFormatted} - ${maxFormatted}`;
}
