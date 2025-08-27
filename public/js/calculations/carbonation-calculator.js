/**
 * Carbonation Calculator - Atomic Calculator Pattern
 * 
 * Estimates carbonation levels based on beer style and provides formatted display values.
 * Uses style name matching to determine appropriate carbonation ranges.
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific carbonation calculations
 */

import { DEFAULT_CARBONATION, DEFAULT_CARB_MIN, DEFAULT_CARB_MAX } from '../core/constants.js';
import { safeCalculation } from '../utilities/errors/error-utils.js';

// Carbonation ranges by beer style category
const STYLE_CARBONATION_RANGES = {
  // === LOW CARBONATION STYLES === //
  
  // Traditional Finnish Farmhouse (1.0 - 1.8) - Often served still or very low
  'sahti': { min: 1.0, max: 1.8, typical: 1.4 },
  
  // Barleywines & Strong Ales (1.3 - 1.9)
  'barleywine': { min: 1.3, max: 1.9, typical: 1.6 },
  'english barleywine': { min: 1.3, max: 1.9, typical: 1.6 },
  'american barleywine': { min: 1.3, max: 1.9, typical: 1.6 },
  'scotch ale': { min: 1.3, max: 1.9, typical: 1.6 },
  'old ale': { min: 1.3, max: 1.9, typical: 1.6 },

  // British Ales (1.5 - 2.2) - Traditional low carbonation
  'british ale': { min: 1.5, max: 2.2, typical: 1.8 },
  'english ale': { min: 1.5, max: 2.2, typical: 1.8 },
  'bitter': { min: 1.5, max: 2.2, typical: 1.8 },
  'english bitter': { min: 1.5, max: 2.2, typical: 1.8 },
  'best bitter': { min: 1.5, max: 2.2, typical: 1.8 },
  'extra special bitter': { min: 1.5, max: 2.2, typical: 1.8 },
  'esb': { min: 1.5, max: 2.2, typical: 1.8 },
  'mild': { min: 1.5, max: 2.2, typical: 1.8 },
  'english mild': { min: 1.5, max: 2.2, typical: 1.8 },
  'english brown ale': { min: 1.5, max: 2.2, typical: 1.8 },
  'northern english brown': { min: 1.5, max: 2.2, typical: 1.8 },
  'southern english brown': { min: 1.5, max: 2.2, typical: 1.8 },

  // Stouts & Porters (1.7 - 2.3)
  'stout': { min: 1.7, max: 2.3, typical: 2.0 },
  'porter': { min: 1.7, max: 2.3, typical: 2.0 },
  'english porter': { min: 1.7, max: 2.3, typical: 2.0 },
  'baltic porter': { min: 1.7, max: 2.3, typical: 2.0 },
  'dry irish stout': { min: 1.7, max: 2.3, typical: 2.0 },
  'milk stout': { min: 1.7, max: 2.3, typical: 2.0 },
  'imperial stout': { min: 1.7, max: 2.3, typical: 2.0 },

  // === MODERATE CARBONATION STYLES === //
  
  // American Ales (2.0 - 2.4)
  'pale ale': { min: 2.0, max: 2.4, typical: 2.2 },
  'american pale ale': { min: 2.0, max: 2.4, typical: 2.2 },
  'american brown ale': { min: 2.0, max: 2.4, typical: 2.2 },
  'golden ale': { min: 2.0, max: 2.4, typical: 2.2 },
  'summer ale': { min: 2.0, max: 2.4, typical: 2.2 },
  'blonde ale': { min: 2.0, max: 2.4, typical: 2.2 },

  // German Ales (2.0 - 2.4)
  'altbier': { min: 2.0, max: 2.4, typical: 2.2 },
  'alt': { min: 2.0, max: 2.4, typical: 2.2 },
  'smoked': { min: 2.0, max: 2.5, typical: 2.2 },
  'rauchbier': { min: 2.0, max: 2.5, typical: 2.2 },

  // Amber/Red Ales (2.1 - 2.5)
  'amber ale': { min: 2.1, max: 2.5, typical: 2.3 },
  'american amber': { min: 2.1, max: 2.5, typical: 2.3 },
  'red ale': { min: 2.1, max: 2.5, typical: 2.3 },
  'american red': { min: 2.1, max: 2.5, typical: 2.3 },
  'brown ale': { min: 2.1, max: 2.5, typical: 2.3 }, // Generic brown ale

  // IPAs (2.2 - 2.8) - Higher carbonation for hop character
  'ipa': { min: 2.2, max: 2.8, typical: 2.5 },
  'india pale ale': { min: 2.2, max: 2.8, typical: 2.5 },
  'american ipa': { min: 2.2, max: 2.8, typical: 2.5 },
  'double ipa': { min: 2.2, max: 2.8, typical: 2.5 },
  'imperial ipa': { min: 2.2, max: 2.8, typical: 2.5 },

  // Session Styles (2.2 - 2.7)
  'session ipa': { min: 2.3, max: 2.7, typical: 2.5 },
  'session ale': { min: 2.2, max: 2.6, typical: 2.4 },

  // German Lager Styles (2.2 - 2.7)
  'kolsch': { min: 2.2, max: 2.6, typical: 2.4 },
  'koelsch': { min: 2.2, max: 2.6, typical: 2.4 },
  'bock': { min: 2.2, max: 2.6, typical: 2.4 },
  'doppelbock': { min: 2.2, max: 2.6, typical: 2.4 },
  'maibock': { min: 2.2, max: 2.6, typical: 2.4 },
  'california common': { min: 2.2, max: 2.6, typical: 2.4 },
  'steam beer': { min: 2.2, max: 2.6, typical: 2.4 },

  // American Wheat (2.3 - 2.7)
  'american wheat': { min: 2.3, max: 2.7, typical: 2.5 },
  'american wheat ale': { min: 2.3, max: 2.7, typical: 2.5 },
  'vienna': { min: 2.3, max: 2.7, typical: 2.5 },
  'vienna lager': { min: 2.3, max: 2.7, typical: 2.5 },

  // === MODERATE-HIGH CARBONATION === //
  
  // Belgian Ales (2.4 - 3.0)
  'belgian': { min: 2.4, max: 3.0, typical: 2.7 },
  'belgian ale': { min: 2.4, max: 3.0, typical: 2.7 },
  'oud bruin': { min: 2.4, max: 3.0, typical: 2.7 },
  'brown beer': { min: 2.4, max: 3.0, typical: 2.7 },
  'belgian brown ale': { min: 2.4, max: 3.0, typical: 2.7 },
  'bière de garde': { min: 2.4, max: 3.0, typical: 2.7 },

  // Standard Lagers (2.4 - 2.7)
  'lager': { min: 2.4, max: 2.7, typical: 2.55 },
  'marzen': { min: 2.4, max: 2.7, typical: 2.55 },
  'oktoberfest': { min: 2.4, max: 2.7, typical: 2.55 },
  'european amber': { min: 2.4, max: 2.7, typical: 2.55 },
  'schwarzbier': { min: 2.4, max: 2.7, typical: 2.55 },
  'black beer': { min: 2.4, max: 2.7, typical: 2.55 },
  'amber lager': { min: 2.4, max: 2.7, typical: 2.55 },

  // Cream Ales & Hybrids (2.4 - 2.8)
  'cream ale': { min: 2.4, max: 2.8, typical: 2.6 },

  // Pilsners (2.6 - 3.0) - Higher than generic lagers
  'pilsner': { min: 2.6, max: 3.0, typical: 2.8 },
  'german pilsner': { min: 2.6, max: 3.0, typical: 2.8 },
  'czech pilsner': { min: 2.6, max: 3.0, typical: 2.8 },
  'bohemian pilsner': { min: 2.6, max: 3.0, typical: 2.8 },

  // Fruit Beers (2.6 - 3.2)
  'fruit beer': { min: 2.6, max: 3.2, typical: 2.9 },
  'fruit ale': { min: 2.6, max: 3.2, typical: 2.9 },

  // Seasonal & Spiced Beers (2.2 - 2.8)
  'seasonal beer': { min: 2.2, max: 2.8, typical: 2.5 },
  'autumn seasonal beer': { min: 2.2, max: 2.8, typical: 2.5 },
  'winter seasonal beer': { min: 2.2, max: 2.8, typical: 2.5 },
  'spring seasonal beer': { min: 2.2, max: 2.8, typical: 2.5 },
  'summer seasonal beer': { min: 2.2, max: 2.8, typical: 2.5 },
  'spiced beer': { min: 2.2, max: 2.8, typical: 2.5 },
  'holiday beer': { min: 2.2, max: 2.8, typical: 2.5 },
  'christmas beer': { min: 2.2, max: 2.8, typical: 2.5 },

  // === HIGH CARBONATION STYLES === //
  
  // Sours (2.8 - 3.5)
  'sour': { min: 2.8, max: 3.5, typical: 3.15 },
  'lambic': { min: 2.8, max: 3.5, typical: 3.15 },
  'gueuze': { min: 2.8, max: 3.5, typical: 3.15 },
  'flanders red ale': { min: 2.8, max: 3.5, typical: 3.15 },
  'american wild ale': { min: 2.8, max: 3.5, typical: 3.15 },
  'brett': { min: 2.8, max: 3.5, typical: 3.15 },

  // Saisons (3.0 - 3.5)
  'saison': { min: 3.0, max: 3.5, typical: 3.25 },
  'farmhouse': { min: 3.0, max: 3.5, typical: 3.25 },

  // Wheat Beers (3.0 - 3.5)
  'wheat': { min: 3.0, max: 3.5, typical: 3.25 },
  'berliner weisse': { min: 3.0, max: 3.5, typical: 3.25 },
  'gose': { min: 3.0, max: 3.5, typical: 3.25 },
  'rye beer': { min: 3.0, max: 3.5, typical: 3.25 },
  'roggenbier': { min: 3.0, max: 3.5, typical: 3.25 },
  'weizen': { min: 3.0, max: 3.5, typical: 3.25 },
  'weissbier': { min: 3.0, max: 3.5, typical: 3.25 },
  'witbier': { min: 3.0, max: 3.5, typical: 3.25 },
  'white ale': { min: 3.0, max: 3.5, typical: 3.25 },
  'piwo grodziskie': { min: 3.0, max: 3.6, typical: 3.3 },
  'grodziskie': { min: 3.0, max: 3.6, typical: 3.3 },

  // Ultra-High Carbonation Styles (3.5 - 4.5)
  'champagne beer': { min: 3.5, max: 4.5, typical: 4.0 },
  'belgian tripel': { min: 3.2, max: 4.2, typical: 3.7 },
  'belgian quadrupel': { min: 3.0, max: 4.0, typical: 3.5 },
  'traditional gueuze': { min: 3.5, max: 4.5, typical: 4.0 },
  'sparkling ale': { min: 3.8, max: 4.5, typical: 4.1 },
};

