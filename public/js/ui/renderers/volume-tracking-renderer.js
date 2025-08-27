/**
 * Volume Tracking Renderer
 * Handles rendering of water volume tracking section with calculations and visual indicators
 */

import { formatDecimalPlaces } from '../../formatters/unit-formatter.js';
import { L_TO_GAL } from '../../core/constants.js';
import { BaseRenderer } from './base-renderer.js';

class VolumeTrackingRenderer extends BaseRenderer {
  constructor() {
    super();
  }

  render(recipe, container) {
    if (!recipe.waterVolumeTracking) return;
    
    const tracking = recipe.waterVolumeTracking;
    const isExtractRecipe = recipe.type && recipe.type.toLowerCase() === 'extract';

    // Build warnings/notes HTML if any flags are present
    let warningsHTML = this.buildWarningsHTML(tracking);
    
    // Build content sections
    let contentHTML = warningsHTML;
    
    // Add container wrapper
    contentHTML += '<div class="water-volume-tracking-container">';
    
    // Add mash capacity section for all-grain recipes
    if (!isExtractRecipe) {
      contentHTML += this.renderMashCapacitySection(recipe, tracking);
    }
    
    // Add grain/water ratios section
    contentHTML += this.renderGrainWaterRatiosSection(tracking, isExtractRecipe);
    
    // Add volume flow section
    contentHTML += this.renderVolumeFlowSection(recipe, tracking, isExtractRecipe);
    
    // Close container
    contentHTML += '</div>';
    
    // Create the main section and append to container
    const sectionHTML = this.createSection(
      'water-volume-tracking-section',
      'Volume Breakdown',
      contentHTML,
      '',
      'water-volume-tracking'
    );
    
    this.appendToContainer(container, sectionHTML);
  }

  /**
   * Build warnings/notes HTML if any flags are present
   * @param {Object} tracking - Water volume tracking data
   * @returns {string} Warnings HTML
   */
  buildWarningsHTML(tracking) {
    // Build array of warning notes
    const warnings = [
      this.formatConditional(
        tracking.preBoilVolumeFlag,
        this.createWarningNote('warning-note', '⚠️', 'Pre-Boil Volume', tracking.preBoilVolumeFlag)
      ),
      this.formatConditional(
        tracking.evapRateFlag,
        this.createWarningNote('info-note', 'ℹ️', 'Evaporation Rate', tracking.evapRateFlag)
      ),
      this.formatConditional(
        tracking.trubLossFlag,
        this.createWarningNote('info-note', 'ℹ️', 'Trub/Chiller Loss', tracking.trubLossFlag)
      )
    ].filter(warning => warning); // Remove empty warnings

    // Return empty string if no warnings
    if (warnings.length === 0) {
      return '';
    }

    // Create container with warnings
    return this.createContainer(warnings.join(''), 'volume-tracking-warnings');
  }

  /**
   * Create a warning or info note with consistent structure
   * @param {string} noteClass - CSS class for the note (warning-note or info-note)
   * @param {string} icon - Icon for the note
   * @param {string} label - Label for the note
   * @param {string} message - Message content
   * @returns {string} Warning note HTML
   */
  createWarningNote(noteClass, icon, label, message) {
    return `
      <div class="${noteClass}">
        <span class="${noteClass === 'warning-note' ? 'warning-icon' : 'info-icon'}">${icon}</span>
        <span class="${noteClass === 'warning-note' ? 'warning-text' : 'info-text'}"><b>${label}:</b> ${message}</span>
      </div>
    `;
  }

