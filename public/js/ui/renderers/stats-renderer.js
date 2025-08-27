/**
 * Stats Renderer
 * Handles rendering of recipe statistics with style ranges and visual indicators
 */

import { STAT_BASE_RANGES, GRAVITY_TARGET_RANGE_SIZE, GRAVITY_PADDING } from '../../core/constants.js';
import { 
  isValidNumber,
  isValidGravity,
  isValidABV,
  isValidAmount
} from '../../utilities/validation/validation-utils.js';
import { parseAbvFromFormatted } from '../../utilities/formatting/formatting-utils.js';
import { BaseRenderer } from './base-renderer.js';
import { errorHandler } from '../../utilities/errors/error-handler.js';
import { FormatError } from '../../utilities/errors/application-errors.js';

class StatsRenderer extends BaseRenderer {
  constructor() {
    super();
  }

  render(recipe, container) {
    if (!recipe || !container) return;
    
    const statsHTML = this.renderStatsWithRanges(recipe);
    container.insertAdjacentHTML('beforeend', statsHTML);
  }

  renderStatsWithRanges(recipe) {
    const style = recipe.style;
    return `
      <div class="stats-with-ranges">
        <h2 class="section-title">
          <span>Recipe Targets (${this.escapeHtml(style.name)})</span>
          <span class="actuals-label">Actuals</span>
        </h2>
        <div class="stat-ranges">
          ${this.renderStatRange('ABV', recipe.abv, style.abvMin, style.abvMax, recipe.abvFormatted)}
          ${this.renderStatRange('OG', recipe.og, style.ogMin, style.ogMax, recipe.ogFormatted)}
          ${this.renderStatRange('FG', recipe.fg, style.fgMin, style.fgMax, recipe.fgFormatted)}
          ${this.renderStatRange('IBU', recipe.ibu, style.ibuMin, style.ibuMax, recipe.ibuFormatted)}
          ${this.renderStatRange('SRM', recipe.srm, style.colorMin, style.colorMax, recipe.srmFormatted)}
          ${this.renderStatRange('CO₂', recipe.carbonation, style.carbMin, style.carbMax, recipe.carbonationFormatted)}
        </div>
      </div>
    `;
  }

