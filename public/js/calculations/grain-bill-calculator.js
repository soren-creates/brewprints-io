/**
 * Grain Bill Calculator - Atomic Calculator Pattern
 * 
 * Handles grain bill analysis including total weights, diastatic power,
 * and mash conversion capability assessment.
 * 
 * ARCHITECTURAL PATTERN: Atomic Calculator
 * - Single-responsibility calculations with automatic error handling
 * - Uses safeCalculation() wrapper for consistent fallback behavior
 * - Returns formatted values or fallbacks, never throws exceptions
 * - Focused on brewing-specific grain bill calculations
 */

import { safeCalculation } from '../utilities/errors/error-utils.js';

/**
 * Calculate total weight of all fermentable ingredients
 * @param {Array} fermentables - Array of fermentable objects
 * @returns {number} Total fermentable weight in kg
 */
function calculateTotalFermentablesWeight(fermentables) {
    if (!Array.isArray(fermentables)) return 0;
    
    return fermentables.reduce((total, fermentable) => {
        if (!fermentable) return total;
        const amount = parseFloat(fermentable.amount) || 0;
        return total + amount;
    }, 0);
}

/**
 * Calculate total diastatic power of the grain bill
 * @param {Array} fermentables - Array of fermentable objects
 * @returns {number} Total diastatic power in degrees Lintner
 */
function calculateDiastaticPowerTotal(fermentables) {
    if (!Array.isArray(fermentables)) return 0;
    
    // Diastatic power values for common grains (degrees Lintner)
    // Order matters - more specific matches should come first
    const diastaticPowerMap = {
        // No diastatic power (check these first for precedence)
        'crystal': 0,
        'caramel': 0,
        'chocolate': 0,
        'black': 0,
        'roasted': 0,
        'special b': 0,
        'carafa': 0,
        'midnight wheat': 0,
        'blackprinz': 0,
        'dehusked': 0,
        
        // Adjuncts
        'flaked': 0,
        'corn': 0,
        'rice': 0,
        'oats': 0,
        'sugar': 0,
        'honey': 0,
        'extract': 0,
        
        // Specialty malts with some power
        'vienna': 50,
        'munich': 40,
        'mild ale': 60,
        
        // Base malts (check these last)
        'pale malt': 160,
        'pilsner malt': 160,
        'pilsner': 160,  // Also match just "pilsner"
        'pale ale malt': 160,
        'maris otter': 120,
        'golden promise': 120,
        '2-row': 160,
        '2 row': 160,  // Normalized version
        '6-row': 180,
        '6 row': 180,  // Normalized version
        'wheat malt': 120,
        'rye malt': 120
    };
    
    const totalWeight = calculateTotalFermentablesWeight(fermentables);
    if (totalWeight === 0) return 0;
    
    const weightedPower = fermentables.reduce((total, fermentable) => {
        if (!fermentable) return total;
        const amount = parseFloat(fermentable.amount) || 0;
        const name = fermentable.name ? fermentable.name.toLowerCase() : '';
        
        // Normalize name for matching (replace special characters with spaces)
        const normalizedName = name.replace(/[-_°]/g, ' ').replace(/\s+/g, ' ').trim();
        
        // Find matching diastatic power
        let diastaticPower = 0;
        for (const [grain, power] of Object.entries(diastaticPowerMap)) {
            if (normalizedName.includes(grain)) {
                diastaticPower = power;
                break;
            }
        }
        
        return total + (amount * diastaticPower);
    }, 0);
    
    return weightedPower / totalWeight;
}

/**
 * Determine mash conversion capability based on diastatic power
 * @param {number} diastaticPower - Total diastatic power in degrees Lintner
 * @param {number} specialtyPercent - Percentage of specialty grains (optional)
 * @returns {Object} Mash conversion analysis
 */
function analyzeMashConversion(diastaticPower, specialtyPercent = 0) {
    let capability = 'Unknown';
    let recommendation = '';
    // Use CSS variables for consistent colors
    let color = getComputedStyle(document.documentElement).getPropertyValue('--gray-300').trim();
    
    if (diastaticPower >= 120) {
        capability = 'Excellent';
        recommendation = 'Strong enzymatic power for single infusion mash';
        color = getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim();
    } else if (diastaticPower >= 80) {
        capability = 'Good';
        recommendation = 'Sufficient for most single infusion mashes';
        color = getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim();
    } else if (diastaticPower >= 40) {
        capability = 'Adequate';
        recommendation = 'May benefit from step mash or longer rest';
        color = getComputedStyle(document.documentElement).getPropertyValue('--warning-color').trim();
    } else if (diastaticPower >= 20) {
        capability = 'Marginal';
        recommendation = 'Step mash or base malt addition recommended';
        color = getComputedStyle(document.documentElement).getPropertyValue('--warning-color').trim();
    } else {
        capability = 'Insufficient';
        recommendation = 'Requires base malt addition or external enzymes';
        color = getComputedStyle(document.documentElement).getPropertyValue('--error-color').trim();
    }
    
    // Adjust for high specialty grain percentage
    if (specialtyPercent > 30) {
        recommendation += '. High specialty grain percentage may require lower mash temperature.';
    }
    
    return {
        capability,
        recommendation,
        color,
        diastaticPower: Math.round(diastaticPower),
        specialtyPercent: Math.round(specialtyPercent)
    };
}

