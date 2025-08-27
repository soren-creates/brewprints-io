/**
 * Upload Modal Component
 * Provides upload functionality in a modal overlay for logged-in users
 */

import { errorHandler } from '../../utilities/errors/error-handler.js';

export class UploadModal {
  constructor() {
    this.modal = null;
    this.fileInput = null;
    this.uploadZone = null;
    this.isVisible = false;
  }

  /**
   * Initialize the upload modal
   */
  init() {
    this.createModal();
    this.attachEventListeners();
  }

  /**
   * Create the modal DOM structure
   */
  createModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'uploadModal';
    this.modal.className = 'upload-modal u-hidden';

    this.modal.innerHTML = `
      <div class="modal-content upload-modal-content">
        <div class="modal-header">
          <h3>Upload Recipe</h3>
          <button class="modal-close" id="uploadModalClose">×</button>
        </div>
        <div class="modal-body">
          <div class="upload-area">
            <input type="file" id="modalFileInput" accept=".xml,.beerxml,.json" hidden>
            <div class="upload-zone" id="modalUploadZone">
              <div class="upload-icon">📄</div>
              <h3>Upload Your Recipe</h3>
              <p>Drop your recipe file here or click to select</p>
              <p class="format-support">Supports BeerXML, BeerJSON, and Brewfather formats</p>
              <button id="modalUploadButton" class="btn btn--primary btn--large">Choose File</button>
            </div>
            <div id="modalErrorMsg" class="error-message u-hidden"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.modal);

    // Store references to modal elements
    this.fileInput = document.getElementById('modalFileInput');
    this.uploadZone = document.getElementById('modalUploadZone');
    this.uploadButton = document.getElementById('modalUploadButton');
    this.closeButton = document.getElementById('uploadModalClose');
    this.errorMsg = document.getElementById('modalErrorMsg');
  }

  /**
   * Attach event listeners to modal elements
   */
  attachEventListeners() {
    // File input handling
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => this.handleFileLoad(e));
    }

    // Upload button - trigger file input click
    if (this.uploadButton && this.fileInput) {
      this.uploadButton.addEventListener('click', () => {
        this.fileInput.click();
      });
    }

    // Upload zone - make clickable and handle drag & drop
    if (this.uploadZone && this.fileInput) {
      this.uploadZone.addEventListener('click', () => {
        this.fileInput.click();
      });

      // Drag and drop handling
      this.uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.uploadZone.classList.add('drag-over');
      });

      this.uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        this.uploadZone.classList.remove('drag-over');
      });

      this.uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.uploadZone.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
          // Create a mock event to reuse existing file handling logic
          const mockEvent = { target: { files: files } };
          this.handleFileLoad(mockEvent);
        }
      });
    }

    // Close button
    if (this.closeButton) {
      this.closeButton.addEventListener('click', () => {
        this.hide();
      });
    }

    // Close modal when clicking outside
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  /**
   * Handle file upload - delegates to main app's file handling
   */
  async handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      // Hide modal immediately when file is selected
      this.hide();

      // Reset file input
      this.fileInput.value = '';

      // Delegate to main app's file handling
      if (window.brewLogApp && typeof window.brewLogApp.handleFileLoad === 'function') {
        // Create a proper event object for the main handler
        const fileEvent = { target: { files: [file] } };
        await window.brewLogApp.handleFileLoad(fileEvent);
      } else {
        throw new Error('Main app file handler not available');
      }
    } catch (error) {
      // Show error in modal
      this.showError(error.message || 'Failed to process file');
      console.error('Upload modal file processing error:', error);
    }
  }

  /**
   * Show error message in modal
   */
  showError(message) {
    if (this.errorMsg) {
      this.errorMsg.textContent = message;
      this.errorMsg.classList.remove('u-hidden');
      
      // Auto-hide error after 5 seconds
      setTimeout(() => {
        if (this.errorMsg) {
          this.errorMsg.classList.add('u-hidden');
        }
      }, 5000);
    }
  }

  /**
   * Show the upload modal
   */
  show() {
    if (this.modal) {
      this.modal.classList.remove('u-hidden');
      this.modal.classList.add('u-flex');
      this.isVisible = true;
      // Clear any previous errors
      if (this.errorMsg) {
        this.errorMsg.classList.add('u-hidden');
      }
      // Focus on the modal for keyboard navigation
      this.modal.focus();
    }
  }

  /**
   * Hide the upload modal
   */
  hide() {
    if (this.modal) {
      this.modal.classList.remove('u-flex');
      this.modal.classList.add('u-hidden');
      this.isVisible = false;
      // Reset file input
      if (this.fileInput) {
        this.fileInput.value = '';
      }
    }
  }

  /**
   * Check if modal is currently visible
   */
  isOpen() {
    return this.isVisible;
  }

  /**
   * Destroy the modal and clean up
   */
  destroy() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
      this.fileInput = null;
      this.uploadZone = null;
      this.uploadButton = null;
      this.closeButton = null;
      this.errorMsg = null;
      this.isVisible = false;
    }
  }
}