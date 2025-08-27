/**
 * Simple Section Management
 * Handles section visibility and basic reordering
 */

import { errorHandler } from '../../utilities/errors/error-handler.js';
import { DataLoadError } from '../../utilities/errors/application-errors.js';
import { LucideIcons } from './lucide-icons.js';

class SectionManager {
  constructor() {
    this.sections = [
      'recipe-header',
      'ingredients-section', 
      'water-profiles-section',
      'mash-fermentation-section',
      'brew-day-measurements-section',
      'water-volume-tracking-section',
      'notes-section'
    ];
    this.preferences = this.loadPreferences();
    this.currentRecipe = null;
    this.controlsCollapsed = true; // Track collapsed state
  }

  init() {
    this.setupControls();
    this.applyPreferences();
  }

  setupControls(recipeData = null) {
    // Store recipe data for notes availability checking
    if (recipeData) {
      this.currentRecipe = recipeData;
    }
    
    // Create section controls if they don't exist
    let controlsContainer = document.getElementById('sectionControls');
    if (!controlsContainer) {
      controlsContainer = this.createControlsContainer();
    }

    // Clear existing controls
    controlsContainer.innerHTML = '';
    
    // Add controls for each section, with h3 as the collapsible header
    const controlsHTML = `
      <h3 id="sectionControlsCollapsibleHeader" class="section-controls-collapsible-header">
        <span class="arrow">${this.controlsCollapsed ? '▶' : '▼'}</span>
        <span>Section Visibility</span>
      </h3>
      <div class="section-controls-content${this.controlsCollapsed ? ' collapsed' : ''}">
        <div class="section-toggles">
          ${this.sections.map(sectionId => this.createSectionToggle(sectionId)).join('')}
        </div>
        <div class="control-actions">
          <button class="btn btn--small icon-button" id="showAllSections">
            ${LucideIcons.createInline('eye', 'Show All', 16)}
          </button>
          <button class="btn btn--small icon-button" id="hideAllSections">
            ${LucideIcons.createInline('eye-off', 'Hide All', 16)}
          </button>
        </div>
      </div>
    `;
    
    controlsContainer.innerHTML = controlsHTML;
    
    // Render Lucide icons
    LucideIcons.render(controlsContainer);

    // Add event listener to the h3 header for collapse/expand
    const header = document.getElementById('sectionControlsCollapsibleHeader');
    if (header) {
      header.addEventListener('click', () => this.toggleControlsPanel());
    }
    
    // Add event listeners for toggles/buttons
    this.attachEventListeners();
    
    // Check for notes availability and disable control if no notes
    this.checkNotesAvailability();
    
    // Check for water profiles availability and disable control if no water data
    this.checkWaterProfilesAvailability();
  }

  toggleControlsPanel() {
    this.controlsCollapsed = !this.controlsCollapsed;
    const header = document.getElementById('sectionControlsCollapsibleHeader');
    const arrow = header ? header.querySelector('.arrow') : null;
    const content = document.querySelector('.section-controls-content');
    if (header && arrow && content) {
      if (this.controlsCollapsed) {
        content.classList.add('collapsed');
        arrow.textContent = '▶';
      } else {
        content.classList.remove('collapsed');
        arrow.textContent = '▼';
      }
    }
  }

  createControlsContainer() {
    const container = document.createElement('div');
    container.id = 'sectionControls';
    container.className = 'section-controls';
    container.classList.add('u-hidden'); // Hidden by default
    document.body.appendChild(container);
    return container;
  }

  createSectionToggle(sectionId) {
    const sectionName = this.getSectionDisplayName(sectionId);
    const isVisible = this.preferences[sectionId] !== false;
    
    return `
      <label class="section-toggle">
        <input type="checkbox" data-section="${sectionId}" ${isVisible ? 'checked' : ''}>
        <span class="toggle-label">${sectionName}</span>
      </label>
    `;
  }

  getSectionDisplayName(sectionId) {
    const names = {
      'recipe-header': 'Recipe Header',
      'ingredients-section': 'Ingredients',
      'water-profiles-section': 'Water Profiles',
      'mash-fermentation-section': 'Mash & Fermentation',
      'brew-day-measurements-section': 'Brew Day Measurements',
      'water-volume-tracking-section': 'Volume Breakdown',
      'equipment-section': 'Equipment',
      'notes-section': 'Notes'
    };
    return names[sectionId] || sectionId;
  }

