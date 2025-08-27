/**
 * Measurements Renderer
 * Handles rendering of brew day measurements section
 */

import { BaseRenderer } from './base-renderer.js';

class MeasurementsRenderer extends BaseRenderer {
  constructor() {
    super();
  }

  render(recipe, container) {
    // Check if sparge is used - look for sparge detection from water volume tracking
    const usesSparge = recipe.waterVolumeTracking?.spargeAnalysis?.usesSparge !== false;
    // Check if this is an extract recipe
    const isExtractRecipe = (recipe.type || '').toLowerCase() === 'extract';
    
    // Use different column-fill strategy for no-sparge all-grain recipes
    const layoutClass = (!usesSparge && !isExtractRecipe) ? 
      'brew-day-measurements-columns-no-sparge' : 
      'brew-day-measurements-columns';
      
    let brewDayHTML = `
      <section id="brew-day-measurements-section" class="recipe-section" data-section="brew-day-measurements">
        <h2 class="section-title">Brew Day Measurements</h2>
        <div class="brew-day-measurements-container">
          <div class="${layoutClass}">
    `;

    if (usesSparge) {
      // When sparge is used, show all 4 subsections in original layout
      brewDayHTML += this.formatConditional(!isExtractRecipe, this.renderPhSubsection(recipe));
      brewDayHTML += this.renderGravitySubsection(recipe, isExtractRecipe);
      brewDayHTML += this.renderVolumeSubsection(recipe);
      brewDayHTML += this.renderEfficiencySubsection(recipe, isExtractRecipe);
    } else {
      // When sparge is NOT used, force pH subsection to Column 2 above Volume
      brewDayHTML += this.renderGravitySubsection(recipe, isExtractRecipe);
      brewDayHTML += this.renderEfficiencySubsection(recipe, isExtractRecipe);
      brewDayHTML += this.formatConditional(!isExtractRecipe, this.renderPhSubsectionNoSparge(recipe, true)); // Force column break
      brewDayHTML += this.renderVolumeSubsection(recipe);
    }

    brewDayHTML += `
          </div>
        </div>
      </section>
    `;
    
    container.insertAdjacentHTML('beforeend', brewDayHTML);
  }

  /**
   * Render pH subsection using BaseRenderer methods
   * @param {Object} recipe - Recipe data
   * @returns {string} pH subsection HTML
   */
  renderPhSubsection(recipe) {
    const phMeasurements = [
      {
        label: 'Mash pH:',
        value: recipe.mashPhFormatted !== '—' ? recipe.mashPhFormatted : '5.2 - 5.6',
        actualField: 'actual-mash-ph-field'
      },
      {
        label: 'Sparge pH:',
        value: recipe.spargePhFormatted !== '—' ? recipe.spargePhFormatted : '5.2 - 6.0',
        actualField: 'actual-sparge-ph-field'
      }
    ];

    const tableHTML = this.createMeasurementTable(phMeasurements);
    return this.createBrewDaySubsection('pH', tableHTML);
  }

  /**
   * Render pH subsection for no-sparge recipes (mash pH only)
   * @param {Object} recipe - Recipe data
   * @param {boolean} forceColumnBreak - Whether to force a column break
   * @returns {string} pH subsection HTML
   */
  renderPhSubsectionNoSparge(recipe, forceColumnBreak = false) {
    const phMeasurements = [
      {
        label: 'Mash pH:',
        value: recipe.mashPhFormatted !== '—' ? recipe.mashPhFormatted : '5.2 - 5.6',
        actualField: 'actual-mash-ph-field'
      }
    ];

    const tableHTML = this.createMeasurementTable(phMeasurements);
    const additionalClass = forceColumnBreak ? 'column-break-before' : '';
    return this.createBrewDaySubsection('pH', tableHTML, additionalClass);
  }


