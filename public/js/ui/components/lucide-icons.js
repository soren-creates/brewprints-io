/**
 * Lucide Icon Helper
 * Proper implementation using the official Lucide library
 */

class LucideIcons {
  /**
   * Create an icon element using the proper Lucide data-lucide attribute
   * @param {string} iconName - Name of the Lucide icon (kebab-case)
   * @param {string} className - Additional CSS classes
   * @param {number} size - Icon size in pixels
   * @returns {string} - HTML string for the icon element
   */
  static create(iconName, className = '', size = 20) {
    const classStr = className ? ` class="${className}"` : '';
    const sizeStr = size !== 20 ? ` width="${size}" height="${size}"` : '';
    return `<i data-lucide="${iconName}"${classStr}${sizeStr}></i>`;
  }

  /**
   * Create an inline icon with text
   * @param {string} iconName - Name of the Lucide icon
   * @param {string} text - Text to display after icon
   * @param {number} size - Icon size in pixels
   * @returns {string} - HTML string
   */
  static createInline(iconName, text, size = 18) {
    return `${this.create(iconName, 'icon-inline', size)} ${text}`;
  }

  /**
   * Render all icons in the specified container
   * Call this after updating DOM with new icons
   * @param {Element} container - Container element (defaults to document)
   */
  static render(container = document) {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({
        // Only render icons within the specified container
        ...(container !== document && { element: container })
      });
    } else {
      console.warn('Lucide library not loaded yet');
    }
  }

  /**
   * Map of emoji icons to their Lucide equivalents
   */
  static iconMap = {
    // Header buttons
    'save': 'save',
    'print': 'printer',
    'data-fields': 'braces',
    'recipe-view': 'notebook-text',
    'close': 'x',
    
    // User dropdown
    'sign-in': 'log-in',
    'sign-out': 'log-out',
    'settings': 'settings',
    
    // Recipe cards
    'share': 'share',
    'delete': 'trash',
    'public': 'globe',
    'unlisted': 'link',
    'private': 'lock',
    
    // Modals
    'copy': 'copy',
    'refresh': 'refresh-cw',
    'check': 'check',
    'upload-file': 'upload',
    'image-url': 'link',
    'update': 'alert-triangle',
    'save-new': 'copy-plus',
    
    // Controls
    'show-all': 'eye',
    'hide-all': 'eye-off',
    'debug': 'bug',
    'upload': 'upload',
    'file-image': 'image'
  };
}

// Export for use in modules
export { LucideIcons };