  renderStatRange(label, recipeValue, styleMin, styleMax, formattedValue) {
    // Handle undefined recipe values - show simple display without range calculations
    if (!isValidNumber(recipeValue, { allowZero: true, allowNegative: true, min: -Infinity, max: Infinity })) {
      return `
        <div class="stat-range no-recipe-value">
          <div class="stat-range-row">
            <span class="stat-range-label">${label}</span>
            <div class="stat-range-value">${formattedValue}</div>
            <span class="actual-measurement-field actual-${label.toLowerCase().replace(' ', '-')}-field">&nbsp;</span>
          </div>
        </div>
      `;
    }

    // Always show range bars for main brewing stats, even without style values
    const showRangeBar = ['ABV', 'OG', 'FG', 'IBU', 'SRM', 'CO₂'].includes(label);
    
    // Early validation: if style min/max are undefined, return a simple display for non-brewing stats
    if (!isValidNumber(styleMin, { allowZero: true, allowNegative: false, min: 0, max: 200 }) || 
        !isValidNumber(styleMax, { allowZero: true, allowNegative: false, min: 0, max: 200 })) {
      if (!showRangeBar) {
        return `
          <div class="stat-range no-style-range">
            <div class="stat-range-row">
              <span class="stat-range-label">${label}</span>
              <div class="stat-range-value">${formattedValue}</div>
              <span class="actual-measurement-field actual-${label.toLowerCase().replace(' ', '-')}-field">&nbsp;</span>
            </div>
          </div>
        `;
      }
      // For brewing stats without style values, we'll continue with the range bar but hide style elements
    }

    // Define base ranges for each stat type
    const baseRanges = STAT_BASE_RANGES;
    
    // Calculate dynamic range for gravity stats (OG and FG)
    let fullRange = baseRanges[label];
    if ((label === 'OG' || label === 'FG') && isValidGravity(styleMin) && isValidGravity(styleMax)) {
      const targetRangeSize = GRAVITY_TARGET_RANGE_SIZE; // 60 gravity points
      const padding = GRAVITY_PADDING; // 18 gravity points padding
      const styleRange = styleMax - styleMin;
      
      // Check if style extends beyond base range OR is close to base range boundaries
      const extendsBelow = styleMin < fullRange.min;
      const extendsAbove = styleMax > fullRange.max;
      const closeToMinBoundary = (styleMin - fullRange.min) <= padding;
      const closeToMaxBoundary = (fullRange.max - styleMax) <= padding;
      
      const needsAdjustment = extendsBelow || extendsAbove || closeToMinBoundary || closeToMaxBoundary || styleRange > targetRangeSize;
      
      if (needsAdjustment) {
        let newMin, newMax;
        
        if (styleRange > targetRangeSize) {
          // Style range exceeds target, add padding on both sides
          newMin = styleMin - padding;
          newMax = styleMax + padding;
        } else {
          // Style fits within target range, slide window to accommodate extremes and provide padding
          if (extendsBelow || closeToMinBoundary) {
            // Style extends below base range or is close to min boundary, slide window down
            newMin = styleMin - padding;
            newMax = newMin + targetRangeSize;
          } else if (extendsAbove || closeToMaxBoundary) {
            // Style extends above base range or is close to max boundary, slide window up
            newMax = styleMax + padding;
            newMin = newMax - targetRangeSize;
            
            // Ensure the style minimum is not cut off by the adjusted range
            if (newMin > styleMin) {
              newMin = styleMin - padding;
              // Preserve the maximum padding by using the larger of the two calculated max values
              newMax = Math.max(styleMax + padding, newMin + targetRangeSize);
            }
          } else {
            // Style fits comfortably within base range, use default range
            newMin = fullRange.min;
            newMax = fullRange.max;
          }
        }
        
        fullRange = { min: newMin, max: newMax };
      }
    }
    
    let position, styleRangeStart, styleRangeWidth;
    
    if (fullRange) {
      // Calculate positions based on full range
      const totalRange = fullRange.max - fullRange.min;
      
      // Use rounded display value for positioning to match what's shown to user
      let valueForPositioning = recipeValue;
      if (label === 'ABV') {
        valueForPositioning = parseAbvFromFormatted(formattedValue);
      } else if (label === 'OG' || label === 'FG') {
        // Parse the formatted gravity value (e.g., "1.050" -> 1.050)
        valueForPositioning = parseFloat(formattedValue) || recipeValue;
      } else if (formattedValue && typeof formattedValue === 'string') {
        // For other stats, try to parse the formatted value
        const parsed = parseFloat(formattedValue);
        if (!isNaN(parsed)) {
          valueForPositioning = parsed;
        }
      }
      
      // Position of recipe value within full range
      position = totalRange > 0 ? Math.max(0, Math.min(100, ((valueForPositioning - fullRange.min) / totalRange) * 100)) : 50;
      
      // Style range position and width within full range (only if style values exist)
      if (isValidNumber(styleMin, { allowZero: true, allowNegative: false, min: 0, max: 200 }) && 
          isValidNumber(styleMax, { allowZero: true, allowNegative: false, min: 0, max: 200 })) {
        const styleRange = styleMax - styleMin;
        styleRangeStart = totalRange > 0 ? ((styleMin - fullRange.min) / totalRange) * 100 : 0;
        styleRangeWidth = totalRange > 0 ? (styleRange / totalRange) * 100 : 100;
      } else {
        // No style values - don't show style range
        styleRangeStart = 0;
        styleRangeWidth = 0;
      }
    } else {
      // Use rounded display value for positioning to match what's shown to user
      let valueForPositioning = recipeValue;
      if (label === 'ABV') {
        valueForPositioning = parseAbvFromFormatted(formattedValue);
      } else if (label === 'OG' || label === 'FG') {
        // Parse the formatted gravity value (e.g., "1.050" -> 1.050)
        valueForPositioning = parseFloat(formattedValue) || recipeValue;
      } else if (formattedValue && typeof formattedValue === 'string') {
        // For other stats, try to parse the formatted value
        const parsed = parseFloat(formattedValue);
        if (!isNaN(parsed)) {
          valueForPositioning = parsed;
        }
      }
      
      // Fallback to original behavior for unknown stats
      if (isValidNumber(styleMin, { allowZero: true, allowNegative: false, min: 0, max: 200 }) && 
          isValidNumber(styleMax, { allowZero: true, allowNegative: false, min: 0, max: 200 })) {
        const range = styleMax - styleMin;
        position = range > 0 ? Math.max(0, Math.min(100, ((valueForPositioning - styleMin) / range) * 100)) : 50;
        styleRangeStart = 0;
        styleRangeWidth = 100;
      } else {
        // No style values - center the recipe value
        position = 50;
        styleRangeStart = 0;
        styleRangeWidth = 0;
      }
    }
    
    // Use formattedValue to prevent precision issues in display
    let displayValue = formattedValue;
    
    // Format ABV value as number for comparison
    if (label === 'ABV') { displayValue = parseAbvFromFormatted(formattedValue); }

    // Determine if formatted recipe value is within style range (only if style values exist)
    const inRange = (isValidNumber(styleMin, { allowZero: true, allowNegative: false, min: 0, max: 200 }) && 
                     isValidNumber(styleMax, { allowZero: true, allowNegative: false, min: 0, max: 200 })) 
      ? (displayValue >= styleMin && displayValue <= styleMax)
      : true; // Default to in-range if no style values
    const statusClass = inRange ? 'in-range' : 'out-of-range';
    
    // Format decimal places and units based on the stat type
    let decimalPlaces = 0;
    let unit = '';
    if (label === 'ABV') {
      decimalPlaces = 1;
      unit = '%';
    } else if (label === 'OG' || label === 'FG') {
      decimalPlaces = 3;
    } else if (label === 'CO₂') {
      decimalPlaces = 1;
      unit = ''; // Remove "vol" unit for carbonation
    }

    // Use the same valueForPositioning for consistent positioning logic
    let valueForPositioning = recipeValue;
    if (label === 'ABV') {
      valueForPositioning = parseAbvFromFormatted(formattedValue);
    } else if (label === 'OG' || label === 'FG') {
      // Parse the formatted gravity value (e.g., "1.050" -> 1.050)
      valueForPositioning = parseFloat(formattedValue) || recipeValue;
    } else if (formattedValue && typeof formattedValue === 'string') {
      // For other stats, try to parse the formatted value
      const parsed = parseFloat(formattedValue);
      if (!isNaN(parsed)) {
        valueForPositioning = parsed;
      }
    }
    
    // Determine positioning based on recipe value relative to style range
    const positioning = this.calculateValuePositioning(valueForPositioning, styleMin, styleMax, styleRangeStart, styleRangeWidth);
    
    // Position min/max values based on recipe value position
    let minValuePos, maxValuePos;
    const spacing = 0; // Percentage spacing from range boundaries

    if (positioning.recipePosition === 'below-range' || styleMin === 0) {
      // Recipe below range OR style min is zero: min value extends into style range (right of boundary)
      minValuePos = Math.min(100, styleRangeStart + spacing);
      maxValuePos = Math.min(100, styleRangeStart + styleRangeWidth + spacing);
    } else if (positioning.recipePosition === 'above-range') {
      // Recipe above range: max value right-aligned to boundary (extends left into style range)
      minValuePos = Math.max(0, styleRangeStart - spacing);
      maxValuePos = styleRangeStart + styleRangeWidth; // Right-aligned to max boundary
    } else {
      // Recipe within range: standard positioning outside range
      minValuePos = Math.max(0, styleRangeStart - spacing);
      maxValuePos = Math.min(100, styleRangeStart + styleRangeWidth + spacing);
    }
    
    // Validate calculated values to prevent NaN/Infinity CSS values
    const safePosition = isValidNumber(position, { allowZero: true, allowNegative: false, min: 0, max: 100 }) ? position : 50;
    const safeStyleRangeStart = isValidNumber(styleRangeStart, { allowZero: true, allowNegative: false, min: 0, max: 100 }) ? styleRangeStart : 0;
    const safeStyleRangeWidth = isValidNumber(styleRangeWidth, { allowZero: true, allowNegative: false, min: 0, max: 100 }) ? styleRangeWidth : 100;
    const safeMinValuePos = isValidNumber(minValuePos, { allowZero: true, allowNegative: false, min: 0, max: 100 }) ? minValuePos : 0;
    const safeMaxValuePos = isValidNumber(maxValuePos, { allowZero: true, allowNegative: false, min: 0, max: 100 }) ? maxValuePos : 100;
    
    // Add debugging for invalid values
    const debugValues = {
      label,
      recipeValue,
      styleMin,
      styleMax,
      position,
      styleRangeStart,
      styleRangeWidth,
      minValuePos,
      maxValuePos,
      safePosition,
      safeStyleRangeStart,
      safeStyleRangeWidth,
      safeMinValuePos,
      safeMaxValuePos
    };
    
    // Check for any invalid values that could cause CSS errors
    const hasInvalidValues = Object.entries(debugValues).some(([key, value]) => {
      // Only check numeric values, skip strings like 'label'
      if (typeof value === 'number' && !isValidNumber(value, { allowZero: true, allowNegative: true, min: -Infinity, max: Infinity })) {
        errorHandler.handleError(new FormatError(`Invalid ${key} value for ${label}`, {
          userMessage: `Unable to display ${label} statistics correctly due to invalid data.`,
          severity: 'warning',
          recoverable: true,
          details: { renderer: 'stats', statistic: label, field: key, value }
        }), { context: 'stats_rendering' });
        return true;
      }
      return false;
    });
    
    if (hasInvalidValues) {
      errorHandler.handleError(new FormatError(`Invalid statistics values detected for ${label}`, {
        userMessage: 'Some recipe statistics may not display correctly.',
        severity: 'warning',
        recoverable: true,
        details: { 
          component: 'stats-renderer', 
          operation: 'validate-stat-values',
          label,
          debugValues,
          inputValues: { recipeValue, styleMin, styleMax, formattedValue }
        }
      }));
    }
    
    // Check if style min/max values would overlap with recipe value
    const shouldShowStyleMin = this.shouldShowStyleValue(valueForPositioning, styleMin, 'min', label);
    const shouldShowStyleMax = this.shouldShowStyleValue(valueForPositioning, styleMax, 'max', label);
    
    // Debug CSS values that will be used in the template
    const cssValues = {
      styleRangeLeft: `${safeStyleRangeStart}%`,
      styleRangeWidth: `${safeStyleRangeWidth}%`,
      indicatorLeft: `${safePosition}%`,
      minValueLeft: `${safeMinValuePos}%`,
      maxValueLeft: `${safeMaxValuePos}%`,
      recipeValueLeft: `${safePosition}%`
    };
    
    // Check for invalid CSS values
    Object.entries(cssValues).forEach(([property, value]) => {
      if (value.includes('NaN') || value.includes('Infinity')) {
        errorHandler.handleError(new FormatError(`Invalid CSS value for ${label} ${property}`, {
          userMessage: `Unable to display ${label} statistic chart correctly.`,
          severity: 'warning',
          recoverable: true,
          details: { renderer: 'stats', statistic: label, property, cssValue: value, positioning: { safePosition, safeStyleRangeStart, safeStyleRangeWidth } }
        }), { context: 'stats_css_generation' });
      }
    });
    
    // Validate positioning classes
    if (!positioning.recipePosition || !positioning.recipeValueSide) {
      errorHandler.handleError(new FormatError(`Invalid positioning calculated for ${label}`, {
        userMessage: `Unable to position ${label} statistic correctly on the chart.`,
        severity: 'warning',
        recoverable: true,
        details: { renderer: 'stats', statistic: label, positioning }
      }), { context: 'stats_positioning' });
    }
    
    return `
      <div class="stat-range ${statusClass}">
        <div class="stat-range-row">
          <span class="stat-range-label">${label}</span>
          <div class="stat-range-bar">
            <div class="range-track">&nbsp;</div>
            ${(fullRange && isValidNumber(styleMin, { allowZero: true, allowNegative: false, min: 0, max: 200 }) && isValidNumber(styleMax, { allowZero: true, allowNegative: false, min: 0, max: 200 })) ? `<div class="style-range-highlight" style="left: ${safeStyleRangeStart}%; width: ${safeStyleRangeWidth}%;">&nbsp;</div>` : '<!-- No style range -->'}
            <div class="range-indicator" style="left: ${safePosition}%">&nbsp;</div>
            ${isValidNumber(styleMin, { allowZero: true, allowNegative: false, min: 0, max: 200 }) && shouldShowStyleMin ? `<div class="range-min-value" style="left: ${safeMinValuePos}%">${styleMin.toFixed(decimalPlaces)}${unit}</div>` : '<!-- No min value -->'}
            ${isValidNumber(styleMax, { allowZero: true, allowNegative: false, min: 0, max: 200 }) && shouldShowStyleMax ? `<div class="range-max-value" style="left: ${safeMaxValuePos}%">${styleMax.toFixed(decimalPlaces)}${unit}</div>` : '<!-- No max value -->'}
            <div class="range-recipe-value ${positioning.recipeValueSide}" style="left: ${safePosition}%">${formattedValue}</div>
          </div>
          <span class="actual-measurement-field actual-${label.toLowerCase().replace(' ', '-')}-field">&nbsp;</span>
        </div>
      </div>
    `;
  }

