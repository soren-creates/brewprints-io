/**
 * Base Renderer Class
 * Provides common functionality for all recipe section renderers
 */
import { escapeHtml, formatNotes } from '../../formatters/text-formatter.js';

export class BaseRenderer {
  constructor() {
    // Bind common methods to ensure proper context
    this.formatConditional = this.formatConditional.bind(this);
    this.createSection = this.createSection.bind(this);
    this.appendToContainer = this.appendToContainer.bind(this);
  }

  /**
   * Main render method - should be implemented by subclasses
   * @param {Object} data - Data to render
   * @param {HTMLElement} container - Container to render into
   */
  render(data, container) {
    throw new Error('render() method must be implemented by subclass');
  }

  /**
   * Escape HTML to prevent XSS attacks
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    return escapeHtml(text);
  }

  /**
   * Format conditional content - only show if condition is true
   * @param {boolean} condition - Condition to check
   * @param {string} content - Content to show if condition is true
   * @param {string} fallback - Fallback content if condition is false
   * @returns {string} Formatted content
   */
  formatConditional(condition, content, fallback = '') {
    return condition ? content : fallback;
  }

  /**
   * Create a section wrapper with consistent structure
   * @param {string} id - Section ID
   * @param {string} title - Section title
   * @param {string} content - Section content
   * @param {string} className - Additional CSS classes
   * @param {string} dataSection - Data section attribute value
   * @returns {string} Section HTML
   */
  createSection(id, title, content, className = '', dataSection = '') {
    const dataAttr = dataSection ? `data-section="${dataSection}"` : '';
    const classes = `recipe-section ${className}`.trim();
    
    // Only include title heading if title is provided
    const titleHTML = title ? `<h2 class="section-title">${title}</h2>` : '';
    
    return `
      <section id="${id}" class="${classes}" ${dataAttr}>
        ${titleHTML}
        ${content}
      </section>
    `;
  }

  /**
   * Create a subsection with consistent structure
   * @param {string} title - Subsection title
   * @param {string} content - Subsection content
   * @param {string} className - Additional CSS classes
   * @returns {string} Subsection HTML
   */
  createSubsection(title, content, className = '') {
    const classes = `subsection ${className}`.trim();
    
    return `
      <div class="${classes}">
        <h3 class="subsection-title">${title}</h3>
        ${content}
      </div>
    `;
  }

  /**
   * Create a table with consistent structure
   * @param {Array} rows - Array of row objects {label, value, actual}
   * @param {string} className - Additional CSS classes
   * @returns {string} Table HTML
   */
  createTable(rows, className = '') {
    const classes = `renderer-table ${className}`.trim();
    
    const rowsHTML = rows.map(row => {
      const actualColumn = row.actual !== undefined ? 
        `<td class="table-actual">${row.actual}</td>` : '';
      
      return `
        <tr>
          <td class="table-label">${row.label}</td>
          <td class="table-value">${row.value}</td>
          ${actualColumn}
        </tr>
      `;
    }).join('');

    return `
      <table class="${classes}">
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    `;
  }

  /**
   * Create a list with consistent structure
   * @param {Array} items - Array of list items
   * @param {string} className - Additional CSS classes
   * @param {boolean} ordered - Whether to use ordered list
   * @returns {string} List HTML
   */
  createList(items, className = '', ordered = false) {
    const classes = `renderer-list ${className}`.trim();
    const tag = ordered ? 'ol' : 'ul';
    
    const itemsHTML = items.map(item => `<li>${item}</li>`).join('');
    
    return `
      <${tag} class="${classes}">
        ${itemsHTML}
      </${tag}>
    `;
  }

  /**
   * Create a key-value pair display
   * @param {string} key - Key text
   * @param {string} value - Value text
   * @param {string} className - Additional CSS classes
   * @returns {string} Key-value HTML
   */
  createKeyValue(key, value, className = '') {
    const classes = `key-value ${className}`.trim();
    
    return `
      <div class="${classes}">
        <span class="key">${key}</span>
        <span class="value">${value}</span>
      </div>
    `;
  }

  /**
   * Create a grid of items
   * @param {Array} items - Array of items to display
   * @param {string} className - Additional CSS classes
   * @param {number} columns - Number of columns (default: auto)
   * @returns {string} Grid HTML
   */
  createGrid(items, className = '', columns = null) {
    const classes = `renderer-grid ${className}`.trim();
    const style = columns ? `style="grid-template-columns: repeat(${columns}, 1fr);"` : '';
    
    const itemsHTML = items.map(item => `<div class="grid-item">${item}</div>`).join('');
    
    return `
      <div class="${classes}" ${style}>
        ${itemsHTML}
      </div>
    `;
  }

