/**
 * Recipe Image Manager
 * Handles image upload, URL input, and drag-and-drop functionality
 */

import { 
  isValidFileType, 
  isValidFileSize 
} from '../../utilities/validation/validation-utils.js';
import { LucideIcons } from './lucide-icons.js';

class RecipeImageManager {
  constructor() {
    this.currentImageUrl = null;
    this.tempImageUrl = null;
    this.modal = null;
    this.imageCache = new Map(); // In-memory cache for Firebase images
    this.originalImageUrl = null; // Track original image for change detection
    this.init();
  }

  init() {
    this.createModal();
    this.bindEvents();
  }

  createModal() {
    const modal = document.createElement('div');
    modal.id = 'image-upload-modal';
    modal.className = 'image-upload-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Add Recipe Image</h3>
          <button class="modal-close no-print" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="image-input-tabs">
            <button class="tab-btn active icon-button" data-tab="upload">
              ${LucideIcons.createInline('file-image', 'Upload File', 16)}
            </button>
            <button class="tab-btn icon-button" data-tab="url">
              ${LucideIcons.createInline('link', 'Image URL', 16)}
            </button>
          </div>
          
          <div class="tab-content" id="upload-tab">
            <div class="file-upload-area">
              <input type="file" id="image-file-input" accept="image/*">
              <div class="upload-zone" id="upload-zone">
                <span class="upload-icon">${LucideIcons.create('file-image', '', 48)}</span>
                <p>Click to select an image file<br>or drag and drop here</p>
                <small>Supports JPG, PNG, GIF, WebP (max 1MB)</small>
              </div>
              <div class="upload-error u-hidden" id="upload-error"></div>
            </div>
          </div>
          
          <div class="tab-content u-hidden" id="url-tab">
            <div class="url-input-area">
              <label for="image-url-input">Image URL:</label>
              <div class="url-input-group">
                <input type="url" id="image-url-input" placeholder="https://example.com/image.jpg">
                <button class="url-load-btn" id="url-load-btn">Load Image</button>
              </div>
              <div class="upload-error u-hidden" id="url-error"></div>
            </div>
          </div>
          
          <div class="image-preview u-hidden" id="image-preview">
            <img id="preview-image" alt="Preview">
            <div class="preview-controls">
              <button class="btn" id="cancel-preview-btn">Cancel</button>
              <button class="btn btn--primary icon-button" id="confirm-image-btn">
                ${LucideIcons.createInline('check', 'Use This Image', 18)}
              </button>
            </div>
            <div class="loading-overlay" id="loading-overlay">
              <div class="loading-spinner"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    this.modal = modal;
    
    // Render Lucide icons
    LucideIcons.render(this.modal);
  }