/**
 * Match a beer style name to carbonation range with intelligent specificity matching
 * @param {string} styleName - Pre-validated style name from RecipeValidator
 * @param {boolean} debug - Optional debug flag to log matching decisions
 * @returns {Object|null} Carbonation range object or null if no match
 * @precondition styleName is valid string or undefined
 */
function matchStyleToCarbonationRange(styleName, debug = false) {
  if (!styleName || typeof styleName !== 'string') {
    return null;
  }
  
  const normalized = styleName.toLowerCase().trim();
  
  // Try exact match first
  if (STYLE_CARBONATION_RANGES[normalized]) {
    if (debug) {
      console.log(`Exact match found for "${styleName}" → "${normalized}"`);
    }
    return STYLE_CARBONATION_RANGES[normalized];
  }
  
  // Intelligent partial matching with specificity ranking
  // Higher specificity = higher priority for matching
  const styleMatches = [];
  
  for (const [styleKey, range] of Object.entries(STYLE_CARBONATION_RANGES)) {
    if (normalized.includes(styleKey) || styleKey.includes(normalized)) {
      const specificity = calculateStyleSpecificity(styleKey, normalized);
      if (specificity > 0) {
        styleMatches.push({ styleKey, range, specificity });
      }
    }
  }
  
  // Return the most specific match
  if (styleMatches.length > 0) {
    styleMatches.sort((a, b) => b.specificity - a.specificity);
    
    if (debug) {
      console.log(`Style matching for "${styleName}":`);
      console.log(`  Found ${styleMatches.length} potential matches:`);
      styleMatches.slice(0, 5).forEach((match, i) => {
        console.log(`    ${i + 1}. "${match.styleKey}" (score: ${match.specificity}, carbonation: ${match.range.typical})`);
      });
      console.log(`  → Selected: "${styleMatches[0].styleKey}" (carbonation: ${styleMatches[0].range.typical})`);
    }
    
    return styleMatches[0].range;
  }
  
  return null;
}

