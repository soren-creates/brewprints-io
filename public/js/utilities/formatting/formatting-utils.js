/**
 * Brewing Domain Formatting Utilities
 * Common brewing-specific formatting functions used across multiple components
 * 
 * NOTE: Basic formatting functions have been moved to specialized formatter modules:
 * - Unit formatting (weight, volume, temperature) -> unit-formatter.js
 * - Time formatting (minutes, hours, days) -> time-formatter.js  
 * - Text formatting (capitalization, HTML escaping) -> text-formatter.js
 * - Ingredient formatting (fermentables, hops, yeast, misc) -> ingredient-formatter.js
 * 
 * This module contains brewing domain-specific formatters that require specialized knowledge
 */

import { isValidGravity, isValidABV, parseNumber, isValidPercentage, isValidAmount } from '../validation/validation-utils.js';
import { formatWeight, formatVolume } from '../../formatters/unit-formatter.js';

/**
 * Format gravity value to standard brewing display format
 * Handles specific gravity values with proper brewing precision (3 decimal places)
 * @param {number} sg - Specific gravity value
 * @returns {string} Formatted gravity string (e.g., "1.050")
 */
function formatGravity(sg) {
  if (!isValidGravity(sg)) return '—';
  return sg.toFixed(3);
}

/**
 * Format gravity range for brewing specifications
 * Used for style guidelines and recipe target ranges
 * @param {number} min - Minimum gravity
 * @param {number} max - Maximum gravity
 * @returns {string} Formatted gravity range string (e.g., "1.045 - 1.055")
 */
function formatGravityRange(min, max) {
  if (!min || !max) return '—';
  return `${min.toFixed(3)} - ${max.toFixed(3)}`;
}

/**
 * Format numeric range with optional decimal precision
 * General utility for displaying value ranges in brewing contexts
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} decimalPlaces - Number of decimal places (optional)
 * @returns {string} Formatted range string
 */
function formatRange(min, max, decimalPlaces) {
  if (!min || !max) return '—';
  
  if (decimalPlaces !== undefined) {
    return `${min.toFixed(decimalPlaces)} - ${max.toFixed(decimalPlaces)}`;
  }
  
  return `${min} - ${max}`;
}

/**
 * Format percentage range for brewing specifications
 * Used for attenuation ranges, ABV ranges, etc.
 * @param {number} min - Minimum percentage
 * @param {number} max - Maximum percentage
 * @returns {string} Formatted percentage range string (e.g., "70.0% - 75.0%")
 */
function formatPercentageRange(min, max) {
  if (!min || !max) return '—';
  return `${min.toFixed(1)}% - ${max.toFixed(1)}%`;
}

/**
 * Format brew date to localized date string
 * Handles brewing-specific date formatting requirements
 * @param {string|Date} brewDate - Date to format
 * @returns {string} Formatted date string or empty string for CSS styling
 */
function formatBrewDate(brewDate) {
  // If there's a valid brew date, format it
  if (brewDate) {
    const date = new Date(brewDate);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString();
    }
  }
  
  // Return empty string if no valid date (CSS will show placeholder line)
  return '';
}

/**
 * Format water profile for brewing display
 * Handles mineral content formatting for brewing water chemistry
 * @param {Object} water - Water profile object with mineral content in ppm
 * @returns {string} Formatted water profile string with key brewing minerals
 */
function formatWaterProfile(water) {
  if (!water) return 'Profile —';
  
  const profile = [];
  
  // Format key brewing minerals with proper chemical notation and units
  if (water.calcium && water.calcium > 0) {
    profile.push(`Ca: ${water.calcium}ppm`);
  }
  if (water.sulfate && water.sulfate > 0) {
    profile.push(`SO₄: ${water.sulfate}ppm`);
  }
  if (water.chloride && water.chloride > 0) {
    profile.push(`Cl: ${water.chloride}ppm`);
  }
  if (water.bicarbonate && water.bicarbonate > 0) {
    profile.push(`HCO₃: ${water.bicarbonate}ppm`);
  }
  if (water.magnesium && water.magnesium > 0) {
    profile.push(`Mg: ${water.magnesium}ppm`);
  }
  if (water.sodium && water.sodium > 0) {
    profile.push(`Na: ${water.sodium}ppm`);
  }
  
  return profile.length > 0 ? profile.join(', ') : 'Profile —';
}

