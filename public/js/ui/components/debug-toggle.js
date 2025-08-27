/**
 * Debug Toggle Component
 * Provides a floating button to toggle debug mode on/off
 */

import { debug, DEBUG_CATEGORIES } from '../../utilities/debug.js';
import { LucideIcons } from './lucide-icons.js';

class DebugToggle {
  constructor() {
    this.button = null;
    this.panel = null;
    this.isExpanded = false;
    // Get CSS custom properties for color consistency
    this.styles = getComputedStyle(document.documentElement);
  }

  /**
   * Helper method to get CSS custom property values
   */
  getCSSCustomProperty(property) {
    return this.styles.getPropertyValue(property).trim();
  }

  /**
   * Initialize the debug toggle component
   */
  init() {
    this.createButton();
    this.createPanel();
    this.updateButtonState();
  }

  /**
   * Create the floating debug toggle button
   */
  createButton() {
    this.button = document.createElement('button');
    this.button.className = 'btn btn--debug btn--floating';
    this.button.title = 'Toggle Debug Mode';
    this.button.innerHTML = LucideIcons.create('bug', '', 20);
    
    this.button.addEventListener('click', () => {
      this.togglePanel();
    });
    
    document.body.appendChild(this.button);
    
    // Render Lucide icons
    LucideIcons.render(this.button);
  }

  /**
   * Create the debug control panel
   */
  createPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'debug-control-panel';
    
    this.renderPanelContent();
    document.body.appendChild(this.panel);
  }

  /**
   * Render the content of the debug panel
   */
  renderPanelContent() {
    const status = debug.getStatus();
    const categories = debug.getCategories();
    
    this.panel.innerHTML = `
      <div class="debug-panel-header">
        <h3 class="debug-panel-title">🐛 Debug Controls</h3>
        <button id="debug-close" class="debug-close-btn">×</button>
      </div>
      
      <div class="debug-master-section">
        <div class="debug-master-controls">
          <button id="debug-master-toggle" class="debug-master-toggle ${status.enabled ? 'enabled' : 'disabled'}">
            ${status.enabled ? 'Debug ON' : 'Debug OFF'}
          </button>
          <span class="debug-master-info">Master toggle</span>
        </div>
      </div>
      
      ${status.enabled ? `
        <div class="debug-categories">
          <h4 style="margin: 0 0 0.5rem 0; color: var(--muted-text-color); font-size: 13px;">Categories:</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem; font-size: 12px;">
            ${categories.map(cat => {
              const isImplemented = debug.isCategoryImplemented(cat);
              const isEnabled = status.enabledCategories.includes(cat);
              const prefix = isImplemented ? '' : '🚧 ';
              
              return `
                <div class="debug-category-item">
                  <label class="debug-category-label" style="cursor: ${isImplemented ? 'pointer' : 'not-allowed'};">
                    <input type="checkbox" 
                           class="debug-category-checkbox"
                           data-category="${cat}" 
                           ${isEnabled ? 'checked' : ''}
                           ${isImplemented ? '' : 'disabled'}>
                    <span>${prefix}${cat}</span>
                  </label>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <div class="debug-actions">
          <button id="debug-check-all" class="debug-action-btn">Check All</button>
          <button id="debug-uncheck-all" class="debug-action-btn">Uncheck All</button>
        </div>
      ` : ''}
      
      <div style="padding-top: 0.5rem; border-top: 1px solid var(--gray-600); font-size: 11px; color: var(--muted-text-color);">
        Type <code style="background: var(--gray-600); padding: 2px 4px; border-radius: 2px;">debug.help()</code> in console for more commands
      </div>
    `;
    
    this.attachPanelListeners();
  }

  /**
   * Attach event listeners to panel elements
   */
  attachPanelListeners() {
    // Close button
    const closeBtn = document.getElementById('debug-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hidePanel());
    }
    
    // Master toggle
    const masterToggle = document.getElementById('debug-master-toggle');
    if (masterToggle) {
      masterToggle.addEventListener('click', () => {
        debug.toggleMasterDebug();
        this.updateButtonState();
        this.renderPanelContent();
      });
    }
    
    // Category checkboxes
    const checkboxes = this.panel.querySelectorAll('input[data-category]');
    checkboxes.forEach(checkbox => {
      // Only add event listeners to enabled (implemented) checkboxes
      if (!checkbox.disabled) {
        checkbox.addEventListener('change', (e) => {
          const category = e.target.dataset.category;
          if (e.target.checked) {
            debug.enable(category);
          } else {
            debug.disable(category);
          }
          this.updateButtonState();
        });
      }
    });
    
    // Check/Uncheck all buttons
    const checkAllBtn = document.getElementById('debug-check-all');
    if (checkAllBtn) {
      checkAllBtn.addEventListener('click', () => {
        debug.enableAllCategories();
        this.updateButtonState();
        this.renderPanelContent();
      });
    }
    
    const uncheckAllBtn = document.getElementById('debug-uncheck-all');
    if (uncheckAllBtn) {
      uncheckAllBtn.addEventListener('click', () => {
        debug.disableAllCategories();
        this.updateButtonState();
        this.renderPanelContent();
      });
    }
  }

  /**
   * Toggle the debug panel visibility
   */
  togglePanel() {
    if (this.isExpanded) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  /**
   * Show the debug panel
   */
  showPanel() {
    this.renderPanelContent(); // Refresh content
    this.panel.classList.add('show');
    this.isExpanded = true;
    this.button.classList.add('active');
  }

  /**
   * Hide the debug panel
   */
  hidePanel() {
    this.panel.classList.remove('show');
    this.isExpanded = false;
    this.button.classList.remove('active');
  }

  /**
   * Update button visual state based on debug status
   */
  updateButtonState() {
    const status = debug.getStatus();
    if (status.enabled) {
      this.button.classList.add('debug-enabled');
    } else {
      this.button.classList.remove('debug-enabled');
    }
  }
}

// Create and export singleton instance
export const debugToggle = new DebugToggle();