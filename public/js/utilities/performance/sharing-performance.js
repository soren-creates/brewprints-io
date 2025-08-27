/**
 * Performance Optimizations for Privacy & Sharing System
 * Includes caching, debouncing, and efficient DOM updates
 */

/**
 * Cache for share token lookups to reduce Firebase queries
 */
class ShareTokenCache {
    constructor(ttl = 300000) { // 5 minute TTL
        this.cache = new Map();
        this.ttl = ttl;
    }

    /**
     * Get cached token for recipe
     */
    get(recipeId) {
        const entry = this.cache.get(recipeId);
        if (entry && Date.now() - entry.timestamp < this.ttl) {
            return entry.data;
        }
        this.cache.delete(recipeId);
        return null;
    }

    /**
     * Cache token for recipe
     */
    set(recipeId, tokenData) {
        this.cache.set(recipeId, {
            data: tokenData,
            timestamp: Date.now()
        });
    }

    /**
     * Clear cache entry
     */
    clear(recipeId) {
        this.cache.delete(recipeId);
    }

    /**
     * Clear all cache entries
     */
    clearAll() {
        this.cache.clear();
    }
}

/**
 * Debounce utility for preventing rapid-fire operations
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Batch DOM updates to improve performance
 */
class DOMBatcher {
    constructor() {
        this.updates = [];
        this.scheduled = false;
    }

    /**
     * Schedule a DOM update
     */
    schedule(updateFn) {
        this.updates.push(updateFn);
        if (!this.scheduled) {
            this.scheduled = true;
            requestAnimationFrame(() => {
                this.flush();
            });
        }
    }

    /**
     * Execute all batched updates
     */
    flush() {
        const updates = this.updates.splice(0);
        this.scheduled = false;
        
        updates.forEach(updateFn => {
            try {
                updateFn();
            } catch (error) {
                console.error('DOM update error:', error);
            }
        });
    }
}

/**
 * Performance-optimized modal manager
 */
class OptimizedModalManager {
    constructor() {
        this.activeModals = new Set();
        this.modalPool = new Map(); // Reuse modal elements
    }

    /**
     * Create or reuse modal element
     */
    getModal(type) {
        if (this.modalPool.has(type)) {
            return this.modalPool.get(type);
        }

        const modal = document.createElement('div');
        // Use standardized modal classes for proper positioning
        if (type === 'backdrop') {
            modal.className = 'modal-backdrop';
        } else {
            modal.className = `modal-base modal-standard ${type}-modal`;
        }
        this.modalPool.set(type, modal);
        return modal;
    }

    /**
     * Show modal with performance optimizations
     */
    showModal(type, content, options = {}) {
        const modal = this.getModal(type);
        modal.innerHTML = content;
        
        // Add modal to DOM immediately to ensure it's available for tests and interactions
        document.body.appendChild(modal);
        this.activeModals.add(modal);
        
        // Show the modal using standardized visibility classes
        requestAnimationFrame(() => {
            modal.classList.add('modal-visible');
            modal.classList.remove('modal-hidden');
        });
        
        // Add backdrop click handler directly to the modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });
        
        return modal;
    }

    /**
     * Close modal efficiently
     */
    closeModal(modal) {
        if (this.activeModals.has(modal)) {
            // Hide modal with animation
            modal.classList.add('modal-hidden');
            modal.classList.remove('modal-visible');
            
            // Remove modal from DOM after animation
            setTimeout(() => {
                if (modal.parentNode) {
                    modal.remove();
                }
                this.activeModals.delete(modal);
            }, 300);
        }
    }

    /**
     * Close all modals
     */
    closeAll() {
        this.activeModals.forEach(modal => {
            modal.remove();
        });
        this.activeModals.clear();
    }
}

/**
 * Optimized clipboard operations
 */
class ClipboardManager {
    constructor() {
        this.lastCopy = null;
        this.copyTimeout = null;
    }

    /**
     * Copy text with feedback and deduplication
     */
    async copy(text, button) {
        // Avoid duplicate copies
        if (this.lastCopy === text && Date.now() - this.lastCopyTime < 1000) {
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            this.lastCopy = text;
            this.lastCopyTime = Date.now();
            
            this.showCopyFeedback(button);
        } catch (error) {
            console.error('Copy failed:', error);
            // Fallback for older browsers
            this.fallbackCopy(text, button);
        }
    }

    /**
     * Show copy feedback with automatic cleanup
     */
    showCopyFeedback(button) {
        if (!button) return;

        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.classList.add('copied');

        if (this.copyTimeout) {
            clearTimeout(this.copyTimeout);
        }

        this.copyTimeout = setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }

    /**
     * Fallback copy method for older browsers
     */
    fallbackCopy(text, button) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
            this.showCopyFeedback(button);
        } catch (error) {
            console.error('Fallback copy failed:', error);
        } finally {
            document.body.removeChild(textArea);
        }
    }
}

/**
 * Performance monitoring for sharing operations
 */