  /**
   * Render gravity subsection using BaseRenderer methods
   * @param {Object} recipe - Recipe data
   * @param {boolean} isExtractRecipe - Whether this is an extract recipe
   * @returns {string} Gravity subsection HTML
   */
  renderGravitySubsection(recipe, isExtractRecipe) {
    const gravityMeasurements = [];
    // Check if sparge is used - look for sparge detection from water volume tracking
    const usesSparge = recipe.waterVolumeTracking?.spargeAnalysis?.usesSparge !== false;

    // Only show First/Last Runnings Gravity for all-grain recipes that use sparge
    if (!isExtractRecipe && usesSparge) {
      gravityMeasurements.push(
        {
          label: 'First Runnings Gravity:',
          value: recipe.firstRunningsGravityFormatted,
          actualField: 'actual-first-runnings-gravity-field'
        },
        {
          label: 'Last Runnings Gravity:',
          value: recipe.lastRunningsGravityFormatted,
          actualField: 'actual-last-runnings-gravity-field'
        }
      );
    }

    gravityMeasurements.push(
      {
        label: 'Pre-Boil Gravity:',
        value: recipe.preBoilGravityFormatted,
        actualField: 'actual-pre-boil-gravity-field'
      },
      {
        label: 'Post-Boil Gravity:',
        value: recipe.postBoilGravityFormatted || recipe.ogFormatted,
        actualField: 'actual-post-boil-gravity-field'
      }
    );

    const tableHTML = this.createMeasurementTable(gravityMeasurements);
    return this.createBrewDaySubsection('Gravity', tableHTML);
  }

  /**
   * Render volume subsection using BaseRenderer methods
   * @param {Object} recipe - Recipe data
   * @returns {string} Volume subsection HTML
   */
  renderVolumeSubsection(recipe) {
    const volumeMeasurements = [];

    // Handle no-boil vs regular boil recipes
    if (recipe.waterVolumeTracking && recipe.waterVolumeTracking.isNoBoil) {
      volumeMeasurements.push({
        label: 'Post-Mash Volume<br>(No-Boil):',
        value: recipe.waterVolumeTracking.volumePostMashNoBoilFormatted,
        actualField: 'actual-post-mash-volume-field'
      });
    } else {
      volumeMeasurements.push(
        {
          label: 'Pre-Boil Volume (hot):',
          value: recipe.preBoilVolumeFormatted,
          actualField: 'actual-pre-boil-volume-field'
        },
        {
          label: 'Post-Boil Volume (hot):',
          value: recipe.postBoilVolumeFormatted || recipe.batchSizeFormatted,
          actualField: 'actual-post-boil-volume-field'
        }
      );
    }

    // Always include fermenter and packaging volumes
    volumeMeasurements.push(
      {
        label: 'Fermenter Volume:',
        value: recipe.fermenterVolumeFormatted || recipe.batchSizeFormatted,
        actualField: 'actual-fermenter-volume-field'
      },
      {
        label: 'Packaging Volume:',
        value: recipe.packagingVolumeFormatted || recipe.batchSizeFormatted,
        actualField: 'actual-packaging-volume-field'
      }
    );

    const tableHTML = this.createMeasurementTable(volumeMeasurements);
    return this.createBrewDaySubsection('Volume', tableHTML);
  }

  /**
   * Render efficiency subsection using BaseRenderer methods
   * @param {Object} recipe - Recipe data
   * @param {boolean} isExtractRecipe - Whether this is an extract recipe
   * @returns {string} Efficiency subsection HTML
   */
  renderEfficiencySubsection(recipe, isExtractRecipe) {
    const efficiencyMeasurements = [];

    if (!isExtractRecipe) {
      efficiencyMeasurements.push(
        {
          label: 'Mash Efficiency:',
          value: recipe.mashEfficiencyFormatted,
          actualField: 'actual-mash-efficiency-field'
        }
      );
    }

    efficiencyMeasurements.push(
      {
        label: 'Brewhouse Efficiency:',
        value: recipe.brewhouseEfficiencyFormatted,
        actualField: 'actual-brewhouse-efficiency-field'
      }
    );

    const tableHTML = this.createMeasurementTable(efficiencyMeasurements);
    return this.createBrewDaySubsection('Efficiency', tableHTML);
  }
}

export { MeasurementsRenderer };