  /**
   * Render mash capacity section using BaseRenderer methods
   * @param {Object} recipe - Recipe data
   * @param {Object} tracking - Water volume tracking data
   * @returns {string} Mash capacity section HTML
   */
  renderMashCapacitySection(recipe, tracking) {
    // Build effective mash volume calculations
    const effectiveMashCalcs = [
      { type: 'base-value', label: 'Mash Water', value: tracking.mashWaterFormatted },
      { type: 'addition', label: '+ Grain Displacement', value: `+${tracking.grainDisplacementFormatted || '—'}` },
      { type: 'subtotal', label: '= Effective Mash Volume (water + grain)', value: tracking.mashVolumeExclDeadspaceFormatted || '—' }
    ];

    // Build total mash volume calculations
    const totalMashCalcs = [
      { type: 'base-value', label: 'Effective Mash Volume', value: tracking.mashVolumeExclDeadspaceFormatted || '—' },
      { type: 'addition', label: '+ Mash Tun Deadspace', value: `+${tracking.mashTunDeadspaceFormatted || '—'}` },
      { type: 'result', label: '= Total Mash Volume Required', value: tracking.totalMashVolumeFormatted || '—' }
    ];

    // Build capacity check calculations if tun volume is specified
    const capacityCalcs = [];
    if (recipe.equipment?.tunVolume) {
      capacityCalcs.push(
        { type: 'base-value', label: 'Mash Tun Capacity', value: recipe.equipment.tunVolumeFormatted || '—' },
        { type: 'subtraction', label: '− Total Mash Volume Required', value: `−${tracking.totalMashVolumeFormatted || '—'}` },
        { type: this.getMashFreeSpaceClass(recipe), label: 'Free Space', value: this.calculateMashFreeSpace(recipe) }
      );
    }

    // Combine all calculations
    const allCalculations = [...effectiveMashCalcs, ...totalMashCalcs, ...capacityCalcs];
    
    // Create calculation group HTML with conditional class
    const hasTunVolume = recipe.equipment?.tunVolume;
    let calculationGroupHTML = this.createCalculationGroup(allCalculations);
    
    // Add conditional class to calculation group if tun volume is specified
    if (hasTunVolume) {
      calculationGroupHTML = calculationGroupHTML.replace(
        '<div class="calculation-group">',
        '<div class="calculation-group mash-capacity-with-tun">'
      );
    }
    
    // Add mash tun utilization bar after the calculation group if tun volume is specified
    if (hasTunVolume) {
      calculationGroupHTML += this.renderMashTunUtilizationBar(recipe);
    }

    return this.createVolumeTrackingSubsection('Mash Capacity', calculationGroupHTML);
  }

