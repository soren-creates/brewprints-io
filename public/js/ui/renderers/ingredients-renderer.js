/**
 * Ingredients Renderer
 * Handles rendering of recipe ingredients section with balanced columns
 */

import { BaseRenderer } from './base-renderer.js';

class IngredientsRenderer extends BaseRenderer {
  constructor() {
    super();
  }

  render(ingredients, container, recipeAnalysis = null) {
    if (!ingredients) return;

    let ingredientsHTML = `
      <section id="ingredients-section" class="recipe-section" data-section="ingredients">
        <h2 class="section-title">Ingredients</h2>
        <div class="ingredients-container">
    `;

    // Collect all subsections with their estimated heights
    const subsections = [];

    // Fermentables
    if (ingredients.fermentables && ingredients.fermentables.length > 0) {
      const html = this.renderFermentablesSubsection(ingredients.fermentables, recipeAnalysis);
      subsections.push({
        name: 'fermentables',
        html: html,
        itemCount: ingredients.fermentables.length,
        priority: 1 // Fermentables should generally come first
      });
    }

    // Hops
    if (ingredients.hops && ingredients.hops.length > 0) {
      const html = this.renderHopsSubsection(ingredients.hops, recipeAnalysis);
      subsections.push({
        name: 'hops',
        html: html,
        itemCount: ingredients.hops.length,
        priority: 2 // Hops are usually the main attraction
      });
    }

    // Yeasts
    if (ingredients.yeasts && ingredients.yeasts.length > 0) {
      const html = this.renderYeastsSubsection(ingredients.yeasts);
      subsections.push({
        name: 'yeasts',
        html: html,
        itemCount: ingredients.yeasts.length,
        priority: 3
      });
    }

    // Water Agents
    if (ingredients.miscs && ingredients.miscs.length > 0) {
      const waterAgents = ingredients.miscs.filter(m => m.type && m.type.toLowerCase() === 'water agent');
      if (waterAgents.length > 0) {
        const html = this.renderMiscSubsection(waterAgents, 'Water Agents', 'water-agents-table');
        subsections.push({
          name: 'water-agents',
          html: html,
          itemCount: waterAgents.length,
          priority: 4
        });
      }
    }

    // Miscellaneous (excluding Water Agents and Finings)
    if (ingredients.miscs && ingredients.miscs.length > 0) {
      const miscItems = ingredients.miscs.filter(m => {
        const type = m.type ? m.type.toLowerCase() : '';
        return type !== 'water agent' && type !== 'fining';
      });
      if (miscItems.length > 0) {
        const html = this.renderMiscSubsection(miscItems, 'Miscellaneous', 'miscs-table');
        subsections.push({
          name: 'miscellaneous',
          html: html,
          itemCount: miscItems.length,
          priority: 5
        });
      }
    }

    // Finings
    if (ingredients.miscs && ingredients.miscs.length > 0) {
      const finings = ingredients.miscs.filter(m => m.type && m.type.toLowerCase() === 'fining');
      if (finings.length > 0) {
        const html = this.renderMiscSubsection(finings, 'Finings', 'finings-table');
        subsections.push({
          name: 'finings',
          html: html,
          itemCount: finings.length,
          priority: 6
        });
      }
    }

    // Balance the columns
    const balancedOrder = this.balanceIngredientsColumns(subsections);
    
    // Render subsections in the balanced order
    balancedOrder.forEach(subsection => {
      ingredientsHTML += subsection.html;
    });

    ingredientsHTML += '</div></section>';
    container.insertAdjacentHTML('beforeend', ingredientsHTML);
  }

  // INGREDIENTS COLUMN BALANCING

  /**
   * Balance the subsections into two columns based on item counts
   * @param {Array} subsections - Array of subsections with item counts
   * @returns {Array} Balanced array of subsections
   */
  balanceIngredientsColumns(subsections) {
    if (subsections.length <= 2) {
      return subsections.sort((a, b) => a.priority - b.priority);
    }

    // Separate main ingredients from misc items
    const mainSubsections = subsections.filter(s => 
      ['fermentables', 'hops', 'yeasts'].includes(s.name));
    const miscSubsections = subsections.filter(s => 
      ['water-agents', 'miscellaneous', 'finings'].includes(s.name)).sort((a, b) => a.priority - b.priority);
    
    const mainTotalItems = mainSubsections.reduce((sum, s) => sum + s.itemCount, 0);
    const miscTotalItems = miscSubsections.reduce((sum, s) => sum + s.itemCount, 0);
    
    // Special case: if hops dominate, put them in their own column
    if (this.shouldIsolateHops(mainSubsections, mainTotalItems, miscTotalItems)) {
      return this.buildHopsIsolatedLayout(mainSubsections, miscSubsections);
    }
    
    // Normal case: try both arrangements and pick the most balanced
    return this.buildBestBalancedLayout(mainSubsections, miscSubsections, mainTotalItems, miscTotalItems);
  }