/**
 * Calculate style specificity score for intelligent matching
 * Higher scores indicate more specific/better matches
 * @param {string} styleKey - Style key from carbonation ranges
 * @param {string} styleName - Normalized input style name
 * @returns {number} Specificity score (0 = no match, higher = more specific)
 */
function calculateStyleSpecificity(styleKey, styleName) {
  // Generic terms that should have low priority
  const genericTerms = [
    'beer', 'ale', 'lager', 'belgian', 'american', 'english', 'german', 
    'seasonal', 'fruit', 'spiced', 'wheat', 'brown'
  ];
  
  // Highly specific style indicators that should get priority
  const specificTerms = [
    'saison', 'farmhouse', 'ipa', 'stout', 'porter', 'pilsner', 'witbier', 
    'lambic', 'gueuze', 'gose', 'kolsch', 'koelsch', 'bock', 'doppelbock', 'maibock',
    'weizen', 'weissbier', 'berliner weisse', 'tripel', 'quadrupel',
    'rauchbier', 'marzen', 'oktoberfest', 'schwarzbier', 'altbier', 'alt',
    'barleywine', 'mild', 'bitter', 'esb', 'sour', 'brett', 'vienna',
    'amber', 'golden', 'blonde', 'cream ale', 'grodziskie'
  ];
  
  // If no match at all, return 0
  if (!styleName.includes(styleKey) && !styleKey.includes(styleName)) {
    return 0;
  }
  
  let score = 0;
  
  // Base score for any match
  score += 10;
  
  // Bonus for longer, more descriptive style keys (indicates specificity)
  score += styleKey.length;
  
  // Major bonus for highly specific terms
  if (specificTerms.includes(styleKey)) {
    score += 50;
  }
  
  // Penalty for generic terms (but don't eliminate them completely)
  if (genericTerms.includes(styleKey)) {
    score -= 20;
  }
  
  // Major bonus for exact word boundary matches (not just substrings)
  const styleWords = styleName.split(/\s+/);
  const keyWords = styleKey.split(/\s+/);
  
  // Check if any word in the style name exactly matches any word in the key
  for (const styleWord of styleWords) {
    for (const keyWord of keyWords) {
      if (styleWord === keyWord) {
        score += 30; // Exact word match is very good
      }
    }
  }
  
  // Bonus if the style key is a complete word in the style name
  const wordBoundaryRegex = new RegExp(`\\b${styleKey.replace(/\s+/g, '\\s+')}\\b`);
  if (wordBoundaryRegex.test(styleName)) {
    score += 25;
  }
  
  // Penalty for very short generic matches (like just "ale" or "beer")
  if (styleKey.length <= 3 && genericTerms.includes(styleKey)) {
    score -= 15;
  }
  
  return Math.max(0, score); // Never return negative scores
}