  bindEvents() {
    // Modal events
    this.modal.querySelector('.modal-close').addEventListener('click', () => this.hideModal());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hideModal();
    });

    // Tab switching
    this.modal.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // File upload events
    const fileInput = this.modal.querySelector('#image-file-input');
    const uploadZone = this.modal.querySelector('#upload-zone');
    
    if (uploadZone && fileInput) {
      uploadZone.addEventListener('click', () => {
        fileInput.click();
      });
      fileInput.addEventListener('change', (e) => {
        this.handleFileUpload(e);
      });

      // Drag and drop for upload zone
      uploadZone.addEventListener('dragover', this.handleDragOver.bind(this));
      uploadZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
      uploadZone.addEventListener('drop', this.handleDrop.bind(this));
    }

    // URL input events
    const urlLoadBtn = this.modal.querySelector('#url-load-btn');
    const urlInput = this.modal.querySelector('#image-url-input');
    if (urlLoadBtn) {
      urlLoadBtn.addEventListener('click', () => this.loadImageFromUrl());
    }
    if (urlInput) {
      urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.loadImageFromUrl();
      });
    }

    // Preview events
    const confirmBtn = this.modal.querySelector('#confirm-image-btn');
    const cancelBtn = this.modal.querySelector('#cancel-preview-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirmImage());
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.clearPreview());
    }

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.classList.contains('modal-visible')) {
        this.hideModal();
      }
    });
  }

  setupImagePlaceholder(placeholderElement) {
    if (!placeholderElement) return;

    // Add click handler
    placeholderElement.addEventListener('click', () => {
      this.showModal();
    });

    // Add drag and drop to placeholder
    placeholderElement.addEventListener('dragover', this.handleDragOver.bind(this));
    placeholderElement.addEventListener('dragleave', this.handleDragLeave.bind(this));
    placeholderElement.addEventListener('drop', (e) => this.handleDropOnPlaceholder(e));
  }

  setupImageDisplay(displayElement) {
    if (!displayElement) return;

    // Add click handler to change image (only on image, not buttons)
    displayElement.addEventListener('click', (e) => {
      // Only show modal if clicked on image or non-button elements
      if (!e.target.closest('.btn')) {
        this.showModal();
      }
    });
  }

  showModal() {
    this.modal.classList.remove('modal-hidden');
    this.modal.classList.add('modal-visible');
    this.clearPreview();
    this.clearErrors();
    
    // Ensure proper initial tab state - upload tab should be active and visible
    this.switchTab('upload');
    
    // Focus first tab
    this.modal.querySelector('.tab-btn.active').focus();
  }

  hideModal() {
    this.modal.classList.remove('modal-visible');
    this.modal.classList.add('modal-hidden');
    this.clearPreview();
    this.clearErrors();
  }

  switchTab(tabName) {
    // Update tab buttons
    this.modal.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Show/hide tab content using consistent utility classes
    const uploadTab = this.modal.querySelector('#upload-tab');
    const urlTab = this.modal.querySelector('#url-tab');
    
    if (tabName === 'upload') {
      uploadTab.classList.remove('u-hidden');
      urlTab.classList.add('u-hidden');
    } else if (tabName === 'url') {
      uploadTab.classList.add('u-hidden');
      urlTab.classList.remove('u-hidden');
    }
    
    this.clearErrors();
  }

  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.target.closest('.upload-zone, .recipe-image-placeholder').classList.add('drag-over');
  }

  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    e.target.closest('.upload-zone, .recipe-image-placeholder').classList.remove('drag-over');
  }

  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.target.closest('.upload-zone').classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      this.processFile(files[0]);
    }
  }

  handleDropOnPlaceholder(e) {
    e.preventDefault();
    e.stopPropagation();
    e.target.closest('.recipe-image-placeholder').classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      this.processFile(files[0], true); // Auto-confirm for placeholder drops
    }
  }

  handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
      this.processFile(file);
    }
  }

  processFile(file, autoConfirm = false) {
    this.clearErrors();

    // Validate file type
    if (!isValidFileType(file, 'image/*')) {
      this.showError('upload-error', 'Please select a valid image file.');
      return;
    }

    // Validate file size - 1MB limit to account for Base64 encoding overhead and localStorage limits
    // (1MB file becomes ~1.3MB when encoded, but modern browsers can handle this)
    const maxFileSize = 1024 * 1024; // 1MB
    if (!isValidFileSize(file, maxFileSize)) {
      this.showError('upload-error', `Image file size must be less than 1MB to fit storage limits.`);
      return;
    }

    // Show loading
    this.showLoading();

    // Read file
    const reader = new FileReader();
    reader.onload = (e) => {
      this.hideLoading();
      
      // Check data URL size for storage compatibility
      const dataUrl = e.target.result;
      const sizeInBytes = dataUrl.length;
      const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
      
      // Check if image will be too large for localStorage (1.3MB encoded limit for 1MB files)
      if (sizeInBytes > 1300000) {
        this.showError('upload-error', 
          `Image too large for storage (${sizeInMB}MB). Please use a smaller image or compress it. Maximum size: 1MB.`);
        return;
      }
      
      if (autoConfirm) {
        this.tempImageUrl = dataUrl;
        this.confirmImage(true); // Pass isAutoConfirm = true
        // hideModal() is now handled within saveImageToStorage on success
      } else {
        this.showPreview(dataUrl);
      }
    };
    reader.onerror = () => {
      this.hideLoading();
      this.showError('upload-error', 'Error reading file. Please try again.');
    };
    reader.readAsDataURL(file);
  }

  loadImageFromUrl() {
    const url = this.modal.querySelector('#image-url-input').value.trim();
    this.clearErrors();

    if (!url) {
      this.showError('url-error', 'Please enter a valid image URL.');
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      this.showError('url-error', 'Please enter a valid URL.');
      return;
    }

    // Show loading
    this.showLoading();

    // Test if image loads
    const img = new Image();
    img.onload = () => {
      this.hideLoading();
      
      // Convert to data URL to check size
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const sizeInBytes = dataUrl.length;
        const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
        
        // Check if too large for localStorage
        if (sizeInBytes > 1300000) {
          this.showError('url-error', 
            `Image too large for storage (${sizeInMB}MB). Please use a smaller image. Maximum size: 1MB.`);
          return;
        }
        
        
        this.showPreview(url);
      } catch (error) {
        console.error('Error processing image:', error);
        this.showPreview(url); // Fallback to original URL
      }
    };
    img.onerror = () => {
      this.hideLoading();
      this.showError('url-error', 'Could not load image from the provided URL. Please check the URL and try again.');
    };
    
    // Set a timeout for loading
    setTimeout(() => {
      if (this.modal.querySelector('#loading-overlay').classList.contains('overlay--visible')) {
        this.hideLoading();
        this.showError('url-error', 'Image loading timed out. Please try again.');
      }
    }, 10000);
    
    img.src = url;
  }

  showPreview(imageUrl) {
    const preview = this.modal.querySelector('#image-preview');
    const previewImg = this.modal.querySelector('#preview-image');
    const uploadTab = this.modal.querySelector('#upload-tab');
    const urlTab = this.modal.querySelector('#url-tab');
    
    previewImg.src = imageUrl;
    // Show preview using CSS class
    preview.classList.remove('u-hidden');
    this.tempImageUrl = imageUrl;
    
    // Hide both tabs when preview is shown using CSS classes
    if (uploadTab) {
      uploadTab.classList.add('u-hidden');
    }
    if (urlTab) {
      urlTab.classList.add('u-hidden');
    }
  }

  clearPreview() {
    const preview = this.modal.querySelector('#image-preview');
    const uploadTab = this.modal.querySelector('#upload-tab');
    const urlTab = this.modal.querySelector('#url-tab');
    
    // Hide preview using CSS class
    preview.classList.add('u-hidden');
    
    // Clear form inputs
    this.modal.querySelector('#image-file-input').value = '';
    this.modal.querySelector('#image-url-input').value = '';
    this.tempImageUrl = null;
    
    // Show the appropriate tab when preview is cleared using CSS classes
    const activeTab = this.modal.querySelector('.tab-btn.active');
    if (activeTab) {
      const tabName = activeTab.dataset.tab;
      if (tabName === 'upload') {
        uploadTab.classList.remove('u-hidden');
        urlTab.classList.add('u-hidden');
      } else if (tabName === 'url') {
        uploadTab.classList.add('u-hidden');
        urlTab.classList.remove('u-hidden');
      }
    }
    
    // Clear any conflicting inline styles
    preview.classList.remove('preview--hidden');
    preview.classList.add('preview--visible');
    uploadTab.classList.remove('tab--hidden');
    uploadTab.classList.add('tab--visible');
    urlTab.classList.remove('tab--hidden');
    urlTab.classList.add('tab--visible');
  }

  confirmImage(isAutoConfirm = false) {
    if (!this.tempImageUrl) return;

    // Save to storage first, only update UI if successful
    this.saveImageToStorage(this.tempImageUrl, isAutoConfirm);
  }

  updateRecipeImage() {
    const placeholder = document.querySelector('.recipe-image-placeholder');
    const display = document.querySelector('.recipe-image-display');

    if (!placeholder) return;

    if (this.currentImageUrl) {
      // Hide placeholder, show image
      placeholder.classList.add('preview--hidden');
      placeholder.classList.remove('preview--visible');
      
      if (display) {
        display.classList.add('preview--visible');
        display.classList.remove('preview--hidden');
        const img = display.querySelector('img');
        if (img) {
          img.src = this.currentImageUrl;
        }
      } else {
        // Create image display element
        const imageDisplay = document.createElement('div');
        imageDisplay.className = 'recipe-image-display';
        imageDisplay.innerHTML = `
          <img src="${this.currentImageUrl}" alt="Recipe Image">
          <div class="image-controls no-print">
            <button class="btn btn--primary btn--tiny image-change-btn">Change</button>
            <button class="btn btn--danger btn--tiny image-remove-btn">Remove</button>
          </div>
        `;
        
        // Add event listeners
        imageDisplay.querySelector('.image-change-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          this.showModal();
        });
        imageDisplay.querySelector('.image-remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeImage();
        });
        
        this.setupImageDisplay(imageDisplay);
        placeholder.parentNode.appendChild(imageDisplay);
      }
    }
  }

  removeImage() {
    this.currentImageUrl = null;
    
    // Update UI
    const placeholder = document.querySelector('.recipe-image-placeholder');
    const display = document.querySelector('.recipe-image-display');
    
    if (placeholder) {
      placeholder.classList.add('preview--visible');
      placeholder.classList.remove('preview--hidden');
    }
    if (display) {
      display.classList.add('preview--hidden');
      display.classList.remove('preview--visible');
    }
    
    // Remove from storage
    this.removeImageFromStorage();
    
    // Notify about the change
    this.notifyChangeState();
  }

  saveImageToStorage(imageData = null, isAutoConfirm = false) {
    // Use provided imageData or fall back to current image
    const imageToSave = imageData || this.currentImageUrl;
    
    if (imageToSave && window.currentRecipeId) {
      // For new/unsaved recipes, store temporarily in localStorage
      // For saved recipes, images will be stored in Firebase when recipe is saved
      const key = `temp_recipe_image_${window.currentRecipeId}`;
      
      try {
        // Always use temporary localStorage key for editing
        localStorage.setItem(key, imageToSave);
        
        // Clear any previous removal flag since we're adding an image
        const removalKey = `recipe_image_removed_${window.currentRecipeId}`;
        localStorage.removeItem(removalKey);
        
        // Cache in memory for immediate display
        this.imageCache.set(window.currentRecipeId, imageToSave);
        
        // Only update UI after successful storage
        this.currentImageUrl = imageToSave;
        this.updateRecipeImage();
        this.hideModal();
        
        // Clear temp image
        this.tempImageUrl = null;
        
        // Notify about the change
        this.notifyChangeState();
        
      } catch (error) {
        if (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014) {
          // Handle localStorage quota exceeded
          this.handleStorageQuotaExceeded(key, imageToSave, isAutoConfirm);
        } else {
          console.error('Failed to save image to localStorage:', error);
          
          if (isAutoConfirm) {
            // For auto-confirm (drag & drop), show toast since no modal is open
            this.showToast('Failed to save image. Please try again.', 'error');
          } else {
            // For modal workflow, show error in modal and keep it open
            this.showError('upload-error', 'Failed to save image. Please try again.');
            this.clearPreview();
          }
        }
      }
    }
  }

  /**
   * Handle localStorage quota exceeded by cleaning up old images
   */
  handleStorageQuotaExceeded(key, imageData, isAutoConfirm = false) {
    try {
      // First, try to clean up old recipe images
      const cleaned = this.cleanupOldRecipeImages();
      
      if (cleaned > 0) {
        // Try saving again after cleanup
        try {
          localStorage.setItem(key, imageData);
          
          // Success after cleanup - update UI
          this.currentImageUrl = imageData;
          this.updateRecipeImage();
          this.hideModal();
          this.tempImageUrl = null;
          
          this.showToast(`Image saved after cleaning up ${cleaned} old image(s)`, 'info');
          return;
        } catch (retryError) {
          // Still failed after cleanup
        }
      }
      
      // Calculate image size and storage usage for better error message
      const imageSizeMB = (imageData.length / (1024 * 1024)).toFixed(2);
      const storageUsageMB = this.getLocalStorageUsage();
      
      // If cleanup didn't help or no cleanup was possible, show user-friendly error
      this.showToast(`Temporary storage full (${storageUsageMB}MB used). Image (${imageSizeMB}MB) won't fit. Try a smaller image - it will be stored in the cloud when you save the recipe.`, 'warning');
      
      // Don't update UI since save failed - keep current state
      if (!isAutoConfirm) {
        // For modal workflow, clear temp image and keep modal open for retry
        this.clearPreview();
      }
      // For auto-confirm (drag & drop), no modal cleanup needed
      
    } catch (cleanupError) {
      console.error('Error during storage cleanup:', cleanupError);
      this.showToast('Storage limit reached. Please use a smaller image.', 'error');
      
      if (!isAutoConfirm) {
        // For modal workflow, clear temp image and keep modal open
        this.clearPreview();
      }
      // For auto-confirm (drag & drop), no modal cleanup needed
    }
  }

  /**
   * Clean up old recipe images to free up localStorage space
   * @returns {number} Number of images cleaned up
   */
  cleanupOldRecipeImages() {
    let cleanedCount = 0;
    const imagesToKeep = 5; // Keep only the 5 most recent temporary images
    const tempImageKeys = [];
    
    // Find all temporary recipe image keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('temp_recipe_image_')) {
        tempImageKeys.push(key);
      }
    }
    
    // If we have more than the limit, clean up oldest ones
    if (tempImageKeys.length > imagesToKeep) {
      // Sort by key (which includes timestamp for generated recipe IDs)
      tempImageKeys.sort();
      
      // Remove oldest images (keep the most recent ones)
      const imagesToRemove = tempImageKeys.slice(0, tempImageKeys.length - imagesToKeep);
      
      imagesToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
          cleanedCount++;
        } catch (error) {
          console.warn('Failed to remove old image:', key, error);
        }
      });
    }
    
    // Also clean up legacy permanent images if they exist
    const permanentImageKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('recipe_image_') && !key.startsWith('temp_recipe_image_')) {
        permanentImageKeys.push(key);
      }
    }
    
    // Remove old permanent images (they should be in Firebase now)
    permanentImageKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
        cleanedCount++;
      } catch (error) {
        console.warn('Failed to remove legacy image:', key, error);
      }
    });
    
    return cleanedCount;
  }
  
  /**
   * Clear image from storage when recipe is saved to Firebase
   * This prevents localStorage from filling up
   */
  clearImageAfterSave() {
    if (window.currentRecipeId) {
      const tempKey = `temp_recipe_image_${window.currentRecipeId}`;
      localStorage.removeItem(tempKey);
      // Keep in memory cache for immediate use
      
      // Reset change tracking after successful save
      this.originalImageUrl = this.currentImageUrl;
      this.notifyChangeState();
    }
  }

  /**
   * Set the original image URL for change tracking
   * Call this when loading a saved recipe
   */
  setOriginalImage(imageUrl) {
    this.originalImageUrl = imageUrl;
    this.currentImageUrl = imageUrl;
    this.notifyChangeState();
  }

  /**
   * Check if the image has been modified
   */
  hasImageChanged() {
    return this.currentImageUrl !== this.originalImageUrl;
  }

  /**
   * Notify about recipe change state
   */
  notifyChangeState() {
    const hasChanges = this.hasImageChanged();
    window.dispatchEvent(new CustomEvent('recipeChanged', {
      detail: { hasChanges, source: 'image' }
    }));
  }

  /**
   * Clear image state when starting a new recipe
   */
  clearImage() {
    this.currentImageUrl = null;
    this.originalImageUrl = null;
    this.tempImageUrl = null;
    
    // Update UI
    const placeholder = document.querySelector('.recipe-image-placeholder');
    const display = document.querySelector('.recipe-image-display');
    
    if (placeholder) {
      placeholder.classList.add('preview--visible');
      placeholder.classList.remove('preview--hidden');
    }
    if (display) {
      display.classList.add('preview--hidden');
      display.classList.remove('preview--visible');
    }
    
    // Notify about the cleared state
    this.notifyChangeState();
  }
  
  /**
   * Get current localStorage usage in MB
   */
  getLocalStorageUsage() {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage.getItem(key).length;
      }
    }
    return (total / (1024 * 1024)).toFixed(2);
  }

  cleanupOldRecipeImages() {
    let cleanedCount = 0;
    const imagesToKeep = 10; // Keep only the 10 most recent images
    const imageKeys = [];
    
    // Find all recipe image keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('recipe_image_')) {
        imageKeys.push(key);
      }
    }
    
    // If we have more than the limit, clean up oldest ones
    if (imageKeys.length > imagesToKeep) {
      // Sort by key (which includes timestamp for generated recipe IDs)
      imageKeys.sort();
      
      // Remove oldest images (keep the most recent ones)
      const imagesToRemove = imageKeys.slice(0, imageKeys.length - imagesToKeep);
      
      imagesToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
          cleanedCount++;
        } catch (error) {
          console.warn('Failed to remove old image:', key, error);
        }
      });
    }
    
    return cleanedCount;
  }

  /**
   * Show toast notification (integrates with app's toast system)
   */
  showToast(message, type = 'info') {
    // Dispatch custom event that will be handled by main app
    window.dispatchEvent(new CustomEvent('showToast', {
      detail: { message, type }
    }));
  }

  removeImageFromStorage() {
    if (window.currentRecipeId) {
      // Remove from temporary localStorage
      const tempKey = `temp_recipe_image_${window.currentRecipeId}`;
      localStorage.removeItem(tempKey);
      
      // Remove from permanent localStorage (legacy)
      const permanentKey = `recipe_image_${window.currentRecipeId}`;
      localStorage.removeItem(permanentKey);
      
      // Set a removal flag to indicate image was explicitly removed
      const removalKey = `recipe_image_removed_${window.currentRecipeId}`;
      localStorage.setItem(removalKey, 'true');
      
      // Remove from memory cache
      this.imageCache.delete(window.currentRecipeId);
    }
  }

  async loadImageFromStorage() {
    if (!window.currentRecipeId) return;
    
    // Check memory cache first
    if (this.imageCache.has(window.currentRecipeId)) {
      const imageUrl = this.imageCache.get(window.currentRecipeId);
      this.setOriginalImage(imageUrl);
      this.updateRecipeImage();
      return;
    }
    
    // Check temporary localStorage (for editing)
    const tempKey = `temp_recipe_image_${window.currentRecipeId}`;
    const tempImageUrl = localStorage.getItem(tempKey);
    if (tempImageUrl) {
      this.currentImageUrl = tempImageUrl;
      this.imageCache.set(window.currentRecipeId, tempImageUrl);
      // For temp images, we don't set original - they are modifications
      this.updateRecipeImage();
      this.notifyChangeState(); // Temp images indicate changes
      return;
    }
    
    // Check permanent localStorage (legacy support)
    const permanentKey = `recipe_image_${window.currentRecipeId}`;
    const permanentImageUrl = localStorage.getItem(permanentKey);
    if (permanentImageUrl) {
      this.setOriginalImage(permanentImageUrl);
      this.imageCache.set(window.currentRecipeId, permanentImageUrl);
      this.updateRecipeImage();
      return;
    }
    
    // For saved recipes, try to load from Firebase via storage manager
    if (window.storageManager && window.storageManager.getRecipeImageFromFirebase) {
      try {
        const firebaseImageUrl = await window.storageManager.getRecipeImageFromFirebase(window.currentRecipeId);
        if (firebaseImageUrl) {
          this.setOriginalImage(firebaseImageUrl);
          this.imageCache.set(window.currentRecipeId, firebaseImageUrl);
          this.updateRecipeImage();
        }
      } catch (error) {
        console.warn('Failed to load image from Firebase:', error);
        // Continue without image - not a critical error
      }
    }
  }

  showError(elementId, message) {
    const errorElement = this.modal.querySelector(`#${elementId}`);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.remove('u-hidden');
      errorElement.classList.add('u-block');
    }
  }

  clearErrors() {
    this.modal.querySelectorAll('.upload-error').forEach(el => {
      el.classList.remove('u-block');
      el.classList.add('u-hidden');
      el.textContent = '';
    });
  }

  showLoading() {
    const loadingOverlay = this.modal.querySelector('#loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('overlay--visible');
      loadingOverlay.classList.remove('overlay--hidden');
    }
  }

  hideLoading() {
    const loadingOverlay = this.modal.querySelector('#loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('overlay--hidden');
      loadingOverlay.classList.remove('overlay--visible');
    }
  }

  // Initialize with existing placeholder after DOM is ready
  initializeWithExistingPlaceholder() {
    const placeholder = document.querySelector('.recipe-image-placeholder');
    const display = document.querySelector('.recipe-image-display');
    
    if (placeholder) {
      this.setupImagePlaceholder(placeholder);
    }
    
    if (display) {
      this.setupImageDisplay(display);
      
      // Add event listeners to existing controls
      const changeBtn = display.querySelector('.btn--primary');
      const removeBtn = display.querySelector('.btn--danger');
      
      if (changeBtn) {
        changeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showModal();
        });
      }
      
      if (removeBtn) {
        removeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.removeImage();
        });
      }
    }
  }
}

// Export for module use
export { RecipeImageManager };
