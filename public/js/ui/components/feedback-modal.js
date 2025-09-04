/**
 * User Feedback Modal
 * Collects user satisfaction scores, feature requests, and pain points
 */

import { analyticsManager } from '../../analytics/analytics-manager.js';
import { storageManager } from '../../storage/storage-manager.js';
import { errorHandler } from '../../utilities/errors/error-handler.js';

export class FeedbackModal {
    constructor() {
        this.isVisible = false;
        this.modalElement = null;
        this.currentFeedback = {
            satisfaction: null,
            category: 'general',
            message: '',
            userAgent: navigator.userAgent,
            timestamp: null,
            url: window.location.pathname
        };
        
        // Throttle feedback submissions
        this.lastSubmissionTime = 0;
        this.SUBMISSION_COOLDOWN = 30000; // 30 seconds
    }

    /**
     * Create and show the feedback modal
     */
    show() {
        if (this.isVisible) return;

        // Check submission throttling
        const now = Date.now();
        if (now - this.lastSubmissionTime < this.SUBMISSION_COOLDOWN) {
            this.showCooldownMessage();
            return;
        }

        this.createModal();
        this.bindEvents();
        document.body.appendChild(this.modalElement);
        
        // Show modal with animation
        requestAnimationFrame(() => {
            this.modalElement.classList.remove('modal--hidden');
            this.modalElement.classList.add('modal--visible');
        });
        
        this.isVisible = true;
    }

    /**
     * Hide the feedback modal
     */
    hide() {
        if (!this.isVisible || !this.modalElement) return;

        this.modalElement.classList.remove('modal--visible');
        this.modalElement.classList.add('modal--hidden');
        
        setTimeout(() => {
            if (this.modalElement && this.modalElement.parentNode) {
                this.modalElement.parentNode.removeChild(this.modalElement);
            }
            this.modalElement = null;
            this.isVisible = false;
        }, 300); // Match CSS transition duration
    }