/**
 * Calculate estimated carbonation for a recipe
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {string} Formatted carbonation string with calculated or existing value
 * @precondition recipeData.carbonation is valid number or undefined
 * @precondition recipeData.style.name is valid string or undefined
 */
function calculateEstimatedCarbonation(recipeData) {
  // If we already have a valid carbonation value, use it
  if (recipeData && recipeData.carbonation && typeof recipeData.carbonation === 'number' && recipeData.carbonation > 0 && isFinite(recipeData.carbonation)) {
    return recipeData.carbonation.toFixed(1);
  }
  
  // Try to estimate from style (if recipe data exists)
  const styleName = recipeData?.style?.name;
  if (styleName) {
    const styleRange = matchStyleToCarbonationRange(styleName);
    if (styleRange) {
      return styleRange.typical.toFixed(1);
    }
  }
  
  // Fallback to default
  return DEFAULT_CARBONATION.toFixed(1);
}

/**
 * Get numeric carbonation value (calculated or existing)
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {number|null} Numeric carbonation value or null if unavailable
 * @precondition recipeData.carbonation is valid number or undefined
 * @precondition recipeData.style.name is valid string or undefined
 */
function getNumericCarbonation(recipeData) {
  // Return existing carbonation if available and valid
  if (recipeData && recipeData.carbonation && typeof recipeData.carbonation === 'number' && recipeData.carbonation > 0 && isFinite(recipeData.carbonation)) {
    return recipeData.carbonation;
  }
  
  // Try to estimate from style (if recipe data exists)
  const styleName = recipeData?.style?.name;
  if (styleName) {
    const styleRange = matchStyleToCarbonationRange(styleName);
    if (styleRange) {
      return styleRange.typical;
    }
  }
  
  // Fallback to default
  return DEFAULT_CARBONATION;
}

