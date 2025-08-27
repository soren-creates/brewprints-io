/**
 * My Recipes Page Component
 * Displays and manages saved recipes from Firebase
 */

import { storageManager } from '../../storage/storage-manager.js';
import { errorHandler } from '../../utilities/errors/error-handler.js';
import { EVENTS } from '../../core/constants.js';
import { clerkAuth } from '../../auth/clerk-config.js';
import { debug } from '../../utilities/debug.js';
import { domBatcher, modalManager, debounce, performanceMonitor } from '../../utilities/performance/sharing-performance.js';
import { UploadModal } from '../components/upload-modal.js';
import { LucideIcons } from '../components/lucide-icons.js';

export class MyRecipesPage {
  constructor() {
    this.recipes = [];
    this.container = null;
    this.floatingUploadBtn = null;
    this.uploadModal = new UploadModal();
    
    // Create debounced versions of performance-sensitive methods
    this.debouncedShareRecipe = debounce(this.shareRecipe.bind(this), 300);
    this.debouncedChangePrivacyAndShare = debounce(this.changePrivacyAndShare.bind(this), 500);
    this.debouncedGenerateNewLink = debounce(this.generateNewShareLink.bind(this), 300);
  }

  /**
   * Initialize the My Recipes page
   */
  init() {
    this.container = document.getElementById('my-recipes-page');
    this.createFloatingUploadButton();
    this.uploadModal.init();
    this.setupEventListeners();
  }

  /**
   * Create floating upload button
   */
  createFloatingUploadButton() {
    // Create floating upload button
    this.floatingUploadBtn = document.createElement('button');
    this.floatingUploadBtn.id = 'floatingUploadBtn';
    this.floatingUploadBtn.className = 'btn btn--primary btn--floating btn--upload no-print';
    this.floatingUploadBtn.innerHTML = LucideIcons.create('file-up', '', 28);
    this.floatingUploadBtn.classList.add('u-hidden');
    this.floatingUploadBtn.title = 'Upload Recipe';
    document.body.appendChild(this.floatingUploadBtn);
    
    // Render Lucide icons
    LucideIcons.render(this.floatingUploadBtn);
    
    // Add click event listener - open upload modal for logged-in users
    this.floatingUploadBtn.addEventListener('click', () => {
      if (clerkAuth.isUserSignedIn()) {
        this.uploadModal.show();
      } else {
        // Fallback to navigation for unauthenticated users
        window.dispatchEvent(new Event(EVENTS.BACK_TO_UPLOAD));
      }
    });
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Listen for offline queue processing completion
    window.addEventListener(EVENTS.OFFLINE_QUEUE_PROCESSED, (e) => {
      console.log('🔄 Offline queue processed, refreshing My Recipes page...', e.detail);
      // Only refresh if we're currently on the My Recipes page
      if (this.container && this.container.classList.contains('active')) {
        this.loadRecipes();
      }
    });
  }

  /**
   * Show the My Recipes page and load recipes
   */
  async show() {
    if (!this.container) {
      this.init();
    }

    // Show the page
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    this.container.classList.add('active');
    
    // Show floating upload button
    if (this.floatingUploadBtn) {
      this.floatingUploadBtn.classList.remove('u-hidden');
      this.floatingUploadBtn.classList.add('u-flex');
    }

    // Check if user is signed in
    if (!clerkAuth.isUserSignedIn()) {
      this.showSignInPrompt();
      return;
    }

    // Load and display recipes
    await this.loadRecipes();
  }

  /**
   * Show sign-in prompt for unauthenticated users
   */
  showSignInPrompt() {
    const recipesList = document.getElementById('recipesList');
    const emptyState = document.getElementById('emptyState');
    
    if (recipesList) {
      recipesList.innerHTML = `
        <div class="sign-in-prompt">
          <h3>Sign In Required</h3>
          <p>Please sign in to view your saved recipes.</p>
          <button onclick="window.headerManager?.dropdown?.signIn?.click()" class="btn btn--primary">
            🔑 Sign In
          </button>
        </div>
      `;
    }
    
    if (emptyState) {
      emptyState.classList.add('u-hidden');
    }
  }

  /**
   * Hide the My Recipes page
   */
  hide() {
    if (this.container) {
      this.container.classList.remove('active');
    }
    
    // Hide floating upload button
    if (this.floatingUploadBtn) {
      this.floatingUploadBtn.classList.remove('u-flex');
      this.floatingUploadBtn.classList.add('u-hidden');
    }
  }

