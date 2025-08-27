/**
 * Hop Calculator - Atomic Calculator Pattern
 * 
 * Provides calculations for hop weights, rates, and timing analysis.
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific hop calculations
 */

import { KG_TO_OZ } from '../core/constants.js';
import { safeCalculation } from '../utilities/errors/error-utils.js';
import { normalizeHopUse, INTERNAL_HOP_USES, isDryHop, isAromaHop, isFlavorHop } from '../utilities/hop-use-normalizer.js';

/**
 * Calculate the rounded display weight in grams (matching display format)
 * @param {number} kg - Weight in kilograms
 * @returns {number} Rounded weight in grams matching display format
 */
function getRoundedDisplayWeight(kg) {
    const oz = kg * KG_TO_OZ;
    // Round to 2 decimal places, then convert back to grams
    const roundedOz = Math.round(oz * 100) / 100;
    return roundedOz * 28.3495; // Convert oz back to grams
}

/**
 * Extract hop data from various hop object structures (BeerJSON or legacy)
 * Centralizes the repeated pattern of accessing hop timing and amount data
 * @param {Object} hop - Hop object in any supported format
 * @returns {Object} Standardized hop data access
 */
function extractHopData(hop) {
    return {
        time: hop.timing?.time?.value || parseFloat(hop.time) || 0,
        use: hop.timing?.use || hop.use,
        amount: hop.amount?.value || parseFloat(hop.amount) || 0,
        unit: hop.amount?.unit
    };
}

/**
 * Ensure hop use is normalized and return the internal use type
 * @param {Object} hop - Hop object with use, time, and sourceFormat properties
 * @returns {string} Normalized internal hop use type
 */
function ensureNormalizedHopUse(hop) {
    const hopData = extractHopData(hop);
    
    if (!hopData.use) {
        return INTERNAL_HOP_USES.BITTERING; // Default fallback
    }
    
    // Check if hop use is already normalized (internal format)
    if (Object.values(INTERNAL_HOP_USES).includes(hopData.use)) {
        return hopData.use; // Already normalized - use directly
    }
    
    // Not normalized - normalize it
    // Use original Brewfather use if available, otherwise use the converted use
    const useToNormalize = hop.originalBrewfatherUse || hopData.use;
    const sourceFormat = hop.sourceFormat || 'unknown';
    
    const normalized = normalizeHopUse(useToNormalize, hopData.time, sourceFormat);
    return normalized.use;
}

/**
 * Process hop amount for calculation (convert to rounded display weight)
 * @param {Object} hop - Hop object with amount property
 * @returns {number} Rounded weight in grams matching display format
 */
function processHopAmountForCalculation(hop) {
    const hopData = extractHopData(hop);
    
    // Check if the amount is already in grams or needs conversion from kg
    if (hopData.unit === 'g' || hopData.unit === 'gram') {
        // Already in grams, just round to match display format
        return Math.round(hopData.amount * 100) / 100;
    } else {
        // Assume kg and convert using getRoundedDisplayWeight
        return getRoundedDisplayWeight(hopData.amount);
    }
}

/**
 * Calculate total weight of all hop additions using rounded display values
 * @param {Array} hops - Array of hop objects (amounts in kg from BeerXML)
 * @returns {number} Total hop weight in grams (sum of rounded display weights)
 */
function calculateTotalHopWeight(hops) {
    if (!Array.isArray(hops)) return 0;
    
    return hops.reduce((total, hop) => {
        return total + processHopAmountForCalculation(hop);
    }, 0);
}

/**
 * Calculate dry hopping rate in grams per liter
 * @param {Array} hops - Array of hop objects (amounts in kg from BeerXML)
 * @param {number} batchSize - Batch size in liters
 * @returns {number} Dry hop rate in g/L
 */
function calculateDryHopRate(hops, batchSize) {
    if (!Array.isArray(hops) || !batchSize) return 0;
    
    const dryHopWeight = hops.reduce((total, hop) => {
        const normalizedUse = ensureNormalizedHopUse(hop);
        if (isDryHop(normalizedUse)) {
            return total + processHopAmountForCalculation(hop);
        }
        return total;
    }, 0);
    
    return dryHopWeight / batchSize;
}

/**
 * Calculate aroma hopping rate (late additions + whirlpool) in grams per liter
 * @param {Array} hops - Array of hop objects (amounts in kg from BeerXML)
 * @param {number} batchSize - Batch size in liters
 * @returns {number} Aroma hop rate in g/L
 */
