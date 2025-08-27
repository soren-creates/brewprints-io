/**
 * Loading State Manager
 * Handles loading indicators and user feedback during async operations
 */

class LoadingManager {
  constructor() {
    this.activeLoaders = new Set();
  }

  /**
   * Show loading indicator with optional message
   * @param {string} message - Loading message to display
   * @param {string} [id] - Optional unique identifier for this loading state
   */
  showLoading(message = 'Loading...', id = 'default') {
    // Prevent duplicate loaders with same ID
    if (this.activeLoaders.has(id)) {
      return;
    }

    this.activeLoaders.add(id);

    // Create loading element
    const loader = document.createElement('div');
    loader.className = 'recipe-loader';
    loader.dataset.loaderId = id;
    loader.innerHTML = `
      <div class="loading-spinner"></div>
      <div class="loading-message">${this.escapeHtml(message)}</div>
    `;

    // Add to DOM
    document.body.appendChild(loader);

    // Prevent body scrolling while loading
    document.body.classList.add('u-overflow-hidden');
  }

  /**
   * Hide loading indicator
   * @param {string} [id] - Optional identifier of the loading state to hide
   */
  hideLoading(id = 'default') {
    if (!this.activeLoaders.has(id)) {
      return;
    }

    this.activeLoaders.delete(id);

    // Remove the specific loader
    const loader = document.querySelector(`.recipe-loader[data-loader-id="${id}"]`);
    if (loader) {
      loader.remove();
    }

    // Restore body scrolling if no loaders remain
    if (this.activeLoaders.size === 0) {
      document.body.classList.remove('u-overflow-hidden');
    }
  }

  /**
   * Hide all loading indicators
   */
  hideAllLoading() {
    const loaders = document.querySelectorAll('.recipe-loader');
    loaders.forEach(loader => loader.remove());
    this.activeLoaders.clear();
    document.body.classList.remove('u-overflow-hidden');
  }

  /**
   * Update loading message for an active loader
   * @param {string} message - New message to display
   * @param {string} [id] - Identifier of the loading state to update
   */
  updateLoadingMessage(message, id = 'default') {
    const loader = document.querySelector(`.recipe-loader[data-loader-id="${id}"]`);
    if (loader) {
      const messageElement = loader.querySelector('.loading-message');
      if (messageElement) {
        messageElement.textContent = message;
      }
    }
  }

  /**
   * Check if any loading states are active
   * @returns {boolean} - True if any loaders are active
   */
  isLoading() {
    return this.activeLoaders.size > 0;
  }

  /**
   * Check if a specific loading state is active
   * @param {string} [id] - Identifier to check
   * @returns {boolean} - True if the specified loader is active
   */
  isLoadingId(id = 'default') {
    return this.activeLoaders.has(id);
  }

  /**
   * Wrap an async operation with loading state
   * @param {Function} operation - Async function to execute
   * @param {string} message - Loading message
   * @param {string} [id] - Optional loader identifier
   * @returns {Promise} - Promise that resolves with operation result
   */
  async withLoading(operation, message, id = 'default') {
    this.showLoading(message, id);
    try {
      const result = await operation();
      return result;
    } finally {
      this.hideLoading(id);
    }
  }

  /**
   * Escape HTML to prevent XSS in loading messages
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Create and export singleton instance
export const loadingManager = new LoadingManager();