  /**
   * Append HTML content to container
   * @param {HTMLElement} container - Container element
   * @param {string} html - HTML content to append
   */
  appendToContainer(container, html) {
    if (container && html) {
      container.insertAdjacentHTML('beforeend', html);
    }
  }

  /**
   * Check if data exists and is not empty
   * @param {*} data - Data to check
   * @returns {boolean} Whether data exists and is not empty
   */
  hasData(data) {
    if (!data) return false;
    if (Array.isArray(data)) return data.length > 0;
    if (typeof data === 'object') return Object.keys(data).length > 0;
    if (typeof data === 'string') return data.trim().length > 0;
    return Boolean(data);
  }

  /**
   * Format a value with fallback
   * @param {*} value - Value to format
   * @param {string} fallback - Fallback value
   * @returns {string} Formatted value
   */
  formatValue(value, fallback = '—') {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }
    return String(value);
  }

  /**
   * Create a measurement field for brew day tracking
   * @param {string} fieldClass - CSS class for the field
   * @param {string} placeholder - Placeholder text
   * @returns {string} Measurement field HTML
   */
  createMeasurementField(fieldClass, placeholder = '') {
    return `<span class="actual-measurement-field ${fieldClass}" ${placeholder ? `placeholder="${placeholder}"` : ''}>&nbsp;</span>`;
  }

  /**
   * Create a two-column layout
   * @param {string} leftContent - Left column content
   * @param {string} rightContent - Right column content
   * @param {string} className - Additional CSS classes
   * @returns {string} Two-column HTML
   */
  createTwoColumns(leftContent, rightContent, className = '') {
    const classes = `two-columns ${className}`.trim();
    
    return `
      <div class="${classes}">
        <div class="column-left">
          ${leftContent}
        </div>
        <div class="column-right">
          ${rightContent}
        </div>
      </div>
    `;
  }

  /**
   * Create a container with consistent styling
   * @param {string} content - Container content
   * @param {string} className - Additional CSS classes
   * @returns {string} Container HTML
   */
  createContainer(content, className = '') {
    const classes = `renderer-container ${className}`.trim();
    
    return `
      <div class="${classes}">
        ${content}
      </div>
    `;
  }

  /**
   * Create an ingredient table with the exact structure used by IngredientsRenderer
   * @param {Array} ingredients - Array of ingredient objects
   * @param {string} tableClasses - CSS classes for the table
   * @param {Function} rowGenerator - Function that generates row HTML for each ingredient
   * @returns {string} Ingredient table HTML
   */
  createIngredientTable(ingredients, tableClasses, rowGenerator) {
    if (!ingredients || ingredients.length === 0) {
      return '';
    }

    const rowsHTML = ingredients.map(ingredient => rowGenerator(ingredient, this)).join('');
    
    return `
      <table class="ingredients-table ${tableClasses}">
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    `;
  }

  /**
   * Create an ingredients subsection with the exact structure used by IngredientsRenderer
   * @param {string} title - Subsection title
   * @param {string} tableHTML - Table HTML content
   * @returns {string} Ingredients subsection HTML
   */
  createIngredientSubsection(title, tableHTML) {
    return `
      <div class="ingredients-subsection">
        <h3 class="subsection-title">${title}</h3>
        ${tableHTML}
      </div>
    `;
  }

  /**
   * Create a measurement table with the exact structure used by MeasurementsRenderer
   * @param {Array} measurements - Array of measurement objects {label, value, actualField}
   * @param {string} tableClass - CSS class for the table
   * @returns {string} Measurement table HTML
   */
  createMeasurementTable(measurements, tableClass = 'efficiency-measurements-table') {
    if (!measurements || measurements.length === 0) {
      return '';
    }

    const rowsHTML = measurements.map(measurement => {
      const actualFieldHTML = measurement.actualField ? 
        `<span class="actual-measurement-field ${measurement.actualField}">&nbsp;</span>` : '';
      
      return `
        <tr>
          <td class="efficiency-label">${measurement.label}</td>
          <td class="efficiency-value">${this.formatValue(measurement.value)}</td>
          <td class="efficiency-actual">${actualFieldHTML}</td>
        </tr>
      `;
    }).join('');

    return `
      <table class="${tableClass}">
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    `;
  }

  /**
   * Create a brew day measurements subsection with the exact structure used by MeasurementsRenderer
   * @param {string} title - Subsection title
   * @param {string} tableHTML - Table HTML content
   * @param {string} additionalClass - Optional additional CSS class
   * @returns {string} Brew day subsection HTML
   */
  createBrewDaySubsection(title, tableHTML, additionalClass = '') {
    const className = additionalClass ? 
      `brew-day-measurements-subsection ${additionalClass}` : 
      'brew-day-measurements-subsection';
      
    return `
      <div class="${className}">
        <h3 class="subsection-title">${title}</h3>
        ${tableHTML}
      </div>
    `;
  }

  /**
   * Generate fermentable row HTML with exact structure
   * @param {Object} fermentable - Fermentable ingredient object
   * @param {Object} renderer - Renderer instance for escapeHtml
   * @returns {string} Fermentable row HTML
   */
  static generateFermentableRow(fermentable, renderer) {
    // Combine color and supplier with em dash
    const colorSupplier = fermentable.colorFormatted && fermentable.supplier 
      ? `${fermentable.colorFormatted} — ${renderer.escapeHtml(fermentable.supplier)}`
      : fermentable.colorFormatted || (fermentable.supplier ? renderer.escapeHtml(fermentable.supplier) : '');
    
    return `
      <tr>
        <td class="ingredient-amount">
          <div class="value-text-md">${fermentable.amountFormatted}</div>
        </td>
        <td class="ingredient-name">
          <div class="name-value">${renderer.escapeHtml(fermentable.name)}</div>
          ${colorSupplier ? `<div class="value-text-sm">${colorSupplier}</div>` : ''}
        </td>
        <td class="ingredient-percentage">
          <div class="percentage-value">${fermentable.percentage}</div>
        </td>
      </tr>
    `;
  }

  /**
   * Generate hop row HTML with exact structure
   * @param {Object} hop - Hop ingredient object
   * @param {Object} renderer - Renderer instance for escapeHtml
   * @returns {string} Hop row HTML
   */
  static generateHopRow(hop, renderer) {
    // Combine alpha and form with em dash
    const alphaForm = hop.alphaFormatted && hop.formFormatted 
      ? `${hop.alphaFormatted} — ${hop.formFormatted}`
      : hop.alphaFormatted || hop.formFormatted || '';
    
    // Add origin if available
    const alphaFormOrigin = alphaForm && hop.origin 
      ? `${alphaForm} — ${renderer.escapeHtml(hop.origin)}`
      : alphaForm || (hop.origin ? renderer.escapeHtml(hop.origin) : '');
    
    return `
      <tr>
        <td class="ingredient-amount">
          <div class="value-text-md">${hop.amountFormatted}</div>
        </td>
        <td class="ingredient-name">
          <div class="name-value">${renderer.escapeHtml(hop.name)}</div>
          ${alphaFormOrigin ? `<div class="value-text-sm">${alphaFormOrigin}</div>` : ''}
        </td>
        <td class="ingredient-use">
          <div class="use-value">${hop.useFormatted}</div>
          <div class="time-value">${hop.timeFormatted}</div>
        </td>
      </tr>
    `;
  }

  /**
   * Generate yeast row HTML with exact structure
   * @param {Object} yeast - Yeast ingredient object
   * @param {Object} renderer - Renderer instance for escapeHtml
   * @returns {string} Yeast row HTML
   */
  static generateYeastRow(yeast, renderer) {
    // Combine attenuation and laboratory with em dash, then type
    const attenuationLab = yeast.attenuationFormatted && yeast.laboratory 
      ? `${yeast.attenuationFormatted} — ${renderer.escapeHtml(yeast.laboratory)}`
      : yeast.attenuationFormatted || (yeast.laboratory ? renderer.escapeHtml(yeast.laboratory) : '');
    
    // Add type if available
    const attenuationLabType = attenuationLab && yeast.typeFormatted 
      ? `${attenuationLab} — ${yeast.typeFormatted}`
      : attenuationLab || yeast.typeFormatted || '';
    
    return `
      <tr>
        <td class="ingredient-amount">
          <div class="value-text-md">${yeast.amountFormatted}</div>
        </td>
        <td class="ingredient-name">
          <div class="name-value">${yeast.productIdFormatted ? `${renderer.escapeHtml(yeast.productIdFormatted)} ` : ''}${renderer.escapeHtml(yeast.name)}</div>
          ${attenuationLabType ? `<div class="value-text-sm">${attenuationLabType}</div>` : ''}
        </td>
        <td class="ingredient-temp">
          <div class="temp-value">${yeast.tempRangeFormatted}</div>
        </td>
      </tr>
    `;
  }

  /**
   * Generate misc row HTML with exact structure
   * @param {Object} misc - Misc ingredient object
   * @param {Object} renderer - Renderer instance for escapeHtml
   * @param {string} tableClass - Table class to determine type display
   * @returns {string} Misc row HTML
   */
  static generateMiscRow(misc, renderer, tableClass) {
    // Don't show type info for Water Agents and Finings tables
    const hideTypeInfo = tableClass === 'water-agents-table' || tableClass === 'finings-table';
    const typeInfo = hideTypeInfo ? '' : (misc.typeFormatted || '');
    
    // Show time for uses where timing is relevant (Boil, Fermentation, Secondary)
    let timeDisplay = '';
    if (misc.use) {
      const lowerUse = misc.use.toLowerCase();
      if (lowerUse === 'boil' || lowerUse === 'fermentation' || lowerUse === 'add_to_fermentation' || lowerUse === 'secondary') {
        timeDisplay = misc.timeFormatted;
      }
    }
    
    return `
      <tr>
        <td class="ingredient-amount">
          <div class="value-text-md">${misc.amountFormatted}</div>
        </td>
        <td class="ingredient-name">
          <div class="name-value">${renderer.escapeHtml(misc.name)}</div>
          ${typeInfo ? `<div class="value-text-sm">${typeInfo}</div>` : ''}
        </td>
        <td class="ingredient-use">
          <div class="use-value">${misc.useFormatted}</div>
          ${timeDisplay ? `<div class="time-value">${timeDisplay}</div>` : ''}
        </td>
      </tr>
    `;
  }

  /**
   * Create a volume tracking table with the exact structure used by VolumeTrackingRenderer
   * @param {Array} rows - Array of row objects {label, value}
   * @param {string} tableClass - CSS class for the table
   * @returns {string} Volume tracking table HTML
   */
  createVolumeTrackingTable(rows, tableClass = 'volume-tracking-table') {
    if (!rows || rows.length === 0) {
      return '';
    }

    const rowsHTML = rows.map(row => `
      <tr>
        <td class="volume-label">${row.label}</td>
        <td class="volume-value">${this.formatValue(row.value)}</td>
      </tr>
    `).join('');

    return `
      <table class="${tableClass}">
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    `;
  }

  /**
   * Create a volume tracking subsection with the exact structure used by VolumeTrackingRenderer
   * @param {string} title - Subsection title
   * @param {string} content - Subsection content
   * @returns {string} Volume tracking subsection HTML
   */
  createVolumeTrackingSubsection(title, content) {
    return `
      <div class="volume-tracking-subsection">
        <h3 class="subsection-title">${title}</h3>
        ${content}
      </div>
    `;
  }

  /**
   * Create a calculation group with the exact structure used by VolumeTrackingRenderer
   * @param {Array} calculations - Array of calculation objects
   * @returns {string} Calculation group HTML
   */
  createCalculationGroup(calculations) {
    if (!calculations || calculations.length === 0) {
      return '';
    }

    const calculationRows = calculations.map(calc => 
      this.createCalculationRow(calc.type, calc.label, calc.value, calc.classes)
    ).join('');

    return `
      <div class="calculation-group">
        ${calculationRows}
      </div>
    `;
  }

  /**
   * Create a calculation row with the exact structure used by VolumeTrackingRenderer
   * @param {string} type - Type of calculation (base-value, addition, subtraction, subtotal, result, etc.)
   * @param {string} label - Calculation label
   * @param {string} value - Calculation value
   * @param {string} classes - Additional CSS classes
   * @returns {string} Calculation row HTML
   */
  createCalculationRow(type, label, value, classes = '') {
    const allClasses = `calculation-row ${type} ${classes}`.trim();
    
    return `
      <div class="${allClasses}">
        <span class="volume-label">${label}</span>
        <span class="volume-value">${this.formatValue(value)}</span>
      </div>
    `;
  }

  /**
   * Create a mash fermentation table with the exact structure used by MashFermentationRenderer
   * @param {Array} steps - Array of step objects
   * @param {Function} rowGenerator - Function that generates row HTML for each step
   * @param {string} tableClass - CSS class for the table
   * @returns {string} Mash fermentation table HTML
   */
  createMashFermentationTable(steps, rowGenerator, tableClass = 'value-text-md') {
    if (!steps || steps.length === 0) {
      return '';
    }

    const rowsHTML = steps.map(step => rowGenerator(step, this)).join('');
    
    return `
      <table class="ingredients-table ${tableClass}">
        <tbody>
          ${rowsHTML}
        </tbody>
      </table>
    `;
  }

  /**
   * Create a mash fermentation subsection with the exact structure used by MashFermentationRenderer
   * @param {string} title - Subsection title
   * @param {string} tableHTML - Table HTML content
   * @param {string} extraTitle - Extra title content (like profile name)
   * @returns {string} Mash fermentation subsection HTML
   */
  createMashFermentationSubsection(title, tableHTML, extraTitle = '') {
    const fullTitle = extraTitle ? `${title}${extraTitle}` : title;
    
    return `
      <div class="mash-fermentation-subsection">
        <h3 class="subsection-title">${fullTitle}</h3>
        ${tableHTML}
      </div>
    `;
  }

  /**
   * Generate mash step row HTML with exact structure
   * @param {Object} step - Mash step object
   * @param {Object} renderer - Renderer instance for escapeHtml
   * @returns {string} Mash step row HTML
   */
  static generateMashStepRow(step, renderer) {
    // Handle type and infuse amount formatting
    let typeInfo = '';
    if (step.typeFormatted) {
      if (step.typeFormatted.toLowerCase() === 'infusion' && step.infuseAmountFormatted) {
        typeInfo = `${step.typeFormatted} — ${step.infuseAmountFormatted}`;
      } else if (step.typeFormatted.toLowerCase() === 'temperature' && step.infuseAmount > 0) {
        typeInfo = step.typeFormatted;
      } else {
        typeInfo = step.typeFormatted;
      }
    }
    
    return `
      <tr>
        <td class="mash-step-temp">
          <div class="temp-value">${step.stepTempFormatted}</div>
          ${step.endTemp && step.endTemp > 0 ? `<div class="end-temp-value">End: ${step.endTempFormatted}</div>` : ''}
        </td>
        <td class="mash-step-name">
          <div class="name-value">${renderer.escapeHtml(step.name)}</div>
          ${typeInfo ? `<div class="value-text-sm">${typeInfo}</div>` : ''}
        </td>
        <td class="mash-step-time">
          <div class="time-value">${step.stepTimeFormatted}</div>
          ${step.rampTime && step.rampTime > 0 ? `<div class="ramp-time-value">Ramp: ${step.rampTimeFormatted}</div>` : ''}
        </td>
      </tr>
    `;
  }

  /**
   * Generate fermentation step row HTML with exact structure
   * @param {Object} step - Fermentation step object
   * @param {Object} renderer - Renderer instance for escapeHtml
   * @returns {string} Fermentation step row HTML
   */
  static generateFermentationStepRow(step, renderer) {
    return `
      <tr>
        <td class="fermentation-step-temp">
          <div class="temp-value">${step.tempFormatted}</div>
        </td>
        <td class="fermentation-step-name">
          <div class="name-value">${renderer.escapeHtml(step.name)}</div>
        </td>
        <td class="fermentation-step-time">
          <div class="time-value">${step.ageFormatted}</div>
        </td>
      </tr>
    `;
  }

  /**
   * Create a stats list with the exact structure used by HeaderRenderer
   * @param {Array} stats - Array of stat objects {label, value}
   * @param {string} className - CSS class for the stats container
   * @returns {string} Stats list HTML
   */
  createStatsList(stats, className = 'basic-stats') {
    if (!stats || stats.length === 0) {
      return '';
    }

    const statsHTML = stats.map(stat => this.createStat(stat.label, stat.value)).join('');
    
    return `
      <div class="${className}">
        ${statsHTML}
      </div>
    `;
  }

  /**
   * Create a single stat with the exact structure used by HeaderRenderer
   * @param {string} label - Stat label
   * @param {string} value - Stat value
   * @param {string} className - CSS class for the stat
   * @returns {string} Stat HTML
   */
  createStat(label, value, className = 'stat') {
    return `
      <div class="${className}">
        <span class="stat-label">${label}</span>
        <span class="stat-value">${this.formatValue(value)}</span>
      </div>
    `;
  }

  /**
   * Validate that required methods are implemented
   * @param {Array} methods - Array of method names to validate
   */
  validateImplementation(methods) {
    methods.forEach(method => {
      if (typeof this[method] !== 'function') {
        throw new Error(`${method}() method must be implemented by subclass`);
      }
    });
  }
}