/**
 * Header Renderer
 * Handles rendering of recipe header with title, image, stats, and metadata
 */

import { BaseRenderer } from './base-renderer.js';
import { StatsRenderer } from './stats-renderer.js';
import { formatPlato } from '../../utilities/formatting/formatting-utils.js';

class HeaderRenderer extends BaseRenderer {
  constructor() {
    super();
    this.statsRenderer = new StatsRenderer();
  }

  render(recipe, container) {
    // Build header content sections
    const headerCenter = this.renderHeaderCenter(recipe);
    const recipeMeta = this.renderRecipeMeta(recipe);
    
    // Combine content
    const contentHTML = headerCenter + recipeMeta;
    
    // Create main section and append to container
    const sectionHTML = this.createSection('recipe-header', '', contentHTML);
    this.appendToContainer(container, sectionHTML);
  }

  /**
   * Render the header center section with title info and image
   * @param {Object} recipe - Recipe data
   * @returns {string} Header center HTML
   */
  renderHeaderCenter(recipe) {
    const headerInfo = this.renderHeaderInfo(recipe);
    const imageContainer = this.renderImageContainer(recipe);
    
    return `
      <div class="recipe-header-center">
        ${headerInfo}
        ${imageContainer}
      </div>
    `;
  }

  /**
   * Render header info section using BaseRenderer methods
   * @param {Object} recipe - Recipe data
   * @returns {string} Header info HTML
   */
  renderHeaderInfo(recipe) {
    const title = `<h1 id="recipe-name" class="recipe-title">${this.escapeHtml(recipe.name)}</h1>`;
    const brewer = this.formatConditional(
      recipe.brewer,
      `<h2 class="brewer">${this.escapeHtml(recipe.brewer)}</h2>`,
      '<!-- No brewer -->'
    );
    const style = this.formatConditional(
      recipe.style?.name,
      `<h3 class="style">${this.escapeHtml(recipe.style.name)}</h3>`,
      '<!-- No style -->'
    );
    const abv = `<h3 class="recipe-abv">${recipe.abvFormatted} / ${formatPlato(recipe.og)}</h3>`;
    
    return `
      <div class="recipe-header-info">
        ${title}
        ${brewer}
        ${style}
        ${abv}
      </div>
    `;
  }

  /**
   * Render image container with placeholder and display logic
   * @param {Object} recipe - Recipe data
   * @returns {string} Image container HTML
   */
  renderImageContainer(recipe) {
    const placeholder = `
      <div class="recipe-image-placeholder" style="display: ${recipe.imageUrl ? 'none' : 'flex'}">
        <div class="image-upload-content">
          <div class="upload-icon">🖼️</div>
          <div class="upload-text">Recipe Image</div>
          <div class="upload-hint">Click or drag to add</div>
        </div>
      </div>
    `;
    
    const imageDisplay = this.formatConditional(
      recipe.imageUrl,
      `
        <div class="recipe-image-display" style="display: block">
          <img src="${recipe.imageUrl}" alt="Recipe Image">
          <div class="image-controls no-print">
            <button class="btn btn--primary btn--tiny image-change-btn">Change</button>
            <button class="btn btn--danger btn--tiny image-remove-btn">Remove</button>
          </div>
        </div>
      `,
      '<!-- No image -->'
    );
    
    return `
      <div class="recipe-image-container">
        ${placeholder}
        ${imageDisplay}
      </div>
    `;
  }

  /**
   * Render recipe meta section with stats
   * @param {Object} recipe - Recipe data
   * @returns {string} Recipe meta HTML
   */
  renderRecipeMeta(recipe) {
    const recipeStats = this.renderRecipeStats(recipe);
    const basicOrStyledStats = recipe.hasStyle ? this.renderStatsWithRanges(recipe) : this.renderBasicStats(recipe);
    
    return `
      <div class="recipe-meta">
        ${recipeStats}
        ${basicOrStyledStats}
      </div>
    `;
  }

  /**
   * Render recipe stats section using createStat method
   * @param {Object} recipe - Recipe data
   * @returns {string} Recipe stats HTML
   */
  renderRecipeStats(recipe) {
    // Create batch number stat with empty content (no em dash)
    const batchNumberStat = `
      <div class="stat batch-number-stat">
        <span class="stat-label">Batch #:</span>
        <span class="stat-value batch-number-field">&nbsp;</span>
      </div>
    `;
    
    // Create date stat - use actual value if present, otherwise empty content (no em dash)
    const dateFieldClass = recipe.brewDateFormatted === '' ? 'stat-value date-field' : 'stat-value';
    const dateValue = recipe.brewDateFormatted === '' ? '&nbsp;' : recipe.brewDateFormatted;
    const dateStat = `
      <div class="stat date-stat">
        <span class="stat-label">Date:</span>
        <span class="${dateFieldClass}">${dateValue}</span>
      </div>
    `;
    
    const batchSizeStat = this.createStat('Batch Size:', recipe.batchSizeFormatted);
    const recipeTypeStat = this.createStat('Recipe Type:', recipe.typeFormatted);
    const mashTimeStat = this.createStat('Mash Time:', recipe.mashTimeFormatted);
    const boilTimeStat = this.createStat('Boil Time:', recipe.boilTimeFormatted);
    
    return `
      <div class="recipe-stats">
        ${batchNumberStat}
        ${dateStat}
        ${batchSizeStat}
        ${recipeTypeStat}
        ${mashTimeStat}
        ${boilTimeStat}
      </div>
    `;
  }

  renderBasicStats(recipe) {
    const stats = [
      { label: 'OG:', value: recipe.ogFormatted },
      { label: 'FG:', value: recipe.fgFormatted },
      { label: 'IBU:', value: recipe.ibuFormatted },
      { label: 'SRM:', value: recipe.srmFormatted }
    ];
    
    return this.createStatsList(stats, 'basic-stats');
  }

  renderStatsWithRanges(recipe) {
    // Delegate to StatsRenderer for proper stats with ranges rendering
    return this.statsRenderer.renderStatsWithRanges(recipe);
  }
}

export { HeaderRenderer };
