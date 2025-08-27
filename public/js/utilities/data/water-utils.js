/**
 * Water Calculation Utilities
 * 
 * Utility functions for water volume calculations including boil-off rate
 * conversions, validation, and recipe classification.
 */

import { isValidNumber } from '../validation/validation-utils.js';

/**
 * Convert absolute boil-off rate to percentage rate
 * @param {number} boilOffRateLHr - Boil-off rate in liters per hour
 * @param {number} preBoilVolumeL - Pre-boil volume in liters
 * @returns {number} Percentage rate per hour
 */
export function boilOffRateToPercentage(boilOffRateLHr, preBoilVolumeL) {
  if (!isValidNumber(preBoilVolumeL, { allowZero: false, allowNegative: false, min: 0, max: Number.MAX_SAFE_INTEGER })) {
    return 0;
  }
  if (!isValidNumber(boilOffRateLHr, { allowNegative: false, min: 0, max: Number.MAX_SAFE_INTEGER })) {
    return 0;
  }
  return (boilOffRateLHr / preBoilVolumeL) * 100;
}

/**
 * Convert percentage evaporation rate to absolute boil-off rate
 * @param {number} evapRatePercent - Evaporation rate as percentage per hour
 * @param {number} preBoilVolumeL - Pre-boil volume in liters
 * @returns {number} Boil-off rate in liters per hour
 */
export function percentageToBoilOffRate(evapRatePercent, preBoilVolumeL) {
  if (!isValidNumber(evapRatePercent, { allowNegative: false, min: 0, max: Number.MAX_SAFE_INTEGER })) {
    return 0;
  }
  if (!isValidNumber(preBoilVolumeL, { allowZero: false, allowNegative: false, min: 0, max: Number.MAX_SAFE_INTEGER })) {
    return 0;
  }
  return (evapRatePercent / 100) * preBoilVolumeL;
}