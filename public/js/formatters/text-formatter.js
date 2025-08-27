/**
 * Text Formatter Module
 * Handles consistent formatting of text content
 */

import { INTERNAL_HOP_USES, getHopUseDisplayName } from '../utilities/hop-use-normalizer.js';
import { isValidNumber } from '../utilities/validation/validation-utils.js';
import { formatPercentage } from '../utilities/formatting/formatting-utils.js';

/**
 * Capitalize first letter of a string
 * @param {string} text - Text to capitalize
 * @returns {string} Text with first letter capitalized
 */
export function capitalizeFirst(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Convert text to title case (capitalize each word)
 * @param {string} text - Text to convert
 * @returns {string} Text in title case
 */
export function toTitleCase(text) {
  if (!text) return '';
  
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format recipe notes with paragraph breaks
 * @param {string} notes - Recipe notes
 * @returns {string} Formatted notes HTML
 */
export function formatNotes(notes) {
  if (!notes) return '';
  
  // Convert line breaks to paragraphs
  return notes
    .split(/\r?\n\r?\n/)
    .filter(paragraph => paragraph.trim())
    .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
  if (!text) return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Format UseType enum values to user-friendly display names
 * @param {string} useType - BeerJSON UseType enum value or internal normalized hop use
 * @param {number} step - Fermentation step (1=Primary, 2=Secondary, 3=Tertiary) for dry hop display
 * @returns {string} User-friendly display name
 */
export function formatUseType(useType, step = null) {
  if (!useType) return '';
  
  // Check if this is a normalized internal hop use type
  if (Object.values(INTERNAL_HOP_USES).includes(useType)) {
    return getHopUseDisplayName(useType, step);
  }
  
  // Legacy BeerJSON UseType enum mapping
  const useTypeMap = {
    'add_to_mash': 'Mash',
    'add_to_boil': 'Boil',
    'add_to_fermentation': 'Fermentation',
    'add_to_package': 'Packaging',
    // Legacy hop use formats
    'dry_hop': 'Dry Hop',
    'first_wort': 'First Wort',
    // BeerXML specific mappings for consistent display
    'dry hop': 'Dry Hop',  // BeerXML format (space not underscore)
    'aroma': 'Whirlpool'   // Display BeerXML "Aroma" as "Whirlpool" for clarity
  };
  
  return useTypeMap[useType.toLowerCase()] || capitalizeFirst(useType);
}

/**
 * Format pH value to 2 decimal places
 * @param {number|null} phValue - pH value to format
 * @returns {string} Formatted pH value or '—' if null/invalid
 */
export function formatPh(phValue) {
  if (!isValidNumber(phValue, { allowZero: true, max: 14 })) {
    return '—';
  }
  
  return parseFloat(phValue).toFixed(2);
}

/**
 * Format mash pH value
 * @param {number|null} mashPhValue - Extracted mash pH value
 * @returns {string} Formatted mash pH
 */
export function formatMashPh(mashPhValue) {
  return formatPh(mashPhValue);
}

/**
 * Format sparge pH value
 * @param {number|null} spargePhValue - Extracted sparge pH value
 * @returns {string} Formatted sparge pH
 */
export function formatSpargePh(spargePhValue) {
  return formatPh(spargePhValue);
}
