/**
 * Mash & Fermentation Renderer
 * Handles rendering of mash steps and fermentation steps section
 */

import { BaseRenderer } from './base-renderer.js';

class MashFermentationRenderer extends BaseRenderer {
  constructor() {
    super();
  }

  render(mash, fermentation, container) {
    // Handle both calling patterns:
    // 1. render(mash, fermentation, container) - original pattern
    // 2. render(recipe, container) - standard pattern used by tests
    let actualMash, actualFermentation, actualContainer;
    
    if (arguments.length === 2) {
      // Standard pattern: render(recipe, container)
      const recipe = mash; // first parameter is actually the recipe
      actualContainer = fermentation; // second parameter is actually the container
      actualMash = recipe ? recipe.mash : null;
      actualFermentation = recipe ? recipe.fermentation : null;
    } else {
      // Original pattern: render(mash, fermentation, container)
      actualMash = mash;
      actualFermentation = fermentation;
      actualContainer = container;
    }
    
    // Check if we have either mash or fermentation data
    const hasMashSteps = actualMash && actualMash.steps && actualMash.steps.length > 0;
    const hasFermentationSteps = actualFermentation && actualFermentation.steps && actualFermentation.steps.length > 0;
    
    if (!hasMashSteps && !hasFermentationSteps) return;

    let mashFermentationHTML = `
      <section id="mash-fermentation-section" class="recipe-section" data-section="mash-fermentation">
        <h2 class="section-title">Mash & Fermentation</h2>
        <div class="mash-fermentation-container">
    `;

    // Mash Steps
    if (hasMashSteps) {
      const extraTitle = actualMash.name ? (actualMash.name.length > 29 ? ` —<br>${this.escapeHtml(actualMash.name)}` : ` — ${this.escapeHtml(actualMash.name)}`) : '';
      const validSteps = actualMash.steps.filter(step => step != null);
      const tableHTML = this.createMashFermentationTable(validSteps, BaseRenderer.generateMashStepRow, 'mash-steps-table');
      mashFermentationHTML += this.createMashFermentationSubsection('Mash Steps', tableHTML, extraTitle);
    }

    // Fermentation Steps
    if (hasFermentationSteps) {
      const extraTitle = actualFermentation.profileName ? (actualFermentation.profileName.length > 29 ? ` —<br>${this.escapeHtml(actualFermentation.profileName)}` : ` — ${this.escapeHtml(actualFermentation.profileName)}`) : '';
      const validSteps = actualFermentation.steps.filter(step => step != null);
      const tableHTML = this.createMashFermentationTable(validSteps, BaseRenderer.generateFermentationStepRow, 'fermentation-steps-table');
      mashFermentationHTML += this.createMashFermentationSubsection('Fermentation Steps', tableHTML, extraTitle);
    }

    mashFermentationHTML += '</div></section>';
    
    actualContainer.insertAdjacentHTML('beforeend', mashFermentationHTML);
  }
}

export { MashFermentationRenderer };