    /**
     * Create the modal HTML structure
     */
    createModal() {
        this.modalElement = document.createElement('div');
        this.modalElement.className = 'modal-base modal-standard modal--hidden';
        this.modalElement.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">Share Your Feedback</h3>
                    <button class="modal-close" aria-label="Close feedback modal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="feedback-form">
                        <!-- Satisfaction Rating -->
                        <div class="feedback-section">
                            <label class="feedback-label">How satisfied are you with Brewprints?</label>
                            <div class="rating-container">
                                <div class="rating-stars">
                                    ${this.createStarRating()}
                                </div>
                                <div class="rating-labels">
                                    <span class="rating-label-left">Not satisfied</span>
                                    <span class="rating-label-right">Very satisfied</span>
                                </div>
                            </div>
                        </div>

                        <!-- Feedback Category -->
                        <div class="feedback-section">
                            <label for="feedback-category" class="feedback-label">What's this about?</label>
                            <select id="feedback-category" class="feedback-select">
                                <option value="general">General feedback</option>
                                <option value="feature_request">Feature request</option>
                                <option value="bug_report">Bug report</option>
                                <option value="calculation_accuracy">Calculation accuracy</option>
                                <option value="recipe_import">Recipe import issues</option>
                                <option value="ui_ux">User interface/experience</option>
                                <option value="performance">Performance issues</option>
                                <option value="mobile">Mobile experience</option>
                                <option value="print_quality">Print quality</option>
                            </select>
                        </div>

                        <!-- Feedback Message -->
                        <div class="feedback-section">
                            <label for="feedback-message" class="feedback-label">Tell us more (optional)</label>
                            <textarea 
                                id="feedback-message" 
                                class="feedback-textarea"
                                placeholder="What would you like us to know? Feature suggestions, bugs, or general thoughts are all welcome."
                                maxlength="1000"
                                rows="4"
                            ></textarea>
                            <div class="character-count">
                                <span id="char-count">0</span>/1000
                            </div>
                        </div>

                        <!-- Contact Information (Optional) -->
                        <div class="feedback-section">
                            <label for="feedback-email" class="feedback-label">Email (optional - for follow-up)</label>
                            <input 
                                type="email" 
                                id="feedback-email" 
                                class="feedback-input"
                                placeholder="your@email.com"
                            >
                            <small class="feedback-help">We'll only use this to follow up on your feedback</small>
                        </div>

                        <!-- Submit Button -->
                        <div class="feedback-actions">
                            <button type="button" class="btn btn--secondary" id="feedback-cancel">
                                Cancel
                            </button>
                            <button type="submit" class="btn btn--primary" id="feedback-submit">
                                Send Feedback
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    /**
     * Create star rating HTML
     */
    createStarRating() {
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            starsHTML += `
                <button type="button" class="star-rating" data-rating="${i}" aria-label="${i} star${i > 1 ? 's' : ''}">
                    ⭐
                </button>
            `;
        }
        return starsHTML;
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        if (!this.modalElement) return;

        // Close modal events
        const closeButton = this.modalElement.querySelector('.modal-close');
        const cancelButton = this.modalElement.querySelector('#feedback-cancel');
        
        closeButton?.addEventListener('click', () => this.hide());
        cancelButton?.addEventListener('click', () => this.hide());

        // Click outside to close
        this.modalElement.addEventListener('click', (e) => {
            if (e.target === this.modalElement) {
                this.hide();
            }
        });

        // Escape key to close
        document.addEventListener('keydown', this.handleKeyDown.bind(this));

        // Star rating
        const stars = this.modalElement.querySelectorAll('.star-rating');
        stars.forEach(star => {
            star.addEventListener('click', (e) => {
                const rating = parseInt(e.target.dataset.rating);
                this.setRating(rating);
            });
            
            star.addEventListener('mouseover', (e) => {
                const rating = parseInt(e.target.dataset.rating);
                this.highlightStars(rating);
            });
        });

        // Reset star highlighting on mouse leave
        const ratingContainer = this.modalElement.querySelector('.rating-stars');
        ratingContainer?.addEventListener('mouseleave', () => {
            this.highlightStars(this.currentFeedback.satisfaction || 0);
        });

        // Category selection
        const categorySelect = this.modalElement.querySelector('#feedback-category');
        categorySelect?.addEventListener('change', (e) => {
            this.currentFeedback.category = e.target.value;
        });

        // Message input
        const messageTextarea = this.modalElement.querySelector('#feedback-message');
        const charCount = this.modalElement.querySelector('#char-count');
        
        messageTextarea?.addEventListener('input', (e) => {
            this.currentFeedback.message = e.target.value;
            if (charCount) {
                charCount.textContent = e.target.value.length;
            }
        });

        // Form submission
        const form = this.modalElement.querySelector('#feedback-form');
        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitFeedback();
        });
    }

    /**
     * Handle keyboard events
     */
    handleKeyDown(e) {
        if (e.key === 'Escape' && this.isVisible) {
            this.hide();
        }
    }

    /**
     * Set star rating
     */
    setRating(rating) {
        this.currentFeedback.satisfaction = rating;
        this.highlightStars(rating);
        
        // Add selected class for persistence
        const stars = this.modalElement.querySelectorAll('.star-rating');
        stars.forEach((star, index) => {
            if (index < rating) {
                star.classList.add('star-selected');
            } else {
                star.classList.remove('star-selected');
            }
        });
    }

    /**
     * Highlight stars up to rating
     */
    highlightStars(rating) {
        const stars = this.modalElement.querySelectorAll('.star-rating');
        stars.forEach((star, index) => {
            if (index < rating) {
                star.classList.add('star-hover');
            } else {
                star.classList.remove('star-hover');
            }
        });
    }

    /**
     * Submit feedback
     */
    async submitFeedback() {
        const submitButton = this.modalElement.querySelector('#feedback-submit');
        const emailInput = this.modalElement.querySelector('#feedback-email');
        
        // Validate required fields
        if (!this.currentFeedback.satisfaction) {
            this.showValidationError('Please select a satisfaction rating');
            return;
        }

        // Disable submit button during submission
        submitButton.disabled = true;
        submitButton.textContent = 'Sending...';

        try {
            // Prepare feedback data
            const feedbackData = {
                ...this.currentFeedback,
                email: emailInput?.value || null,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href
            };

            // Store feedback locally as backup
            await this.storeFeedbackLocally(feedbackData);

            // Try to send to Firebase, but don't fail if it doesn't work
            const serverSaveSuccess = await this.sendFeedbackToServer(feedbackData);

            // Track analytics
            analyticsManager.trackFeedbackSubmitted(
                this.currentFeedback.satisfaction,
                this.currentFeedback.category
            );

            // Show success message even if only saved locally
            this.showSuccessMessage(serverSaveSuccess);

            // Update throttling
            this.lastSubmissionTime = Date.now();

            // Hide modal after delay
            setTimeout(() => {
                this.hide();
            }, 4000);

        } catch (error) {
            console.error('Feedback submission error:', error);
            this.showErrorMessage('Failed to send feedback. Please try again.');
            
            // Re-enable submit button
            submitButton.disabled = false;
            submitButton.textContent = 'Send Feedback';
        }
    }

    /**
     * Store feedback locally as backup
     */
    async storeFeedbackLocally(feedbackData) {
        try {
            const localFeedback = JSON.parse(localStorage.getItem('user_feedback') || '[]');
            localFeedback.push(feedbackData);
            
            // Keep only last 10 feedback items
            if (localFeedback.length > 10) {
                localFeedback.shift();
            }
            
            localStorage.setItem('user_feedback', JSON.stringify(localFeedback));
        } catch (error) {
            // Ignore localStorage errors
            console.warn('Could not store feedback locally:', error);
        }
    }

    /**
     * Send feedback to server
     */
    async sendFeedbackToServer(feedbackData) {
        // Try to send via Firebase first
        try {
            return await storageManager.saveFeedback(feedbackData);
        } catch (error) {
            // Fallback: Log for manual collection
            console.log('User Feedback:', feedbackData);
            
            // Could also send to a simple webhook or email service
            // For now, local storage backup is sufficient
            return false;
        }
    }

    /**
     * Show validation error
     */
    showValidationError(message) {
        // Create or update error message
        let errorEl = this.modalElement.querySelector('.feedback-error');
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'feedback-error';
            const formEl = this.modalElement.querySelector('#feedback-form');
            formEl.insertBefore(errorEl, formEl.firstChild);
        }
        
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        
        // Hide error after 5 seconds
        setTimeout(() => {
            if (errorEl) errorEl.style.display = 'none';
        }, 5000);
    }

    /**
     * Show success message
     * @param {boolean} serverSaved - Whether feedback was saved to server
     */
    showSuccessMessage(serverSaved = true) {
        const modalBody = this.modalElement.querySelector('.modal-body');
        const message = serverSaved 
            ? 'We appreciate you taking the time to help improve Brewprints.'
            : 'Your feedback has been saved locally. We\'ll submit it when connection is restored.';
            
        modalBody.innerHTML = `
            <div class="feedback-success">
                <div class="success-icon">✅</div>
                <h3>Thank you for your feedback!</h3>
                <p>${message}</p>
            </div>
        `;
    }

    /**
     * Show error message
     */
    showErrorMessage(message) {
        this.showValidationError(message);
    }

    /**
     * Show cooldown message
     */
    showCooldownMessage() {
        // Simple alert for now - could be enhanced with a toast
        alert('Please wait a moment before submitting more feedback. Thank you!');
    }

    /**
     * Cleanup event listeners
     */
    destroy() {
        document.removeEventListener('keydown', this.handleKeyDown.bind(this));
        if (this.modalElement) {
            this.hide();
        }
    }
}

// Export singleton instance
export const feedbackModal = new FeedbackModal();