  shouldShowStyleValue(recipeValue, styleValue, type, label) {
    // Don't show if style value is undefined or null
    if (!isValidNumber(styleValue, { allowZero: true, allowNegative: false, min: 0, max: 200 })) {
      return false;
    }
    
    // OG and FG use sliding windows, so they don't need near-zero threshold logic
    // The sliding window positioning handles all cases properly
    if (label === 'OG' || label === 'FG') {
      return true;
    }
    
    // Only apply overlap threshold logic for style minimums that are close to zero
    // The main positioning logic handles other cases
    if (type === 'min') {
      // Define what constitutes "close to zero" for different stats
      const nearZeroThresholds = {
        'ABV': 1,        // Consider 0-1% ABV as "near zero"
        'IBU': 5,        // Consider 0-5 IBU as "near zero"
        'SRM': 2,        // Consider 0-2 SRM as "near zero"
        'CO₂': 1.0 // Consider 0-0.5 volumes as "near zero"
      };
      
      const nearZeroThreshold = nearZeroThresholds[label] || 1;
      
      // Only apply overlap detection if the style minimum is close to zero
      if (styleValue <= nearZeroThreshold) {
        // Define overlap thresholds for different stat types
        const overlapThresholds = {
          'ABV': 0.5,      // Hide if within 0.5% ABV
          'IBU': 3,        // Hide if within 3 IBU
          'SRM': 1.5,      // Hide if within 1.5 SRM
          'CO₂': 0.2 // Hide if within 0.2 volumes
        };
        
        const threshold = overlapThresholds[label] || 1;
        const difference = Math.abs(recipeValue - styleValue);
        
        // Hide the style value if it's too close to the recipe value
        return difference > threshold;
      }
    }
    
    // For non-near-zero minimums and all maximums, show the value
    // The main positioning logic will handle visual placement
    return true;
  }