/**
 * Analyze grain bill composition and characteristics
 * @param {Array} fermentables - Array of fermentable objects
 * @returns {Object} Grain bill analysis
 */
function analyzeGrainBill(fermentables) {
    if (!Array.isArray(fermentables) || fermentables.length === 0) {
        return {
            totalWeight: 0,
            basePercent: 0,
            specialtyPercent: 0,
            diastaticPower: 0,
            conversionCapability: analyzeMashConversion(0, 0)
        };
    }
    
    const totalWeight = calculateTotalFermentablesWeight(fermentables);
    const diastaticPower = calculateDiastaticPowerTotal(fermentables);
    
    // Categorize grains
    let baseWeight = 0;
    let specialtyWeight = 0;
    
    fermentables.forEach(fermentable => {
        if (!fermentable) return;
        const amount = parseFloat(fermentable.amount) || 0;
        const name = fermentable.name ? fermentable.name.toLowerCase() : '';
        
        // Check for specialty grains first (takes precedence)
        const isSpecialtyGrain = name.includes('crystal') || name.includes('caramel') ||
                                name.includes('chocolate') || name.includes('black') ||
                                name.includes('roasted') || name.includes('vienna') ||
                                name.includes('munich') || name.includes('special b') ||
                                name.includes('carafa') || name.includes('flaked') ||
                                name.includes('corn') || name.includes('rice') ||
                                name.includes('sugar') || name.includes('honey') ||
                                name.includes('extract');
        
        // Identify base malts (only if not specialty)
        const isBaseMalt = !isSpecialtyGrain && (
                          name.includes('pale') || name.includes('pilsner') || 
                          name.includes('2-row') || name.includes('6-row') || 
                          name.includes('maris otter') || name.includes('golden promise') ||
                          name.includes('wheat malt'));
        
        if (isBaseMalt) {
            baseWeight += amount;
        } else {
            specialtyWeight += amount;
        }
    });
    
    const basePercent = totalWeight > 0 ? (baseWeight / totalWeight) * 100 : 0;
    const specialtyPercent = totalWeight > 0 ? (specialtyWeight / totalWeight) * 100 : 0;
    
    return {
        totalWeight: Math.round(totalWeight * 100) / 100,
        basePercent: Math.round(basePercent),
        specialtyPercent: Math.round(specialtyPercent),
        diastaticPower: Math.round(diastaticPower),
        conversionCapability: analyzeMashConversion(diastaticPower, specialtyPercent)
    };
}

// Export safe wrappers for all calculation functions
const safeCalculateTotalFermentablesWeight = (fermentables) => 
    safeCalculation(() => calculateTotalFermentablesWeight(fermentables), 0, {
        calculator: 'grain_bill',
        operation: 'total_weight'
    });

const safeCalculateDiastaticPowerTotal = (fermentables) => 
    safeCalculation(() => calculateDiastaticPowerTotal(fermentables), 0, {
        calculator: 'grain_bill',
        operation: 'diastatic_power'
    });

const safeAnalyzeMashConversion = (diastaticPower, specialtyPercent = 0) => 
    safeCalculation(() => analyzeMashConversion(diastaticPower, specialtyPercent), {
        capability: 'Unknown',
        recommendation: 'Analysis failed',
        color: getComputedStyle(document.documentElement).getPropertyValue('--gray-300').trim(),
        diastaticPower: 0,
        specialtyPercent: 0
    }, {
        calculator: 'grain_bill',
        operation: 'mash_conversion'
    });

const safeAnalyzeGrainBill = (fermentables) => 
    safeCalculation(() => analyzeGrainBill(fermentables), {
        totalWeight: 0,
        basePercent: 0,
        specialtyPercent: 0,
        diastaticPower: 0,
        conversionCapability: {
            capability: 'Unknown',
            recommendation: 'Analysis failed',
            color: getComputedStyle(document.documentElement).getPropertyValue('--gray-300').trim(),
            diastaticPower: 0,
            specialtyPercent: 0
        }
    }, {
        calculator: 'grain_bill',
        operation: 'grain_bill_analysis'
    });

export {
    safeCalculateTotalFermentablesWeight as calculateTotalFermentablesWeight,
    safeCalculateDiastaticPowerTotal as calculateDiastaticPowerTotal,
    safeAnalyzeMashConversion as analyzeMashConversion,
    safeAnalyzeGrainBill as analyzeGrainBill
};