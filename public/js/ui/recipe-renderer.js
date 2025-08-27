/**
 * Unified Recipe Renderer
 * Consolidates all section rendering without complex inheritance
 */

import { HeaderRenderer } from './renderers/header-renderer.js';
import { IngredientsRenderer } from './renderers/ingredients-renderer.js';
import { WaterProfilesRenderer } from './renderers/water-profiles-renderer.js';
import { MashFermentationRenderer } from './renderers/mash-fermentation-renderer.js';
import { MeasurementsRenderer } from './renderers/measurements-renderer.js';
import { VolumeTrackingRenderer } from './renderers/volume-tracking-renderer.js';
import { errorHandler } from '../utilities/errors/error-handler.js';
import { DataLoadError } from '../utilities/errors/application-errors.js';

class RecipeRenderer {
  constructor() {
    this.container = null;
    
    // Initialize section renderers
    this.headerRenderer = new HeaderRenderer();
    this.ingredientsRenderer = new IngredientsRenderer();
    this.waterProfilesRenderer = new WaterProfilesRenderer();
    this.mashFermentationRenderer = new MashFermentationRenderer();
    this.measurementsRenderer = new MeasurementsRenderer();
    this.volumeTrackingRenderer = new VolumeTrackingRenderer();
  }

  render(formattedRecipe, container) {
    this.container = container;
    
    // Clear container
    container.innerHTML = '';
    
    // Render all sections using dedicated renderers
    this.renderHeader(formattedRecipe);
    
    this.renderIngredients(formattedRecipe.ingredients, formattedRecipe.recipeAnalysis);
    
    // Render water profiles section (between ingredients and mash/fermentation)
    this.renderWaterProfiles(formattedRecipe.recipeAnalysis);
    
    // Render combined mash and fermentation section
    if (formattedRecipe.hasMash || formattedRecipe.hasFermentation) {
      this.renderMashAndFermentation(formattedRecipe.mash, formattedRecipe.fermentation);
    }
    
    // Render brew day measurements section
    this.renderBrewDayMeasurements(formattedRecipe);
    
    // Render water volume tracking section
    this.renderWaterVolumeTracking(formattedRecipe);
    
    this.renderNotes(formattedRecipe);
    
    // Initialize image manager after rendering
    this.initializeImageManager();
  }

  renderHeader(recipe) {
    // HeaderRenderer now handles stats with ranges internally
    this.headerRenderer.render(recipe, this.container);
  }

  renderIngredients(ingredients, recipeAnalysis) {
    this.ingredientsRenderer.render(ingredients, this.container, recipeAnalysis);
  }

  renderWaterProfiles(recipeAnalysis) {
    this.waterProfilesRenderer.render(recipeAnalysis, this.container);
  }

  renderMashAndFermentation(mash, fermentation) {
    this.mashFermentationRenderer.render(mash, fermentation, this.container);
  }

  renderBrewDayMeasurements(recipe) {
    this.measurementsRenderer.render(recipe, this.container);
  }

  renderWaterVolumeTracking(recipe) {
    this.volumeTrackingRenderer.render(recipe, this.container);
  }

  renderNotes(recipe) {
    if (!recipe.notes) return;

    const notesHTML = `
      <section id="notes-section" class="recipe-section">
        <h2 class="section-title">Notes</h2>
        <div class="recipe-notes">
          ${this.formatNotes(recipe.notes)}
        </div>
      </section>
    `;
    
    this.container.insertAdjacentHTML('beforeend', notesHTML);
  }

  // Helper methods
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatNotes(notes) {
    if (!notes) return '';
    // Convert line breaks to paragraphs
    return notes.split('\n\n').map(paragraph => 
      `<p>${this.escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`
    ).join('');
  }

  /**
   * Initialize image manager after DOM elements are rendered
   */
  initializeImageManager() {
    // Import and initialize the image manager if not already done
    if (!window.recipeImageManager) {
      import('./components/recipe-image-manager.js?v=' + Date.now()).then(({ RecipeImageManager }) => {
        window.recipeImageManager = new RecipeImageManager();
        window.recipeImageManager.initializeWithExistingPlaceholder();
        
        // Load any stored image for current recipe
        if (window.currentRecipeId) {
          window.recipeImageManager.loadImageFromStorage();
        }
      }).catch(error => {
        errorHandler.handleError(new DataLoadError('Could not load recipe image manager', {
          userMessage: 'Recipe images may not display properly. Recipe functionality is not affected.',
          severity: 'warning',
          recoverable: true,
          details: { component: 'recipe-renderer', operation: 'load-image-manager', originalError: error.message }
        }));
      });
    } else {
      // Re-initialize with new elements
      if (window.recipeImageManager.initializeWithExistingPlaceholder) {
        window.recipeImageManager.initializeWithExistingPlaceholder();
      }
      
      // Load any stored image for current recipe
      if (window.currentRecipeId) {
        if (window.recipeImageManager.loadImageFromStorage) {
          window.recipeImageManager.loadImageFromStorage();
        }
      }
    }
  }
}

export { RecipeRenderer };