/**
 * Header Manager
 * Manages the unified fixed header with navigation buttons
 */

import { EVENTS } from '../../core/constants.js';
import { clerkAuth } from '../../auth/clerk-config.js';
import { errorHandler } from '../../utilities/errors/error-handler.js';
import { LucideIcons } from './lucide-icons.js';

class HeaderManager {
  constructor() {
    this.currentPage = 'upload'; // 'upload', 'data-preview', or 'recipe-view'
    this.header = null;
    this.buttons = {};
    this.dropdownOpen = false;
  }

  init() {
    this.createHeader();
    this.createFloatingCloseButtons();
    this.attachEventListeners();
    this.updateButtonVisibility();
  }

  createHeader() {
    // Check if header already exists
    this.header = document.getElementById('app-header');
    if (this.header) return;

    // Create the header element
    this.header = document.createElement('header');
    this.header.id = 'app-header';
    this.header.className = 'app-header no-print';
    
    // Create header content
    this.header.innerHTML = `
      <div class="header-left">
        <img src="/img/Header_TextOnly_420x76.png" alt="Brewprints.io" class="header-logo">
      </div>
      <div class="header-right">
        <button id="saveRecipeBtn" class="btn btn--success icon-button u-hidden">
          ${LucideIcons.createInline('save', 'Save', 18)}
        </button>
        <button id="printRecipeBtn" class="btn btn--primary icon-button u-hidden">
          ${LucideIcons.createInline('printer', 'Print', 18)}
        </button>
        <button id="backToDataBtn" class="btn btn--primary btn--fixed icon-button u-hidden">
          ${LucideIcons.createInline('braces', 'Data Fields', 18)}
        </button>
        <button id="continueToRecipeBtn" class="btn btn--primary btn--fixed icon-button u-hidden">
          ${LucideIcons.createInline('notebook-text', 'Recipe View', 18)}
        </button>
        
        <!-- User Dropdown Menu -->
        <div id="userDropdown" class="user-dropdown">
          <button id="userDropdownBtn" class="user-dropdown-btn">
            <span id="userAvatar" class="user-avatar">👤</span>
          </button>
          <div id="userDropdownMenu" class="user-dropdown-menu u-hidden">
            <button id="signInMenuItem" class="dropdown-menu-item icon-button u-hidden">
              ${LucideIcons.createInline('log-in', 'Sign In', 18)}
            </button>
            <button id="accountSettingsMenuItem" class="dropdown-menu-item icon-button u-hidden">
              ${LucideIcons.createInline('settings', 'Account Settings', 18)}
            </button>
            <button id="signOutMenuItem" class="dropdown-menu-item icon-button u-hidden">
              ${LucideIcons.createInline('log-out', 'Sign Out', 18)}
            </button>
          </div>
        </div>
      </div>
    `;

    // Insert at the beginning of body
    document.body.insertBefore(this.header, document.body.firstChild);
    
    // Render Lucide icons
    LucideIcons.render(this.header);

    // Store button references
    this.buttons = {
      backToData: document.getElementById('backToDataBtn'),
      saveRecipe: document.getElementById('saveRecipeBtn'),
      printRecipe: document.getElementById('printRecipeBtn'),
      continueToRecipe: document.getElementById('continueToRecipeBtn')
    };

    // Store dropdown references
    this.dropdown = {
      button: document.getElementById('userDropdownBtn'),
      menu: document.getElementById('userDropdownMenu'),
      avatar: document.getElementById('userAvatar'),
      signIn: document.getElementById('signInMenuItem'),
      accountSettings: document.getElementById('accountSettingsMenuItem'),
      signOut: document.getElementById('signOutMenuItem')
    };
  }

  createFloatingCloseButtons() {
    // Create close button for recipe view only
    const closeRecipeBtn = document.createElement('button');
    closeRecipeBtn.id = 'closeRecipeBtn';
    closeRecipeBtn.className = 'btn btn--floating btn--close no-print';
    closeRecipeBtn.innerHTML = LucideIcons.create('x', '', 24);
    closeRecipeBtn.classList.add('u-hidden');
    document.body.appendChild(closeRecipeBtn);
    
    // Render Lucide icons
    LucideIcons.render(closeRecipeBtn);
    
    // Store reference
    this.buttons.closeRecipe = closeRecipeBtn;
  }