  /**
   * Check if hops should be isolated in their own column
   * @param {Array} mainSubsections - Main ingredient subsections
   * @param {number} mainTotalItems - Total main items
   * @param {number} miscTotalItems - Total misc items
   * @returns {boolean} True if hops should be isolated
   */
  shouldIsolateHops(mainSubsections, mainTotalItems, miscTotalItems) {
    const hopsSubsection = mainSubsections.find(s => s.name === 'hops');
    if (!hopsSubsection) return false;
    
    const otherItems = mainTotalItems + miscTotalItems - hopsSubsection.itemCount;
    return hopsSubsection.itemCount > otherItems * 1.5;
  }
  
  /**
   * Build layout with hops isolated in second column
   * @param {Array} mainSubsections - Main ingredient subsections
   * @param {Array} miscSubsections - Miscellaneous subsections
   * @returns {Array} Layout with hops isolated
   */
  buildHopsIsolatedLayout(mainSubsections, miscSubsections) {
    const hopsSubsection = mainSubsections.find(s => s.name === 'hops');
    const nonHopsSubsections = mainSubsections
      .filter(s => s.name !== 'hops')
      .sort((a, b) => a.priority - b.priority);
    
    return [...nonHopsSubsections, ...miscSubsections, hopsSubsection];
  }

  /**
   * Try both arrangement strategies and return the most balanced
   * @param {Array} mainSubsections - Main ingredient subsections
   * @param {Array} miscSubsections - Miscellaneous subsections
   * @param {number} mainTotalItems - Total main items
   * @param {number} miscTotalItems - Total misc items
   * @returns {Array} Best balanced layout
   */
  buildBestBalancedLayout(mainSubsections, miscSubsections, mainTotalItems, miscTotalItems) {
    const sortedMain = [...mainSubsections].sort((a, b) => a.priority - b.priority);
    
    // Strategy 1: Put misc items in second column with some main items
    const layout1 = this.tryMiscInSecondColumn(sortedMain, miscSubsections, mainTotalItems, miscTotalItems);
    
    // Strategy 2: Put misc items in first column with some main items
    const layout2 = this.tryMiscInFirstColumn(sortedMain, miscSubsections, miscTotalItems);
    
    // Pick the strategy with better balance
    const balance1 = Math.abs(layout1.leftItems - layout1.rightItems);
    const balance2 = Math.abs(layout2.leftItems - layout2.rightItems);
    
    const chosen = balance1 <= balance2 ? layout1 : layout2;
    return [...chosen.leftColumn, ...chosen.rightColumn];
  }

  /**
   * Try arrangement with misc items in second column
   * @param {Array} sortedMain - Main subsections sorted by priority
   * @param {Array} miscSubsections - Miscellaneous subsections
   * @param {number} mainTotalItems - Total main items
   * @param {number} miscTotalItems - Total misc items
   * @returns {Object} Layout with item counts
   */
  tryMiscInSecondColumn(sortedMain, miscSubsections, mainTotalItems, miscTotalItems) {
    const totalItems = mainTotalItems + miscTotalItems;
    const targetPerColumn = totalItems / 2;
    
    let firstColumn = [];
    let firstColumnItems = 0;
    
    // Fill first column with main items up to target (accounting for misc in second column)
    for (const subsection of sortedMain) {
      if (firstColumnItems + subsection.itemCount <= targetPerColumn + miscTotalItems/2) {
        firstColumn.push(subsection);
        firstColumnItems += subsection.itemCount;
      } else {
        break;
      }
    }
    
    // Remaining main items go in second column with misc
    const secondColumnMain = sortedMain.filter(s => !firstColumn.includes(s));
    const secondColumn = this.insertMiscAfterYeast(secondColumnMain, miscSubsections);
    const secondColumnItems = secondColumnMain.reduce((sum, s) => sum + s.itemCount, 0) + miscTotalItems;
    
    return {
      leftColumn: firstColumn,
      rightColumn: secondColumn,
      leftItems: firstColumnItems,
      rightItems: secondColumnItems
    };
  }