/**
 * Convert specific gravity to degrees Plato and format for brewing display
 * Uses standard brewing conversion formula for sugar content measurement
 * @param {number} specificGravity - Specific gravity value
 * @returns {string} Formatted degrees Plato string (e.g., "12.5 °P")
 */
function formatPlato(specificGravity) {
  if (!specificGravity || specificGravity <= 1.0) return '';
  
  // Convert specific gravity to degrees Plato using brewing formula:
  // °Plato ≈ (SG - 1) / 0.004
  // This is the standard approximation used in brewing calculations
  const plato = (specificGravity - 1) / 0.004;
  
  return `${plato.toFixed(1)} °P`;
}

// ============================================================================
// Parsing Functions for Formatted Values (Reverse Operations)
// ============================================================================

/**
 * Parse gravity from formatted string back to number
 * Handles formatted gravity values like "1.050" or legacy format "1050"
 * @param {string} formattedGravity - Formatted gravity string
 * @returns {number|null} Parsed gravity or null if invalid
 */
function parseGravityFromFormatted(formattedGravity) {
    if (!formattedGravity || formattedGravity === '—') {
        return null;
    }
    
    // Remove any formatting and extract numeric value
    const cleaned = formattedGravity.replace(/[^\d.]/g, '');
    if (!cleaned) {
        return null;
    }
    
    // Try to parse as a standard gravity value first
    const asNumber = parseFloat(cleaned);
    if (!isNaN(asNumber) && isValidGravity(asNumber)) {
        return asNumber;
    }
    
    // Handle legacy format (1050 -> 1.050) for backward compatibility
    if (isNaN(asNumber)) {
        return null;
    }
    
    if (asNumber > 100) {
        const converted = 1 + ((asNumber - 1000) / 1000);
        return isValidGravity(converted) ? converted : null;
    }
    
    return null;
}

/**
 * Parse ABV from formatted string back to number
 * Handles formatted ABV values like "5.2%" or "5.2"
 * @param {string} formattedAbv - Formatted ABV string
 * @returns {number|null} Parsed ABV or null if invalid
 */
function parseAbvFromFormatted(formattedAbv) {
    if (!formattedAbv || formattedAbv === '—') {
        return null;
    }
    
    // Extract numeric value from formatted string (e.g., "5.2%" -> "5.2")
    const match = formattedAbv.match(/([\d.]+)/);
    if (!match) {
        return null;
    }
    
    // Use validation-utils parseNumber + isValidABV for consistent validation
    const parsed = parseNumber(match[1]);
    return isValidABV(parsed) ? parsed : null;
}

/**
 * Format percentage value with customizable decimal places
 * @param {number} value - Percentage value to format
 * @param {number} decimalPlaces - Number of decimal places (default: 1)
 * @returns {string} Formatted percentage string (e.g., "5.2%")
 */
function formatPercentage(value, decimalPlaces = 1) {
  if (!isValidPercentage(value)) return '—';
  return `${parseFloat(value).toFixed(decimalPlaces)}%`;
}

/**
 * Format pluralization utility for consistent singular/plural handling
 * @param {number} value - Numeric value to determine singular/plural
 * @param {string} singular - Singular form of the word
 * @param {string} plural - Plural form (defaults to singular + 's')
 * @returns {string} Formatted string with value and appropriate word form
 */
function formatPlural(value, singular, plural = singular + 's') {
  return `${value} ${value !== 1 ? plural : singular}`;
}

/**
 * Format conditional amount based on weight/volume flag
 * @param {number} amount - Amount to format
 * @param {boolean} amountIsWeight - Whether amount represents weight (true) or volume (false)
 * @param {string} weightUnit - Unit for weight formatting (default: 'g')
 * @param {string} volumeUnit - Unit for volume formatting (default: 'ml')
 * @returns {string} Formatted amount string with appropriate unit
 */
function formatConditionalAmount(amount, amountIsWeight, weightUnit = 'g', volumeUnit = 'ml') {
  if (!isValidAmount(amount)) return '—';
  return amountIsWeight ? 
    formatWeight(amount, weightUnit) : 
    formatVolume(amount, volumeUnit);
}

// Export brewing domain-specific formatters and their parsing counterparts
export {
  formatGravity,
  formatGravityRange,
  formatRange,
  formatPercentageRange,
  formatBrewDate,
  formatWaterProfile,
  formatPlato,
  parseGravityFromFormatted,
  parseAbvFromFormatted,
  formatPercentage,
  formatPlural,
  formatConditionalAmount
};