  /**
   * Render volume flow section using BaseRenderer methods
   * @param {Object} recipe - Recipe data
   * @param {Object} tracking - Water volume tracking data
   * @param {boolean} isExtractRecipe - Whether this is an extract recipe
   * @returns {string} Volume flow section HTML
   */
  renderVolumeFlowSection(recipe, tracking, isExtractRecipe) {
    let calculations = [];

    if (!isExtractRecipe) {
      // All-grain recipe calculations
      calculations = [
        { type: 'base-value', label: 'Mash Water (cold)', value: tracking.mashWaterFormatted },
        { type: 'addition', label: '+ Mash Tun Deadspace', value: `+${tracking.mashTunDeadspaceFormatted}` },
        { type: 'subtotal', label: '= Strike Water (cold)', value: tracking.strikeWaterFormatted }
      ];

      // Add sparge water if present
      if (tracking.spargeWater > 0) {
        calculations.push(
          { type: 'addition', label: '+ Sparge Water', value: `+${tracking.spargeWaterFormatted}` },
          { type: 'subtotal', label: '= Total Water', value: tracking.totalMashWaterFormatted }
        );
      }

      // Pre-boil calculations
      calculations.push(
        { type: 'subtraction', label: '− Grain Absorption Loss', value: `−${tracking.grainAbsorptionFormatted}` }
      );

      if (tracking.lauterDeadspace > 0) {
        calculations.push(
          { type: 'subtraction', label: '− Lauter Deadspace', value: `−${tracking.lauterDeadspaceFormatted}` }
        );
      }

      if (tracking.isNoBoil) {
        // No-boil recipe
        calculations.push(
          { type: 'subtotal', label: '= Post-Mash Volume (No-Boil)', value: tracking.volumePostMashNoBoilFormatted }
        );
      } else {
        // Regular boil recipe
        calculations.push(
          { type: 'addition', label: '+ Top-Up Kettle', value: `+${tracking.topUpKettleFormatted}` },
          { type: 'addition', label: '+ Thermal Expansion (4%)', value: `+${tracking.thermalExpansionFormatted}` },
          { type: 'subtotal', label: `= Pre-Boil Volume ${tracking.volumePreBoilNote}`, value: tracking.volumePreBoilFormatted },
          { type: 'subtraction', label: '− Boil-Off Loss', value: `−${tracking.evaporationLossFormatted}` },
          { type: 'subtotal', label: `= Post-Boil Volume ${tracking.volumePostBoilNote}`, value: tracking.volumePostBoilFormatted },
          { type: 'subtraction', label: '− Thermal Contraction (4%)', value: `−${tracking.thermalContractionFormatted}` }
        );
      }
    } else {
      // Extract recipe calculations
      calculations = [
        { type: 'base-value', label: 'Water for Extract Brewing (cold)', value: tracking.volumePreBoilColdFormatted },
        { type: 'addition', label: '+ Thermal Expansion (4%)', value: `+${tracking.thermalExpansionFormatted}` },
        { type: 'subtotal', label: `= Pre-Boil Volume ${tracking.volumePostBoilNote}`, value: tracking.volumePreBoilHotFormatted }
      ];

      if (tracking.isNoBoil) {
        calculations.push(
          { type: 'subtotal', label: '= Total Volume (No-Boil)', value: tracking.volumePreBoilFormatted }
        );
      } else {
        calculations.push(
          { type: 'subtraction', label: '− Boil-Off Loss', value: `−${tracking.evaporationLossFormatted}` },
          { type: 'subtotal', label: `= Post-Boil Volume ${tracking.volumePostBoilNote}`, value: tracking.volumePostBoilFormatted },
          { type: 'subtraction', label: '− Thermal Contraction (4%)', value: `−${tracking.thermalContractionFormatted}` }
        );
      }
    }

    // Fermenter calculations (common to both recipe types)
    calculations.push(
      { type: 'subtraction', label: '− Trub/Chiller Loss', value: `−${tracking.trubChillerLoss < 0 ? '0 gal' : tracking.trubChillerLossFormatted}` },
      { type: 'addition', label: '+ Top-Up Fermenter', value: `+${tracking.topUpWaterFormatted}` },
      { type: 'result', label: '= Into Fermenter', value: tracking.volumeToFermenterFormatted }
    );

    const calculationGroupHTML = this.createCalculationGroup(calculations);
    return this.createVolumeTrackingSubsection('Volume Flow', calculationGroupHTML);
  }

  /**
   * Calculate mash free space (positive = available space, negative = overfill)
   */
  calculateMashFreeSpace(recipe) {
    // Get total mash volume in liters
    const totalMashVolumeL = this.getTotalMashVolumeInLiters(recipe);
    
    // Get mash tun volume in liters
    const tunVolumeL = recipe.equipment?.tunVolume || 0;
    
    if (!totalMashVolumeL || tunVolumeL === 0) {
      return '—';
    }
    
    // Calculate utilization percentage
    const utilizationPercent = (totalMashVolumeL / tunVolumeL) * 100;
    
    // Calculate free space in liters
    const freeSpaceL = tunVolumeL - totalMashVolumeL;
    
    // Convert to gallons for display
    const freeSpaceGal = freeSpaceL * L_TO_GAL;
    
    // Determine emoji based on utilization percentage
    let emoji;
    if (utilizationPercent < 90) {
      emoji = '✅';
    } else if (utilizationPercent > 100) {
      emoji = '⛔';
    } else {
      // Between 90 and 100% (inclusive)
      emoji = '⚠️';
    }
    
    // Format the result with conditional emoji
    if (freeSpaceGal >= 0) {
      return `${emoji} ${formatDecimalPlaces(freeSpaceGal)} gal`;
    } else {
      return `OVERFILLED! ${emoji} ${formatDecimalPlaces(freeSpaceGal)} gal`;
    }
  }