  /**
   * Load recipes from Firebase
   */
  async loadRecipes() {
    const recipesList = document.getElementById('recipesList');
    const emptyState = document.getElementById('emptyState');

    if (!recipesList) return;

    // Show loading state
    recipesList.innerHTML = '<div class="loading-recipes">Loading recipes...</div>';
    emptyState.classList.add('u-hidden');

    try {
      // Load recipes from Firebase
      this.recipes = await storageManager.listRecipes();

      if (this.recipes.length === 0) {
        // Show empty state
        recipesList.innerHTML = '';
        emptyState.classList.remove('u-hidden');
        emptyState.classList.add('u-block');
      } else {
        // Sort by saved date (newest first)
        this.recipes.sort((a, b) => {
          const dateA = new Date(a.savedAt || 0);
          const dateB = new Date(b.savedAt || 0);
          return dateB - dateA;
        });

        // Render recipe cards
        this.renderRecipes();
      }
    } catch (error) {
      recipesList.innerHTML = '<div class="error-message">Failed to load recipes. Please try again.</div>';
      errorHandler.handleError(error, {
        component: 'MyRecipesPage',
        method: 'loadRecipes'
      });
    }
  }

  /**
   * Render recipe cards
   */
  renderRecipes() {
    const recipesList = document.getElementById('recipesList');
    if (!recipesList) return;

    // Batch DOM updates for better performance
    domBatcher.schedule(() => {
      // Generate all HTML at once to minimize DOM manipulation
      recipesList.innerHTML = this.recipes.map(recipe => this.createRecipeCard(recipe)).join('');
    });
    
    // Batch event listener setup
    domBatcher.schedule(() => {
      // Add event listeners to cards
      recipesList.querySelectorAll('.recipe-card').forEach(card => {
        const recipeId = card.dataset.recipeId;
        const recipe = this.recipes.find(r => r.id === recipeId);
        
        // Share button
        card.querySelector('.share-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.debouncedShareRecipe(recipeId);
        });

        // Delete button
        card.querySelector('.delete-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteRecipe(recipeId);
        });

        // Privacy status click - open privacy modal
        card.querySelector('.recipe-privacy-status')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showPrivacyDialog(recipeId);
        });

        // Card click - load recipe (but not when clicking action buttons or privacy status)
        card.addEventListener('click', (e) => {
          // Don't load recipe if clicking on action buttons or privacy status
          if (e.target.closest('.recipe-actions') || e.target.closest('.recipe-privacy-status')) return;
          this.loadRecipe(recipeId);
        });
      });
      
      // Load recipe images on-demand after DOM is ready
      this.loadRecipeImages();
      
      // Render Lucide icons
      LucideIcons.render(recipesList);
    });
  }

  /**
   * Create HTML for a recipe card with streamlined actions
   */
  createRecipeCard(recipe) {
    const savedDate = recipe.savedAt ? new Date(recipe.savedAt).toLocaleDateString() : 'Unknown';
    
    // Handle privacy levels
    const privacy = recipe.privacy || 'unlisted';
    
    const privacyInfo = {
      'public': { icon: 'globe', label: 'Public', color: getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim() },
      'unlisted': { icon: 'link', label: 'Unlisted', color: getComputedStyle(document.documentElement).getPropertyValue('--warning-color').trim() }, 
      'private': { icon: 'lock', label: 'Private', color: getComputedStyle(document.documentElement).getPropertyValue('--gray-300').trim() }
    }[privacy];
    
    // Images will be loaded on-demand after rendering
    return `
      <div class="recipe-card" data-recipe-id="${recipe.id}" data-needs-image="true">
        <div class="recipe-card-overlay"></div>
        <div class="recipe-card-content">
          <div class="recipe-header-row">
            <h3 class="recipe-name">${this.escapeHtml(recipe.name)}</h3>
            <div class="recipe-top-section">
              <div class="recipe-date">${savedDate}</div>
              <div class="recipe-privacy-status privacy-status-${privacy.toLowerCase()}" style="font-size: 0.85rem;">
                ${LucideIcons.createInline(privacyInfo.icon, privacyInfo.label, 14)}
              </div>
            </div>
          </div>
          
          <div class="recipe-bottom-row">
            <div class="recipe-style">
              ${this.escapeHtml(recipe.style?.name || recipe.style || 'Unknown Style')}
              ${recipe.abv || recipe.ibu ? ' • ' : ''}${recipe.abv ? `${recipe.abv.toFixed(1)}% ABV` : ''}${recipe.abv && recipe.ibu ? ' • ' : ''}${recipe.ibu ? `${Math.round(recipe.ibu)} IBU` : ''}
            </div>
            
            <div class="recipe-actions">
              ${privacy !== 'private' ? '<button class="btn btn--share-card share-btn" data-recipe-id="' + recipe.id + '">' + LucideIcons.create('send', '', 18) + '</button>' : ''}
              <button class="btn btn--delete-card delete-btn" data-recipe-id="${recipe.id}">${LucideIcons.create('trash', '', 18)}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Load a recipe and navigate to recipe view
   */
  async loadRecipe(recipeId) {
    try {
      // Dispatch event to load the saved recipe
      window.dispatchEvent(new CustomEvent(EVENTS.LOAD_SAVED_RECIPE, {
        detail: { recipeId }
      }));
    } catch (error) {
      this.showToast('Failed to load recipe', 'error');
      errorHandler.handleError(error, {
        component: 'MyRecipesPage',
        method: 'loadRecipe',
        recipeId
      });
    }
  }


  /**
   * Show privacy change dialog
   */
  showPrivacyDialog(recipeId, action = 'change') {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) return;
    
    // Get current privacy status
    const currentPrivacy = recipe.privacy || 'unlisted';
    
    const actionText = action === 'share' ? 'to share' : '';
    
    const content = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Privacy Settings</h3>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="privacy-options">
            <button class="privacy-option ${currentPrivacy === 'public' ? 'privacy-option--current' : ''}" data-privacy="public" disabled>
              <div class="privacy-icon">🌐</div>
              <div class="privacy-info">
                <strong>Public (COMING SOON)</strong>
                <p>Anyone can discover and view this recipe</p>
              </div>
            </button>
            <button class="privacy-option ${currentPrivacy === 'unlisted' ? 'privacy-option--current' : ''}" data-privacy="unlisted">
              <div class="privacy-icon">🔗</div>
              <div class="privacy-info">
                <strong>Unlisted</strong>
                <p>Only people with the link can view this recipe</p>
              </div>
            </button>
            <button class="privacy-option ${currentPrivacy === 'private' ? 'privacy-option--current' : ''}" data-privacy="private">
              <div class="privacy-icon">🔒</div>
              <div class="privacy-info">
                <strong>Private</strong>
                <p>Only you can view this recipe</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    `;
    
    const modal = modalManager.showModal('privacy-dialog', content);
    
    // Render Lucide icons
    LucideIcons.render(modal);
    
    // Batch event listener setup
    domBatcher.schedule(() => {
      // Handle privacy selection
      modal.querySelectorAll('.privacy-option').forEach(btn => {
        btn.addEventListener('click', async () => {
          // Skip if button is disabled
          if (btn.disabled) return;
          
          const newPrivacy = btn.dataset.privacy;
          modalManager.closeModal(modal);
          
          // Only update if privacy is actually changing
          if (newPrivacy !== currentPrivacy) {
            await this.debouncedChangePrivacyAndShare(recipeId, newPrivacy, action);
          }
        });
      });
      
      // Handle close
      modal.querySelector('.modal-close').addEventListener('click', () => {
        modalManager.closeModal(modal);
      });
    });
  }

  /**
   * Change privacy and optionally share
   */
  async changePrivacyAndShare(recipeId, newPrivacy, action) {
    const startTime = performanceMonitor.startTiming('privacyChange');
    
    try {
      // Update privacy using new system
      await storageManager.updateRecipePrivacy(recipeId, newPrivacy);
      
      this.showToast(`Recipe privacy updated to ${newPrivacy}`, 'success');
      
      // If action was share, generate share link
      if (action === 'share') {
        const shareResult = await storageManager.createShareToken(recipeId);
        this.showShareModal(shareResult, newPrivacy, recipeId);
      }
      
      // Update the recipe privacy in memory and refresh just this card
      this.updateRecipePrivacyInList(recipeId, newPrivacy);
      
      performanceMonitor.endTiming('privacyChange', startTime);
      
    } catch (error) {
      performanceMonitor.endTiming('privacyChange', startTime);
      this.showToast('Failed to update privacy', 'error');
      errorHandler.handleError(error, {
        component: 'MyRecipesPage',
        method: 'changePrivacyAndShare',
        recipeId,
        newPrivacy
      });
    }
  }

  /**
   * Share a recipe using new token-based system
   */
  async shareRecipe(recipeId) {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) return;


    try {
      const privacy = recipe.privacy || 'unlisted';
      
      if (privacy === 'private') {
        // Show privacy change dialog for private recipes
        this.showPrivacyDialog(recipeId, 'share');
        return;
      }
      
      // Generate share token  
      this.showToast('Loading share link...', 'info');
      const shareResult = await storageManager.createShareToken(recipeId);
      
      // Show share modal with result
      this.showShareModal(shareResult, privacy, recipeId);
      
    } catch (error) {
      this.showToast('Failed to create share link', 'error');
      errorHandler.handleError(error, {
        component: 'MyRecipesPage',
        method: 'shareRecipe',
        recipeId
      });
    }
  }

  /**
   * Show share modal with hybrid token system
   */
  showShareModal(shareResult, privacy, recipeId = null) {
    const startTime = performanceMonitor.startTiming('modalOpenTime');
    
    const privacyInfo = {
      'public': {
        icon: 'globe',
        message: 'This public recipe can be discovered and shared freely.'
      },
      'unlisted': {
        icon: 'link', 
        message: 'This unlisted recipe is only accessible via this share link.'
      }
    }[privacy];
    
    const content = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Share Recipe</h3>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="privacy-info">
            ${LucideIcons.createInline(privacyInfo.icon, privacyInfo.message, 16)}
          </div>
          <div class="share-url-container">
            <button class="generate-new-btn icon-button">
              ${LucideIcons.create('refresh-cw', '', 16)}
            </button>
            <input type="text" class="share-url-input" value="${shareResult.url}" readonly>
            <button class="btn btn--primary">
              ${LucideIcons.createInline('copy', 'Copy', 16)}
            </button>
          </div>
          <div class="share-help">
            <strong>Tip:</strong> To stop all sharing, change the recipe privacy to "Private" instead.
          </div>
        </div>
      </div>
    `;
    
    const modal = modalManager.showModal('share', content);
    
    performanceMonitor.endTiming('modalOpenTime', startTime);
    
    // Render Lucide icons
    LucideIcons.render(modal);
    
    // Batch event listener setup
    domBatcher.schedule(() => {
      // Handle copy button
      const copyBtn = modal.querySelector('.btn.btn--primary');
      const input = modal.querySelector('.share-url-input');
      
      copyBtn.addEventListener('click', () => {
      input.select();
      navigator.clipboard.writeText(input.value); // Always copy current input value
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
        copyBtn.classList.remove('copied');
      }, 2000);
    });
    
      // Handle generate new link
      modal.querySelector('.generate-new-btn').addEventListener('click', () => {
        this.debouncedGenerateNewLink(recipeId, modal);
      });
      
      // Handle close
      modal.querySelector('.modal-close').addEventListener('click', () => {
        modalManager.closeModal(modal);
      });
      
      // Handle backdrop click (click outside modal content)
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modalManager.closeModal(modal);
        }
      });
    });
  }

  /**
   * Update recipe privacy in memory and refresh the specific recipe card
   */
  updateRecipePrivacyInList(recipeId, newPrivacy) {
    // Update the recipe in memory
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (recipe) {
      recipe.privacy = newPrivacy;
    }
    
    // Find and update just this recipe card
    const card = document.querySelector(`.recipe-card[data-recipe-id="${recipeId}"]`);
    if (card) {
      // Use DOM batcher for smooth update
      domBatcher.schedule(() => {
        // Update the privacy indicator
        const privacyStatus = card.querySelector('.recipe-privacy-status');
        if (privacyStatus) {
          const privacyInfo = {
            'public': { icon: 'globe', label: 'Public', color: getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim() },
            'unlisted': { icon: 'link', label: 'Unlisted', color: getComputedStyle(document.documentElement).getPropertyValue('--warning-color').trim() }, 
            'private': { icon: 'lock', label: 'Private', color: getComputedStyle(document.documentElement).getPropertyValue('--gray-300').trim() }
          }[newPrivacy];
          
          privacyStatus.innerHTML = `${LucideIcons.createInline(privacyInfo.icon, privacyInfo.label, 16)}`;
          privacyStatus.className = `recipe-privacy-status privacy-status-${newPrivacy.toLowerCase()}`;
          
          // Render Lucide icons
          LucideIcons.render(privacyStatus);
        }
        
        // Update the share button visibility for private recipes
        const shareBtn = card.querySelector('.share-btn');
        if (shareBtn) {
          if (newPrivacy === 'private') {
            shareBtn.classList.remove('u-flex');
            shareBtn.classList.add('u-hidden');
          } else {
            shareBtn.classList.remove('u-hidden');
            shareBtn.classList.add('u-flex');
          }
        } else if (newPrivacy !== 'private') {
          // If share button doesn't exist and privacy is not private, add it
          const actionsContainer = card.querySelector('.recipe-actions');
          const deleteBtn = actionsContainer.querySelector('.delete-btn');
          if (actionsContainer && deleteBtn) {
            const newShareBtn = document.createElement('button');
            newShareBtn.className = 'btn btn--share-card share-btn';
            newShareBtn.setAttribute('data-recipe-id', card.dataset.recipeId);
            newShareBtn.innerHTML = LucideIcons.create('send', '', 18);
            newShareBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.debouncedShareRecipe(card.dataset.recipeId);
            });
            actionsContainer.insertBefore(newShareBtn, deleteBtn);
            
            // Render Lucide icons for the new button
            LucideIcons.render(newShareBtn);
          }
        }
      });
    }
  }

  /**
   * Generate a new share link with confirmation
   */
  async generateNewShareLink(recipeId, modal) {
    if (confirm('Generate a new share link? This will revoke the current link and anyone with the old link will lose access.')) {
      try {
        this.showToast('Generating new link...', 'info');
        
        if (!recipeId) {
          this.showToast('Recipe ID not available. Please close and reopen the share dialog.', 'error');
          return;
        }
        
        // Force creation of new token
        const newShareResult = await storageManager.createShareToken(recipeId, { forceNew: true });
        
        // Update the modal with new link
        const input = modal.querySelector('.share-url-input');
        input.value = newShareResult.url;
        
        this.showToast('New share link generated!', 'success');
        
      } catch (error) {
        this.showToast('Failed to generate new link', 'error');
        console.error('Generate new link error:', error);
      }
    }
  }

  /**
   * Duplicate a recipe (placeholder for future implementation)
   */
  duplicateRecipe(recipeId) {
    // TODO: Implement recipe duplication
    this.showToast('Recipe duplication coming soon!', 'info');
  }

  /**
   * Delete a recipe
   */
  async deleteRecipe(recipeId) {
    if (!confirm('Are you sure you want to delete this recipe? This action cannot be undone.')) {
      return;
    }

    try {
      await storageManager.deleteRecipe(recipeId);
      this.showToast('Recipe deleted successfully', 'success');
      
      // Reload the recipes list
      await this.loadRecipes();
    } catch (error) {
      this.showToast('Failed to delete recipe', 'error');
      errorHandler.handleError(error, {
        component: 'MyRecipesPage',
        method: 'deleteRecipe',
        recipeId
      });
    }
  }

  /**
   * Show a toast notification
   */
  showToast(message, type = 'info') {
    // Remove any existing toast
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
      this.removeToast(existingToast);
    }

    // Create toast with unified classes
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.className = 'toast-close';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.onclick = () => this.removeToast(toast);
    toast.appendChild(closeButton);

    // Add to DOM
    document.body.appendChild(toast);
    
    // Auto-dismiss after 5 seconds
    const autoRemoveTimer = setTimeout(() => this.removeToast(toast), 5000);
    
    // Store timer reference to cancel if manually closed
    toast.dataset.timer = autoRemoveTimer;
    
    // Force browser to recognize the element before animating
    // This ensures the transition works properly
    void toast.offsetHeight;

    // Animate in
    requestAnimationFrame(() => {
      toast.classList.add('toast--visible');
    });
  }
  
  /**
   * Remove toast with animation
   */
  removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    
    // Clear auto-remove timer if exists
    if (toast.dataset.timer) {
      clearTimeout(toast.dataset.timer);
    }
    
    // Animate out
    toast.classList.add('toast--hidden');
    toast.classList.remove('toast--visible');
    
    // Remove from DOM after animation
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  /**
   * Load recipe images on-demand from Firebase
   */
  async loadRecipeImages() {
    const cards = document.querySelectorAll('.recipe-card[data-needs-image="true"]');
    
    // Load images with slight delay to avoid overwhelming Firebase
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const recipeId = card.dataset.recipeId;
      
      // Small delay between requests to be Firebase-friendly
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      try {
        // Try to get image from storage manager (includes Firebase lookup)
        const imageData = await storageManager.getRecipeImageFromFirebase(recipeId);
        
        if (imageData) {
          // Apply background image
          card.style.setProperty('--recipe-bg-image', `url('${imageData}')`);
          card.classList.add('has-background-image');
          // Mark as loaded to avoid reloading
          card.removeAttribute('data-needs-image');
        } else {
          // Check localStorage for temporary/legacy images
          const localImageData = storageManager.getRecipeImage(recipeId);
          if (localImageData) {
            card.style.setProperty('--recipe-bg-image', `url('${localImageData}')`);
            card.classList.add('has-background-image');
            card.removeAttribute('data-needs-image');
          }
        }
      } catch (error) {
        console.warn('Failed to load image for recipe:', recipeId, error);
        // Continue with other images even if one fails
      }
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

// Export singleton instance
export const myRecipesPage = new MyRecipesPage();