/**
 * Get carbonation range for a beer style
 * @param {Object} recipeData - Pre-validated recipe data from RecipeValidator
 * @returns {Object} Carbonation range with min, max, and typical values
 * @precondition recipeData.style.name is valid string or undefined
 */
function getCarbonationRange(recipeData) {
  if (!recipeData) {
    return { min: DEFAULT_CARB_MIN, max: DEFAULT_CARB_MAX, typical: DEFAULT_CARBONATION }; // Default fallback
  }
  const styleName = recipeData.style?.name;
  if (styleName) {
    const styleRange = matchStyleToCarbonationRange(styleName);
    if (styleRange) {
      return styleRange;
    }
  }
  
  // Fallback to default range
  return {
    min: DEFAULT_CARB_MIN,
    max: DEFAULT_CARB_MAX,
    typical: DEFAULT_CARBONATION
  };
}

/**
 * Parse carbonation from formatted string back to number
 * @param {string} formattedCarbonation - Formatted carbonation string
 * @returns {number|null} Parsed carbonation or null if invalid
 * @precondition formattedCarbonation is string or undefined
 */
function parseCarbonationFromFormatted(formattedCarbonation) {
  if (!formattedCarbonation || formattedCarbonation === '—') {
    return null;
  }
  
  // Ensure input is a string before calling replace
  if (typeof formattedCarbonation !== 'string') {
    return null;
  }
  
  // Remove any formatting and parse as float
  const cleaned = formattedCarbonation.replace(/[^\d.]/g, '');
  const parsed = parseFloat(cleaned);
  
  return parsed || null;
}

/**
 * Validate carbonation calculation by checking style matching
 * @param {string} styleName - Pre-validated beer style name from RecipeValidator
 * @returns {Object} Validation result with details
 * @precondition styleName is valid string or undefined
 */
function validateCarbonationCalculation(styleName) {
  // Handle invalid input
  if (!styleName || typeof styleName !== 'string') {
    return {
      isValid: false,
      reason: 'Validation error: Invalid or missing style name',
      matchedStyle: styleName,
      range: null
    };
  }
  
  const styleRange = matchStyleToCarbonationRange(styleName);
  
  return {
    isValid: !!styleRange,
    reason: styleRange ? `Matched style: ${styleName}` : `No carbonation data for style: ${styleName}`,
    matchedStyle: styleName,
    range: styleRange
  };
}

// Export safe wrappers for all calculation functions
const safeCalculateEstimatedCarbonation = (recipeData) => 
    safeCalculation(() => calculateEstimatedCarbonation(recipeData), DEFAULT_CARBONATION.toFixed(1), {
        calculator: 'carbonation',
        operation: 'estimated_carbonation'
    });

const safeGetNumericCarbonation = (recipeData) => 
    safeCalculation(() => getNumericCarbonation(recipeData), DEFAULT_CARBONATION, {
        calculator: 'carbonation',
        operation: 'numeric_carbonation'
    });

const safeGetCarbonationRange = (recipeData) => 
    safeCalculation(() => getCarbonationRange(recipeData), { min: DEFAULT_CARB_MIN, max: DEFAULT_CARB_MAX, typical: DEFAULT_CARBONATION }, {
        calculator: 'carbonation',
        operation: 'carbonation_range'
    });

const safeParseCarbonationFromFormatted = (formattedCarbonation) => 
    safeCalculation(() => parseCarbonationFromFormatted(formattedCarbonation), null, {
        calculator: 'carbonation',
        operation: 'parse_formatted'
    });

const safeValidateCarbonationCalculation = (styleName) => 
    safeCalculation(() => validateCarbonationCalculation(styleName), { isValid: false, reason: 'Validation error', matchedStyle: null, range: null }, {
        calculator: 'carbonation',
        operation: 'validate'
    });

const safeMatchStyleToCarbonationRange = (styleName) => 
    safeCalculation(() => matchStyleToCarbonationRange(styleName), null, {
        calculator: 'carbonation',
        operation: 'match_style'
    });

export {
  safeCalculateEstimatedCarbonation as calculateEstimatedCarbonation,
  safeGetNumericCarbonation as getNumericCarbonation,
  safeGetCarbonationRange as getCarbonationRange,
  safeParseCarbonationFromFormatted as parseCarbonationFromFormatted,
  safeValidateCarbonationCalculation as validateCarbonationCalculation,
  safeMatchStyleToCarbonationRange as matchStyleToCarbonationRange,
  STYLE_CARBONATION_RANGES
};