  attachEventListeners() {
    // Section toggle checkboxes
    const toggles = document.querySelectorAll('[data-section]');
    toggles.forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        // Skip disabled toggles
        if (e.target.disabled) {
          e.preventDefault();
          return;
        }
        this.toggleSection(e.target.dataset.section, e.target.checked);
      });
    });

    // Control buttons
    const showAllBtn = document.getElementById('showAllSections');
    const hideAllBtn = document.getElementById('hideAllSections');
    
    if (showAllBtn) {
      showAllBtn.addEventListener('click', () => this.showAllSections());
    }
    
    if (hideAllBtn) {
      hideAllBtn.addEventListener('click', () => this.hideAllSections());
    }
  }

  toggleSection(sectionId, isVisible) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    if (isVisible) {
      section.classList.remove('section-hidden');
    } else {
      section.classList.add('section-hidden');
    }

    // Update preferences
    this.preferences[sectionId] = isVisible;
    this.savePreferences();
  }

  showAllSections() {
    this.sections.forEach(sectionId => {
      const section = document.getElementById(sectionId);
      const toggle = document.querySelector(`[data-section="${sectionId}"]`);
      
      // Skip disabled toggles
      if (toggle && toggle.disabled) {
        return;
      }
      
      if (section) {
        section.classList.remove('section-hidden');
      }
      if (toggle) {
        toggle.checked = true;
      }
      
      this.preferences[sectionId] = true;
    });
    
    this.savePreferences();
  }

  hideAllSections() {
    // Never hide the header
    const sectionsToHide = this.sections.filter(id => id !== 'recipe-header');
    
    sectionsToHide.forEach(sectionId => {
      const section = document.getElementById(sectionId);
      const toggle = document.querySelector(`[data-section="${sectionId}"]`);
      
      // Skip disabled toggles
      if (toggle && toggle.disabled) {
        return;
      }
      
      if (section) {
        section.classList.add('section-hidden');
      }
      if (toggle) {
        toggle.checked = false;
      }
      
      this.preferences[sectionId] = false;
    });
    
    this.savePreferences();
  }

  applyPreferences() {
    this.sections.forEach(sectionId => {
      const section = document.getElementById(sectionId);
      const toggle = document.querySelector(`[data-section="${sectionId}"]`);
      
      // For disabled toggles, keep them hidden regardless of preferences
      if (toggle && toggle.disabled) {
        if (section) {
          section.classList.add('section-hidden');
        }
        return;
      }
      
      const isVisible = this.preferences[sectionId] !== false;
      
      if (section) {
        if (isVisible) {
          section.classList.remove('section-hidden');
        } else {
          section.classList.add('section-hidden');
        }
      }
    });
  }

  updateControls() {
    this.sections.forEach(sectionId => {
      const toggle = document.querySelector(`[data-section="${sectionId}"]`);
      if (toggle) {
        // Don't update disabled toggles
        if (toggle.disabled) {
          return;
        }
        toggle.checked = this.preferences[sectionId] !== false;
      }
    });
  }

  loadPreferences() {
    // Create defaults - all sections visible by default
    const defaults = {};
    this.sections.forEach(sectionId => {
      defaults[sectionId] = true;
    });
    
    try {
      const saved = localStorage.getItem('brewlog-section-preferences');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure all sections have settings
        return Object.assign(defaults, parsed.visibility || parsed);
      }
    } catch (error) {
      errorHandler.handleError(new DataLoadError('Failed to load section preferences', {
        userMessage: 'Unable to load your section display preferences. Using default settings.',
        severity: 'warning',
        recoverable: true,
        details: { component: 'section-manager', operation: 'load_preferences', originalError: error.message }
      }), { context: 'section_preferences_load' });
    }
    
    return defaults;
  }

  savePreferences() {
    try {
      localStorage.setItem('brewlog-section-preferences', JSON.stringify(this.preferences));
    } catch (error) {
      errorHandler.handleError(new DataLoadError('Failed to save section preferences', {
        userMessage: 'Unable to save your section display preferences. Settings may not persist.',
        severity: 'warning',
        recoverable: true,
        details: { component: 'section-manager', operation: 'save_preferences', originalError: error.message }
      }), { context: 'section_preferences_save' });
    }
  }

  /**
   * Generic method to check section data availability and toggle controls accordingly
   * @param {string} sectionId - The section ID (e.g., 'notes-section', 'water-profiles-section')
   * @param {function} dataChecker - Function that returns boolean indicating if data is available
   * @param {string} noDataMessage - Message to display when no data is available
   */
  checkSectionAvailability(sectionId, dataChecker, noDataMessage) {
    const toggle = document.querySelector(`[data-section="${sectionId}"]`);
    
    if (!toggle) return;
    
    const hasData = dataChecker(this.currentRecipe);
    
    this.updateToggleState(toggle, sectionId, hasData, noDataMessage);
  }

  /**
   * Updates toggle and section state based on data availability
   * @param {HTMLElement} toggle - The toggle input element
   * @param {string} sectionId - The section ID
   * @param {boolean} hasData - Whether data is available for this section
   * @param {string} noDataMessage - Message to display when no data is available
   */
  updateToggleState(toggle, sectionId, hasData, noDataMessage) {
    const toggleLabel = toggle.closest('.section-toggle');
    const section = document.getElementById(sectionId);

    if (!hasData) {
      // Disable toggle and hide section when no data available
      toggle.disabled = true;
      toggle.checked = false;
      
      if (toggleLabel) {
        toggleLabel.classList.add('disabled-toggle');
        toggleLabel.title = noDataMessage;
      }
      
      if (section) {
        section.classList.add('section-hidden');
      }
    } else {
      // Re-enable toggle when data is available (for cases where recipe is reloaded)
      toggle.disabled = false;
      
      if (toggleLabel) {
        toggleLabel.classList.remove('disabled-toggle');
        toggleLabel.title = '';
      }
    }
  }

  checkNotesAvailability() {
    this.checkSectionAvailability(
      'notes-section',
      (recipe) => recipe && recipe.notes && recipe.notes.trim(),
      'No notes data available in this recipe'
    );
  }

  checkWaterProfilesAvailability() {
    this.checkSectionAvailability(
      'water-profiles-section',
      (recipe) => recipe && 
                  recipe.ingredients && 
                  recipe.ingredients.waters && 
                  recipe.ingredients.waters.length > 0,
      'No water profile data available in this recipe'
    );
  }

  // Method to update recipe data and re-check availability
  updateRecipeData(recipeData) {
    this.currentRecipe = recipeData;
    this.checkNotesAvailability();
    this.checkWaterProfilesAvailability();
  }
}

export { SectionManager };