  /**
   * Render the mash tun utilization progress bar
   */
  renderMashTunUtilizationBar(recipe) {
    const totalMashVolumeL = this.getTotalMashVolumeInLiters(recipe);
    const tunVolumeL = recipe.equipment?.tunVolume || 0;
    
    if (!totalMashVolumeL || tunVolumeL === 0) {
      return '';
    }
    
    const utilizationPercent = (totalMashVolumeL / tunVolumeL) * 100;
    const displayPercent = Math.min(utilizationPercent, 110); // Scale to 110% for display

    // Determine color based on utilization
    let barColor = getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim();
    let colorClass = 'utilization-good';
    if (utilizationPercent > 100) {
      barColor = getComputedStyle(document.documentElement).getPropertyValue('--error-color').trim();
      colorClass = 'utilization-danger';
    } else if (utilizationPercent >= 90) {
      barColor = getComputedStyle(document.documentElement).getPropertyValue('--warning-color').trim();
      colorClass = 'utilization-warning';
    }
    
    // Calculate positions for the bar fill and 100% marker
    const fillWidth = (displayPercent / 110) * 100;
    const markerPosition = (100 / 110) * 100;
    
    return `
      <div class="mash-tun-utilization mash-capacity-utilization">
        <div class="utilization-row">
          <div class="utilization-label">Utilization</div>
          <div class="progress-bar-container">
            <div class="progress-bar-background">
              <div class="progress-bar-fill ${colorClass}" style="width: ${fillWidth}%"></div>
              <div class="progress-bar-marker" style="left: ${markerPosition}%"></div>
            </div>
          </div>
          <div class="utilization-percentage" style="color: ${barColor}">${utilizationPercent.toFixed(1)}%</div>
        </div>
      </div>
    `;
  }

  /**
   * Get the appropriate CSS class for mash free space display
   */
  getMashFreeSpaceClass(recipe) {
    const totalMashVolumeL = this.getTotalMashVolumeInLiters(recipe);
    const tunVolumeL = recipe.equipment?.tunVolume || 0;
    
    if (!totalMashVolumeL || tunVolumeL === 0) {
      return 'result';
    }
    
    const freeSpaceL = tunVolumeL - totalMashVolumeL;
    
    if (freeSpaceL < 0) {
      return 'overfill-warning'; // Negative free space (overfill)
    } else {
      return 'free-space'; // Positive free space
    }
  }

  /**
   * Get total mash volume in liters for calculations
   */
  getTotalMashVolumeInLiters(recipe) {
    if (!recipe.waterVolumeTracking?.totalMashVolumeL) return 0;
    
    // Value is already in liters from water volume calculator
    return recipe.waterVolumeTracking.totalMashVolumeL;
  }

  /**
   * Render grain and water ratios section using BaseRenderer methods
   * @param {Object} tracking - Water volume tracking data
   * @param {boolean} isExtractRecipe - Whether this is an extract recipe
   * @returns {string} Grain and water ratios section HTML
   */
  renderGrainWaterRatiosSection(tracking, isExtractRecipe) {
    if (!isExtractRecipe) {
      // All-grain recipe ratios
      const ratios = [
        { label: 'Total Grain Weight:', value: tracking.totalGrainWeightFormatted },
        { label: 'Water-to-Grain Ratio:', value: tracking.waterToGrainRatioFormatted },
        { label: 'Grain Absorption Rate:', value: tracking.grainAbsorptionRateFormatted },
        { label: 'Boil-Off Rate:', value: tracking.boilOffRateWithPercentFormatted }
      ];
      
      const tableHTML = this.createVolumeTrackingTable(ratios);
      return this.createVolumeTrackingSubsection('Grain & Water Ratios', tableHTML);
    } else {
      // Extract recipe parameters
      const parameters = [
        { label: 'Boil-Off Rate:', value: tracking.boilOffRateWithPercentFormatted }
      ];
      
      const tableHTML = this.createVolumeTrackingTable(parameters);
      return this.createVolumeTrackingSubsection('Brewing Parameters', tableHTML);
    }
  }
}

export { VolumeTrackingRenderer };