  calculateValuePositioning(recipeValue, styleMin, styleMax, styleRangeStart, styleRangeWidth) {
    // Add debugging for input values
    if (!isValidNumber(styleMin, { allowZero: true, allowNegative: false, min: 0, max: 200 }) && styleMin != null) {
      errorHandler.handleError(new FormatError('Invalid styleMin in value positioning', {
        userMessage: 'Unable to position style minimum value correctly on statistics chart.',
        severity: 'warning',
        recoverable: true,
        details: { renderer: 'stats', operation: 'value_positioning', styleMin }
      }), { context: 'stats_value_positioning' });
    }
    if (!isValidNumber(styleMax, { allowZero: true, allowNegative: false, min: 0, max: 200 }) && styleMax != null) {
      errorHandler.handleError(new FormatError('Invalid styleMax in value positioning', {
        userMessage: 'Unable to position style maximum value correctly on statistics chart.',
        severity: 'warning',
        recoverable: true,
        details: { renderer: 'stats', operation: 'value_positioning', styleMax }
      }), { context: 'stats_value_positioning' });
    }
    
    // Determine recipe position relative to style range
    let recipePosition, recipeValueSide;
    
    // Handle case where style values are missing
    if (!isValidNumber(styleMin, { allowZero: true, allowNegative: false, min: 0, max: 200 }) || 
        !isValidNumber(styleMax, { allowZero: true, allowNegative: false, min: 0, max: 200 })) {
      // Default positioning when no style range exists
      recipePosition = 'within-range';
      recipeValueSide = 'recipe-value-right';
    } else if (recipeValue < styleMin) {
      // Recipe below style range
      recipePosition = 'below-range';
      recipeValueSide = 'recipe-value-left';
    } else if (recipeValue > styleMax) {
      // Recipe above style range
      recipePosition = 'above-range';
      recipeValueSide = 'recipe-value-right';
    } else {
      // Recipe within style range
      recipePosition = 'within-range';
      const styleMidpoint = (styleMin + styleMax) / 2;
      
      if (recipeValue < styleMidpoint) {
        // Recipe in lower half of style range
        recipeValueSide = 'recipe-value-right';
      } else {
        // Recipe in upper half of style range
        recipeValueSide = 'recipe-value-left';
      }
    }
    
    // Debug the calculated positioning
    const result = {
      recipePosition,
      recipeValueSide
    };
    
    if (!recipePosition || !recipeValueSide) {
      errorHandler.handleError(new FormatError('Invalid positioning calculated in value positioning', {
        userMessage: 'Unable to calculate correct positioning for recipe statistics.',
        severity: 'warning',
        recoverable: true,
        details: { renderer: 'stats', operation: 'value_positioning', result, inputs: { recipeValue, styleMin, styleMax, styleRangeStart, styleRangeWidth } }
      }), { context: 'stats_value_positioning' });
    }
    
    return result;
  }
}

export { StatsRenderer };
