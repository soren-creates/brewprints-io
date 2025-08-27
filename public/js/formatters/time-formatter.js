/**
 * Time Formatter Module
 * Handles consistent formatting of time values (minutes, hours, days)
 */

import { INTERNAL_HOP_USES, getHopUseDisplayName, isDryHop, isAromaHop } from '../utilities/hop-use-normalizer.js';
import { isValidNumber } from '../utilities/validation/validation-utils.js';
import { formatPlural } from '../utilities/formatting/formatting-utils.js';

/**
 * Format time duration in brewing-appropriate format
 * @param {number} minutes - Time in minutes
 * @returns {string} Formatted time string
 */
export function formatTime(minutes) {
  if (!isValidNumber(minutes, { allowZero: true, max: 525600 })) return '—'; // max 1 year in minutes
  
  // Handle days
  if (minutes >= 1440) { // 24 hours
    const days = Math.floor(minutes / 1440);
    const remainingHours = Math.floor((minutes % 1440) / 60);
    
    if (remainingHours === 0) {
      return formatPlural(days, 'day');
    }
    
    return `${formatPlural(days, 'day')} ${formatPlural(remainingHours, 'hr')}`;
  }
  
  // Handle hours
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return formatPlural(hours, 'hr');
    }
    
    return `${formatPlural(hours, 'hr')} ${formatPlural(remainingMinutes, 'min')}`;
  }
  
  // Handle minutes
  return formatPlural(minutes, 'min');
}

/**
 * Format days duration
 * @param {number} days - Number of days
 * @returns {string} Formatted days string
 */
export function formatDays(days) {
  if (!isValidNumber(days, { allowZero: true, max: 3650 })) return '—'; // max 10 years in days
  
  // Whole days
  if (days % 1 === 0) {
    return formatPlural(days, 'day');
  }
  
  // Fractional days
  const wholeDays = Math.floor(days);
  const hours = Math.round((days - wholeDays) * 24);
  
  if (wholeDays === 0) {
    return formatPlural(hours, 'hour');
  }
  
  return `${formatPlural(wholeDays, 'day')} ${formatPlural(hours, 'hour')}`;
}

/**
 * Format mash time based on mash data and recipe type
 * @param {Object|number} mashData - Mash data object or mash time in minutes
 * @param {string} recipeType - Recipe type (Extract, All Grain, etc.)
 * @returns {string} Formatted mash time
 */
export function formatMashTime(mashData, recipeType) {
  // For Extract recipes, mash is not applicable
  if (recipeType && recipeType.toLowerCase().includes('extract')) {
    return 'N/A';
  }
  
  // If mashData is a number (legacy usage), format it directly
  if (typeof mashData === 'number') {
    if (!isValidNumber(mashData, { allowZero: true, max: 525600 })) return '—'; // max 1 year in minutes
    return formatPlural(mashData, 'min');
  }
  
  // If mashData is an object with steps, calculate total time
  if (mashData && mashData.steps && Array.isArray(mashData.steps) && mashData.steps.length > 0) {
    const totalTime = mashData.steps.reduce((total, step) => {
      const stepTime = step.stepTime || 0;
      return total + (typeof stepTime === 'number' ? stepTime : 0);
    }, 0);
    
    if (totalTime > 0) {
      return formatPlural(totalTime, 'min');
    }
  }
  
  // No valid mash data
  return null;
}

/**
 * Format hop time based on use and time
 * @param {string} use - Hop use (boil, dry hop, etc.) - can be normalized internal type or format-specific
 * @param {number} time - Time value
 * @param {string} timeUnit - Time unit (minutes, days, hours) - optional, Brewfather extension
 * @returns {string} Formatted hop time
 */
export function formatHopTime(use, time, timeUnit) {
  if (!use) return '—';
  
  const lowerUse = use.toLowerCase();
  
  // Uses that don't show time values - return empty string
  if (lowerUse === INTERNAL_HOP_USES.FIRST_WORT || lowerUse === 'first wort') {
    return '';
  }
  
  if (lowerUse === INTERNAL_HOP_USES.MASH || lowerUse === 'mash' || lowerUse === 'add_to_mash') {
    return '';
  }
  
  if (lowerUse === INTERNAL_HOP_USES.PACKAGING || lowerUse === 'packaging' || lowerUse === 'add_to_package') {
    return '';
  }
  
  // If no time value, show dash
  if (!isValidNumber(time, { allowZero: true, max: 525600 })) return '—'; // max 1 year in minutes
  
  // Check for dry hop using the normalizer predicate and legacy formats
  if (lowerUse === INTERNAL_HOP_USES.DRY_HOP || // Internal normalized use
      lowerUse === 'dry hop' ||                  // BeerXML/Brewfather format 
      lowerUse === 'add_to_fermentation') {      // BeerJSON format
    // Handle BeerJSON/Brewfather timeUnit extension - when explicit timeUnit is provided
    if (timeUnit && (timeUnit.toLowerCase() === 'days' || timeUnit.toLowerCase() === 'day')) {
      return formatDays(time); // Time is already in days
    }
    // Handle BeerXML/converted BeerJSON where time is in minutes
    // BeerXML always stores dry hop time in minutes, even for multi-day dry hops
    // So 17280 minutes = 12 days, 7200 minutes = 5 days
    // Convert minutes to days for dry hop display
    return formatDays(time / 1440);
  }
  
  // Check for aroma/whirlpool hops using normalizer predicate and legacy formats
  if (lowerUse === INTERNAL_HOP_USES.AROMA || 
      lowerUse === INTERNAL_HOP_USES.WHIRLPOOL ||
      lowerUse === 'aroma' ||
      lowerUse === 'whirlpool' ||
      lowerUse === 'hopstand') {
    return formatPlural(time, 'min');
  }
  
  // Default for boil and other uses (bittering, flavor, add_to_boil, etc.)
  return formatPlural(time, 'min');
}

/**
 * Format misc ingredient time based on use and time
 * @param {string} use - Misc ingredient use (boil, fermentation, etc.)
 * @param {number} time - Time value in minutes
 * @returns {string} Formatted misc time
 */
export function formatMiscTime(use, time) {
  if (!isValidNumber(time, { allowZero: true, max: 525600 })) return '—'; // max 1 year in minutes
  if (!use) return formatTime(time);
  
  const lowerUse = use.toLowerCase();
  
  // For fermentation additions, show time in days when appropriate
  if (lowerUse === 'fermentation' || lowerUse === 'add_to_fermentation' || lowerUse === 'secondary') {
    // Convert minutes to days if time is large enough to warrant day display
    if (time >= 1440) { // 24+ hours
      return formatDays(time / 1440);
    }
    // Still show in minutes/hours for short fermentation additions
    return formatTime(time);
  }
  
  // For all other uses (boil, mash, etc.), use regular time formatting
  return formatTime(time);
}
