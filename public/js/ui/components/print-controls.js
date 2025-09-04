/**
 * Print Controls
 * Handles print preparation and cleanup
 */

import { errorHandler } from '../../utilities/errors/error-handler.js';
import { DataLoadError } from '../../utilities/errors/application-errors.js';
import { analyticsManager } from '../../analytics/analytics-manager.js';

class PrintControls {
  constructor() {
    this.isPrintInProgress = false;
    this.printHandler = this.handlePrint.bind(this);
    this.settings = {
      pageSize: 'letter'
    };
  }

  init() {
    this.setupPrintEventListeners();
    this.setupPrintStyles();
  }

  setupPrintEventListeners() {
    // Listen for beforeprint and afterprint events
    window.addEventListener('beforeprint', () => {
      this.isPrintInProgress = true;
      this.preparePrintLayout();
      // Track print action
      analyticsManager.trackRecipePrinted();
    });

    window.addEventListener('afterprint', () => {
      this.isPrintInProgress = false;
      this.cleanupPrintLayout();
    });

    // Also handle Ctrl+P / Cmd+P
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        this.handlePrint();
      }
    });
  }

  handlePrint() {
    // Prevent multiple print dialogs from opening
    if (this.isPrintInProgress) {
      return;
    }
    
    // The print preparation and cleanup will be handled by 
    // beforeprint and afterprint event listeners
    window.print();
  }

  preparePrintLayout() {
    try {
      // Add print class to body
      document.body.classList.add('printing');
      
      // Hide non-printable elements
      const hideInPrint = document.querySelectorAll('.no-print, .section-controls, .app-header');
      hideInPrint.forEach(element => {
        if (element) { // Safety check
          element.classList.add('print-hidden');
        }
      });

      // Apply page break settings
      this.applyPageBreaks();
    } catch (error) {
      errorHandler.handleError(new DataLoadError('Print layout preparation failed', {
        userMessage: 'Unable to prepare the page for printing. Some elements may not display correctly when printed.',
        severity: 'warning',
        recoverable: true,
        details: { component: 'print-controls', operation: 'prepare_layout', originalError: error.message }
      }), { context: 'print_layout_preparation' });
    }
  }

  cleanupPrintLayout() {
    try {
      // Remove print class
      document.body.classList.remove('printing');
      
      // Restore hidden elements
      const printHidden = document.querySelectorAll('.print-hidden');
      printHidden.forEach(element => {
        if (element) { // Safety check
          element.classList.remove('print-hidden');
        }
      });
    } catch (error) {
      errorHandler.handleError(new DataLoadError('Print layout cleanup failed', {
        userMessage: 'Unable to restore normal page layout after printing. You may need to refresh the page.',
        severity: 'warning',
        recoverable: true,
        details: { component: 'print-controls', operation: 'cleanup_layout', originalError: error.message }
      }), { context: 'print_layout_cleanup' });
    }
  }

  applyPageBreaks() {
    // Add page break opportunities between major sections
    const sections = document.querySelectorAll('.recipe-section');
    sections.forEach((section, index) => {
      // Remove existing page break classes
      section.classList.remove('page-break-before', 'page-break-after', 'no-page-break');
      
      // Apply page break logic
      if (index > 0 && this.shouldBreakBefore(section)) {
        section.classList.add('page-break-before');
      }
    });
  }

  shouldBreakBefore(section) {
    // For now, return false - no automatic page breaks
    // This can be enhanced later based on section type or user preferences
    return false;
  }

  setupPrintStyles() {
    try {
      // Create print-specific CSS for page size only
      let printStyles = document.getElementById('print-styles');
      if (!printStyles) {
        printStyles = document.createElement('style');
        printStyles.id = 'print-styles';
        document.head.appendChild(printStyles);
      }

      printStyles.textContent = `
        @media print {
          @page {
            size: ${this.settings.pageSize};
          }
        }
      `;
    } catch (error) {
      errorHandler.handleError(new DataLoadError('Print styles creation failed', {
        userMessage: 'Unable to apply print styles. Printed pages may not format correctly.',
        severity: 'warning',
        recoverable: true,
        details: { component: 'print-controls', operation: 'create_styles', originalError: error.message }
      }), { context: 'print_styles_creation' });
    }
  }

  destroy() {
    window.removeEventListener('beforeprint', this.preparePrintLayout);
    window.removeEventListener('afterprint', this.cleanupPrintLayout);
  }
}

export { PrintControls };