function calculateAromaHopRate(hops, batchSize) {
    if (!Array.isArray(hops) || !batchSize) return 0;
    
    const aromaHopWeight = hops.reduce((total, hop) => {
        const normalizedUse = ensureNormalizedHopUse(hop);
        
        // Include aroma and whirlpool additions
        if (isAromaHop(normalizedUse)) {
            return total + processHopAmountForCalculation(hop);
        }
        return total;
    }, 0);
    
    return aromaHopWeight / batchSize;
}

/**
 * Get hop timing breakdown analysis
 * @param {Array} hops - Array of hop objects (amounts in kg from BeerXML)
 * @returns {Object} Breakdown of hop additions by timing (weights in grams)
 */
function getHopTimingBreakdown(hops) {
    if (!Array.isArray(hops)) {
        return {
            bittering: 0,
            flavor: 0,
            aroma: 0,
            dryHop: 0,
            total: 0
        };
    }
    
    const breakdown = hops.reduce((acc, hop) => {
        const amountInGrams = processHopAmountForCalculation(hop);
        const normalizedUse = ensureNormalizedHopUse(hop);
        
        if (isDryHop(normalizedUse)) {
            acc.dryHop += amountInGrams;
        } else if (isAromaHop(normalizedUse)) {
            acc.aroma += amountInGrams;
        } else if (isFlavorHop(normalizedUse)) {
            acc.flavor += amountInGrams;
        } else {
            // Group bittering, mash, first wort, and unknown types with bittering for display purposes
            acc.bittering += amountInGrams;
        }
        
        acc.total += amountInGrams;
        return acc;
    }, {
        bittering: 0,
        flavor: 0,
        aroma: 0,
        dryHop: 0,
        total: 0
    });
    
    return breakdown;
}

/**
 * Calculate hop utilization percentage based on timing
 * @param {Array} hops - Array of hop objects (amounts in kg from BeerXML)
 * @returns {number} Average hop utilization percentage
 */
function calculateHopUtilization(hops) {
    if (!Array.isArray(hops) || hops.length === 0) return 0;
    
    const totalUtilization = hops.reduce((total, hop) => {
        const hopData = extractHopData(hop);
        const amountInGrams = processHopAmountForCalculation(hop);
        
        // More accurate utilization curve (Tinseth-inspired)
        let utilization = 0;
        if (hopData.time >= 60) utilization = 25;      // Reduced from 30
        else if (hopData.time >= 45) utilization = 20; // New bracket  
        else if (hopData.time >= 30) utilization = 15; // Reduced from 25
        else if (hopData.time >= 15) utilization = 10; // Reduced from 20
        else if (hopData.time >= 5) utilization = 5;   // Reduced from 15
        else if (hopData.time >= 0) utilization = 2;   // Reduced from 10
        
        return total + (utilization * amountInGrams);
    }, 0);
    
    const totalWeight = calculateTotalHopWeight(hops);
    return totalWeight > 0 ? totalUtilization / totalWeight : 0;
}

// Export safe wrappers for all calculation functions
const safeGetRoundedDisplayWeight = (kg) => 
    safeCalculation(() => getRoundedDisplayWeight(kg), 0, {
        calculator: 'hop',
        operation: 'display_weight'
    });

const safeCalculateTotalHopWeight = (hops) => 
    safeCalculation(() => calculateTotalHopWeight(hops), 0, {
        calculator: 'hop',
        operation: 'total_weight'
    });

const safeCalculateDryHopRate = (hops, batchSize) => 
    safeCalculation(() => calculateDryHopRate(hops, batchSize), 0, {
        calculator: 'hop',
        operation: 'dry_hop_rate'
    });

const safeCalculateAromaHopRate = (hops, batchSize) => 
    safeCalculation(() => calculateAromaHopRate(hops, batchSize), 0, {
        calculator: 'hop',
        operation: 'aroma_hop_rate'
    });

const safeGetHopTimingBreakdown = (hops) => 
    safeCalculation(() => getHopTimingBreakdown(hops), { bittering: 0, flavor: 0, aroma: 0, dryHop: 0, total: 0 }, {
        calculator: 'hop',
        operation: 'timing_breakdown'
    });

const safeCalculateHopUtilization = (hops) => 
    safeCalculation(() => calculateHopUtilization(hops), 0, {
        calculator: 'hop',
        operation: 'utilization'
    });

export {
    safeGetRoundedDisplayWeight as getRoundedDisplayWeight,
    safeCalculateTotalHopWeight as calculateTotalHopWeight,
    safeCalculateDryHopRate as calculateDryHopRate,
    safeCalculateAromaHopRate as calculateAromaHopRate,
    safeGetHopTimingBreakdown as getHopTimingBreakdown,
    safeCalculateHopUtilization as calculateHopUtilization
};