  /**
   * Try arrangement with misc items in first column
   * @param {Array} sortedMain - Main subsections sorted by priority
   * @param {Array} miscSubsections - Miscellaneous subsections
   * @param {number} miscTotalItems - Total misc items
   * @returns {Object} Layout with item counts
   */
  tryMiscInFirstColumn(sortedMain, miscSubsections, miscTotalItems) {
    const firstColumn = [];
    const secondColumn = [];
    let firstColumnItems = 0;
    let secondColumnItems = 0;
    
    // Distribute main items evenly between columns
    for (const subsection of sortedMain) {
      if (firstColumnItems <= secondColumnItems) {
        firstColumn.push(subsection);
        firstColumnItems += subsection.itemCount;
      } else {
        secondColumn.push(subsection);
        secondColumnItems += subsection.itemCount;
      }
    }
    
    // Add misc to first column (after yeast if present)
    const finalFirstColumn = this.insertMiscAfterYeast(firstColumn, miscSubsections);
    firstColumnItems += miscTotalItems;
    
    return {
      leftColumn: finalFirstColumn,
      rightColumn: secondColumn,
      leftItems: firstColumnItems,
      rightItems: secondColumnItems
    };
  }

  /**
   * Insert misc subsections after yeast (if present) or at the end
   * @param {Array} mainSubsections - Main ingredient subsections
   * @param {Array} miscSubsections - Miscellaneous subsections
   * @returns {Array} Combined subsections with proper ordering
   */
  insertMiscAfterYeast(mainSubsections, miscSubsections) {
    if (miscSubsections.length === 0) {
      return mainSubsections;
    }
    
    const yeastIndex = mainSubsections.findIndex(s => s.name === 'yeasts');
    
    if (yeastIndex === -1) {
      return [...mainSubsections, ...miscSubsections];
    }
    
    // Insert misc after yeast
    const result = [...mainSubsections];
    result.splice(yeastIndex + 1, 0, ...miscSubsections);
    return result;
  }

  renderFermentablesSubsection(fermentables, recipeAnalysis = null) {
    const tableHTML = this.createIngredientTable(
      fermentables, 
      'fermentables-table', 
      BaseRenderer.generateFermentableRow
    );
    
    // Add grain analysis summary
    let summaryHTML = '';
    if (recipeAnalysis) {
      summaryHTML = `
        <div class="ingredient-summary grain-summary">
          <div class="summary-line">
            <span class="summary-label">Total Fermentables: <span class="summary-value">${recipeAnalysis.totalFermentableWeightFormatted}</span></span>
            <span class="summary-label summary-right">Diastatic Power: <span class="summary-value">${recipeAnalysis.diastaticPowerFormatted}</span></span>
          </div>
        </div>
      `;
    }
    
    return this.createIngredientSubsection('Fermentables', tableHTML + summaryHTML);
  }

  renderHopsSubsection(hops, recipeAnalysis = null) {
    const tableHTML = this.createIngredientTable(
      hops, 
      'hops-table', 
      BaseRenderer.generateHopRow
    );
    
    // Add hop analysis summary
    let summaryHTML = '';
    if (recipeAnalysis) {
      summaryHTML = `
        <div class="ingredient-summary hop-summary">
          <div class="summary-line">
            <span class="summary-label">Total Hops: <span class="summary-value">${recipeAnalysis.totalHopWeightFormatted}</span></span>
            <span class="summary-label summary-right">Aroma Hopping Rate: <span class="summary-value">${recipeAnalysis.aromaHopRateFormatted}</span></span>
          </div>
          <div class="summary-line">
            <span class="summary-label">BU/GU Ratio: <span class="summary-value">${recipeAnalysis.buGuRatioFormatted}</span></span>
            <span class="summary-label summary-right">Dry Hopping Rate: <span class="summary-value">${recipeAnalysis.dryHopRateFormatted}</span></span>
          </div>
        </div>
      `;
    }
    
    return this.createIngredientSubsection('Hops', tableHTML + summaryHTML);
  }

  renderYeastsSubsection(yeasts) {
    const tableHTML = this.createIngredientTable(
      yeasts, 
      'yeasts-table', 
      BaseRenderer.generateYeastRow
    );
    
    return this.createIngredientSubsection('Yeasts', tableHTML);
  }

  renderMiscSubsection(miscItems, title, tableClass) {
    const tableHTML = this.createIngredientTable(
      miscItems, 
      tableClass, 
      (misc, renderer) => BaseRenderer.generateMiscRow(misc, renderer, tableClass)
    );
    
    return this.createIngredientSubsection(title, tableHTML);
  }
}

export { IngredientsRenderer };