class SharingPerformanceMonitor {
    constructor() {
        this.metrics = {
            modalOpenTime: [],
            copyTime: [],
            shareTokenGeneration: [],
            privacyChange: []
        };
    }

    /**
     * Start timing an operation
     */
    startTiming(operation) {
        return performance.now();
    }

    /**
     * End timing and record metric
     */
    endTiming(operation, startTime) {
        const duration = performance.now() - startTime;
        if (this.metrics[operation]) {
            this.metrics[operation].push(duration);
            
            // Keep only last 100 measurements
            if (this.metrics[operation].length > 100) {
                this.metrics[operation].shift();
            }
        }
        return duration;
    }

    /**
     * Get performance statistics
     */
    getStats(operation) {
        const times = this.metrics[operation];
        if (!times || times.length === 0) {
            return null;
        }

        const sorted = [...times].sort((a, b) => a - b);
        return {
            count: times.length,
            avg: times.reduce((a, b) => a + b) / times.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)]
        };
    }

    /**
     * Log performance report
     */
    logReport() {
        console.group('🚀 Sharing Performance Report');
        Object.keys(this.metrics).forEach(operation => {
            const stats = this.getStats(operation);
            if (stats) {
                console.log(`${operation}:`, {
                    'Avg': `${stats.avg.toFixed(1)}ms`,
                    'P95': `${stats.p95.toFixed(1)}ms`,
                    'Count': stats.count
                });
            }
        });
        console.groupEnd();
    }
}

// Global instances
export const shareTokenCache = new ShareTokenCache();
export const domBatcher = new DOMBatcher();
export const modalManager = new OptimizedModalManager();
export const clipboardManager = new ClipboardManager();
export const performanceMonitor = new SharingPerformanceMonitor();

// Utility exports
export { debounce };

/**
 * Initialize performance optimizations
 */
export function initSharingPerformance() {
    // Clear caches on page unload
    window.addEventListener('beforeunload', () => {
        shareTokenCache.clearAll();
        modalManager.closeAll();
    });

    // Log performance report every 5 minutes in debug mode
    if (localStorage.getItem('debugMode') === 'true') {
        setInterval(() => {
            performanceMonitor.logReport();
        }, 300000);
    }

    // Preload critical resources
    preloadCriticalResources();
}

/**
 * Preload resources that might be needed for sharing
 */
function preloadCriticalResources() {
    // Performance optimization styles for modal transforms
    const style = document.createElement('style');
    style.textContent = `
        .modal-base { 
            transform: translateZ(0); 
            will-change: transform, opacity; 
        }
        .copied { transition: all 0.2s ease; }
    `;
    document.head.appendChild(style);
}

/**
 * Optimized event listeners for sharing components
 */
export function addOptimizedEventListeners(container) {
    // Use event delegation for better performance
    container.addEventListener('click', (e) => {
        const target = e.target;
        
        // Share button handling  
        if (target.classList.contains('btn') && target.classList.contains('btn--success') && 
            target.classList.contains('share-btn')) {
            e.stopPropagation();
            const recipeId = target.closest('.recipe-card')?.dataset.recipeId;
            if (recipeId) {
                handleOptimizedShare(recipeId);
            }
        }
        
        // Copy button handling
        if (target.classList.contains('btn') && target.classList.contains('btn--primary') && 
            target.parentElement?.querySelector('.share-url-input')) {
            e.stopPropagation();
            const input = target.parentElement?.querySelector('.share-url-input');
            if (input) {
                clipboardManager.copy(input.value, target);
            }
        }
    });
}

/**
 * Optimized share handling with caching
 */
async function handleOptimizedShare(recipeId) {
    const startTime = performanceMonitor.startTiming('modalOpenTime');
    
    try {
        // Check cache first
        let shareResult = shareTokenCache.get(recipeId);
        
        if (!shareResult) {
            // Generate new token and cache it
            shareResult = await storageManager.createShareToken(recipeId);
            shareTokenCache.set(recipeId, shareResult);
        }
        
        // Show modal efficiently
        modalManager.showModal('share', generateShareModalContent(shareResult), {
            backdrop: 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 14999;'
        });
        
        performanceMonitor.endTiming('modalOpenTime', startTime);
        
    } catch (error) {
        console.error('Optimized share failed:', error);
        performanceMonitor.endTiming('modalOpenTime', startTime);
    }
}

/**
 * Generate modal content efficiently
 */
function generateShareModalContent(shareResult) {
    // Use template literals for better performance than DOM manipulation
    return `
        <h3>Share Recipe</h3>
        <div class="share-status ${shareResult.isExisting ? 'existing' : 'new'}">
            ${shareResult.isExisting ? '♻️ Existing Link' : '✨ New Link'}
        </div>
        <div class="share-url-container">
            <input type="text" class="share-url-input" value="${shareResult.url}" readonly>
            <button class="btn btn--primary">Copy</button>
        </div>
        <div class="share-actions">
            <button class="generate-new-btn">🔄 Generate New Link</button>
            <button class="close-modal-btn">Close</button>
        </div>
    `;
}