  attachEventListeners() {
    // Close Recipe button
    if (this.buttons.closeRecipe) {
      this.buttons.closeRecipe.addEventListener('click', () => {
        const isSignedIn = clerkAuth.isUserSignedIn();
        if (isSignedIn) {
          // If signed in, go to My Recipes
          window.dispatchEvent(new Event(EVENTS.SHOW_MY_RECIPES));
        } else {
          // If not signed in, go to upload page
          window.dispatchEvent(new Event(EVENTS.BACK_TO_UPLOAD));
        }
      });
    }

    // Continue to Recipe View button
    if (this.buttons.continueToRecipe) {
      this.buttons.continueToRecipe.addEventListener('click', () => {
        window.dispatchEvent(new Event(EVENTS.CONTINUE_TO_RECIPE));
      });
    }


    // Back to Recipe Data button
    if (this.buttons.backToData) {
      this.buttons.backToData.addEventListener('click', () => {
        window.dispatchEvent(new Event(EVENTS.BACK_TO_DATA_PREVIEW));
      });
    }

    // Print Recipe button
    if (this.buttons.printRecipe) {
      this.buttons.printRecipe.addEventListener('click', () => {
        window.print();
      });
    }


    // Save Recipe button
    if (this.buttons.saveRecipe) {
      this.buttons.saveRecipe.addEventListener('click', (e) => {
        // Only save if button is not disabled
        if (!this.buttons.saveRecipe.disabled) {
          window.dispatchEvent(new Event(EVENTS.SAVE_RECIPE));
        } else {
          e.preventDefault();
        }
      });
    }

    // Listen for recipe changes to update save button state
    window.addEventListener('recipeChanged', (e) => {
      this.updateSaveButtonState(e.detail.hasChanges);
    });

    // Listen for recipe saved events to update save button state
    window.addEventListener(EVENTS.RECIPE_SAVED, (e) => {
      // After saving, the recipe is no longer "new" - update current recipe with saved info
      if (this.navigationManager?.currentRecipe) {
        this.navigationManager.currentRecipe.savedAt = new Date().toISOString();
        this.navigationManager.currentRecipe.id = e.detail.recipeId;
      }
      // Reset save button to disabled state (no changes after save)
      this.updateSaveButtonState(false);
    });

    // Listen for page change events
    window.addEventListener(EVENTS.PAGE_CHANGED, (e) => {
      this.setCurrentPage(e.detail.page);
    });
    
    // Also listen for the existing navigation events to update page state
    window.addEventListener(EVENTS.CONTINUE_TO_RECIPE, () => {
      this.setCurrentPage('recipe-view');
    });
    
    window.addEventListener(EVENTS.BACK_TO_UPLOAD, () => {
      this.setCurrentPage('upload');
    });
    
    window.addEventListener(EVENTS.BACK_TO_DATA_PREVIEW, () => {
      this.setCurrentPage('data-preview');
    });
    
    window.addEventListener(EVENTS.SHOW_MY_RECIPES, () => {
      this.setCurrentPage('my-recipes');
    });

    // User dropdown toggle
    if (this.dropdown.button) {
      this.dropdown.button.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });
    }

    // Dropdown menu items
    if (this.dropdown.signIn) {
      this.dropdown.signIn.addEventListener('click', async () => {
        try {
          this.closeDropdown();
          await clerkAuth.signIn();
        } catch (error) {
          errorHandler.handleError(error, {
            component: 'HeaderManager',
            method: 'signIn'
          });
        }
      });
    }

    if (this.dropdown.accountSettings) {
      this.dropdown.accountSettings.addEventListener('click', async () => {
        try {
          this.closeDropdown();
          await clerkAuth.openUserProfile();
        } catch (error) {
          errorHandler.handleError(error, {
            component: 'HeaderManager',
            method: 'openUserProfile'
          });
        }
      });
    }

    if (this.dropdown.signOut) {
      this.dropdown.signOut.addEventListener('click', async () => {
        try {
          this.closeDropdown();
          await clerkAuth.signOut();
        } catch (error) {
          errorHandler.handleError(error, {
            component: 'HeaderManager',
            method: 'signOut'
          });
        }
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      this.closeDropdown();
    });

    // Initialize authentication
    this.initAuth();
  }

  /**
   * Initialize authentication and set up auth state listeners
   */
  async initAuth() {
    try {
      await clerkAuth.init();
      this.updateAuthUI();
      
      // Listen for auth state changes
      if (window.Clerk) {
        window.Clerk.addListener(() => {
          this.updateAuthUI();
        });
      }
    } catch (error) {
      errorHandler.handleError(error, {
        component: 'HeaderManager',
        method: 'initAuth',
        fallback: 'anonymous'
      });
    }
  }

  /**
   * Update authentication UI based on current state
   */
  updateAuthUI() {
    const isSignedIn = clerkAuth.isUserSignedIn();
    const user = clerkAuth.getCurrentUser();

    if (isSignedIn && user) {
      // User is signed in - show account settings and sign out
      this.dropdown.signIn.classList.remove('u-block');
      this.dropdown.signIn.classList.add('u-hidden');
      this.dropdown.accountSettings.classList.remove('u-hidden');
      this.dropdown.accountSettings.classList.add('u-block');
      this.dropdown.signOut.classList.remove('u-hidden');
      this.dropdown.signOut.classList.add('u-block');
      
      // Update avatar with user image if available
      if (user.imageUrl) {
        this.dropdown.avatar.innerHTML = `<img src="${user.imageUrl}" alt="User avatar">`;
      } else {
        this.dropdown.avatar.textContent = '👤';
      }
    } else {
      // User is not signed in - show sign in only
      this.dropdown.signIn.classList.remove('u-hidden');
      this.dropdown.signIn.classList.add('u-block');
      this.dropdown.accountSettings.classList.remove('u-block');
      this.dropdown.accountSettings.classList.add('u-hidden');
      this.dropdown.signOut.classList.remove('u-block');
      this.dropdown.signOut.classList.add('u-hidden');
      this.dropdown.avatar.textContent = '👤';
    }

    // Update button visibility based on auth state
    this.updateButtonVisibility();
  }

  /**
   * Toggle the dropdown menu
   */
  toggleDropdown() {
    this.dropdownOpen = !this.dropdownOpen;
    if (this.dropdownOpen) {
      this.dropdown.menu.classList.remove('u-hidden');
      this.dropdown.menu.classList.add('u-block');
    } else {
      this.dropdown.menu.classList.remove('u-block');
      this.dropdown.menu.classList.add('u-hidden');
    }
  }

  /**
   * Close the dropdown menu
   */
  closeDropdown() {
    this.dropdownOpen = false;
    this.dropdown.menu.classList.remove('u-block');
    this.dropdown.menu.classList.add('u-hidden');
  }

  setCurrentPage(page) {
    this.currentPage = page;
    this.updateButtonVisibility();
  }

  updateButtonVisibility() {
    const isSignedIn = clerkAuth.isUserSignedIn();

    // Hide all buttons first (including floating close button)
    const allButtons = [
      this.buttons.closeRecipe, this.buttons.backToData, this.buttons.saveRecipe, 
      this.buttons.printRecipe, this.buttons.continueToRecipe
    ];
    allButtons.forEach(btn => {
      if (btn) {
        btn.classList.remove('u-inline-flex', 'u-flex');
        btn.classList.add('u-hidden');
      }
    });

    // Show buttons based on current page
    switch (this.currentPage) {
      case 'upload':
        // No additional buttons on upload page
        break;
        
      case 'data-preview':
        // Show floating close button (X) for easy navigation back
        if (this.buttons.closeRecipe) {
          this.buttons.closeRecipe.classList.remove('u-hidden');
          this.buttons.closeRecipe.classList.add('u-flex');
        }
        // Show Print and Recipe View buttons in header
        if (this.buttons.printRecipe) {
          this.buttons.printRecipe.classList.remove('u-hidden');
          this.buttons.printRecipe.classList.add('u-inline-flex');
        }
        if (this.buttons.continueToRecipe) {
          this.buttons.continueToRecipe.classList.remove('u-hidden');
          this.buttons.continueToRecipe.classList.add('u-inline-flex');
        }
        break;
        
      case 'recipe-view':
        // Show floating close button (X) - always visible, behaves differently based on auth
        if (this.buttons.closeRecipe) {
          this.buttons.closeRecipe.classList.remove('u-hidden');
          this.buttons.closeRecipe.classList.add('u-flex');
        }
        if (this.buttons.saveRecipe && isSignedIn) {
          this.buttons.saveRecipe.classList.remove('u-hidden');
          this.buttons.saveRecipe.classList.add('u-inline-flex');
          // For newly uploaded recipes (no savedAt), enable save button by default
          // For existing saved recipes, disable until changes are made
          const currentRecipe = this.navigationManager?.currentRecipe;
          const isNewRecipe = !currentRecipe?.savedAt;
          this.updateSaveButtonState(isNewRecipe);
        }
        if (this.buttons.printRecipe) {
          this.buttons.printRecipe.classList.remove('u-hidden');
          this.buttons.printRecipe.classList.add('u-inline-flex');
        }
        if (this.buttons.backToData) {
          this.buttons.backToData.classList.remove('u-hidden');
          this.buttons.backToData.classList.add('u-inline-flex');
        }
        break;
        
      case 'my-recipes':
        // No header buttons for My Recipes page (uses floating upload button)
        break;
    }
  }

  /**
   * Update save button state based on recipe changes
   * @param {boolean} hasChanges - Whether the recipe has unsaved changes
   */
  updateSaveButtonState(hasChanges) {
    if (!this.buttons.saveRecipe) return;
    
    // Check if this is a new recipe (not saved before)
    const currentRecipe = this.navigationManager?.currentRecipe;
    const isNewRecipe = !currentRecipe?.savedAt;
    
    if (hasChanges || isNewRecipe) {
      // Enable and brighten the save button
      this.buttons.saveRecipe.disabled = false;
      this.buttons.saveRecipe.classList.remove('u-opacity-50', 'u-cursor-not-allowed');
      this.buttons.saveRecipe.classList.add('u-cursor-pointer');
      this.buttons.saveRecipe.title = isNewRecipe ? 'Save recipe to My Recipes' : 'Save changes to recipe';
    } else {
      // Disable and dim the save button
      this.buttons.saveRecipe.disabled = true;
      this.buttons.saveRecipe.classList.remove('u-cursor-pointer');
      this.buttons.saveRecipe.classList.add('u-opacity-50', 'u-cursor-not-allowed');
      this.buttons.saveRecipe.title = 'No changes to save';
    }
  }

  destroy() {
    if (this.header) {
      this.header.remove();
    }
    // Also remove floating button
    if (this.buttons.closeRecipe) {
      this.buttons.closeRecipe.remove();
    }
  }
}

export { HeaderManager };