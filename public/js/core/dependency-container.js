/**
 * Dependency Container
 * Manages application dependencies and reduces global window pollution
 */

import { debug, DEBUG_CATEGORIES } from '../utilities/debug.js';

class DependencyContainer {
  constructor() {
    this.instances = new Map();
    this.singletons = new Map();
    this.factories = new Map();
  }

  /**
   * Register a singleton instance
   * @param {string} name - Service name
   * @param {Object} instance - Service instance
   */
  register(name, instance) {
    this.instances.set(name, instance);
    debug.log(DEBUG_CATEGORIES.CORE, `Registered dependency: ${name}`);
  }

  /**
   * Register a singleton factory (lazy initialization)
   * @param {string} name - Service name  
   * @param {Function} factory - Factory function that creates the instance
   */
  registerFactory(name, factory) {
    this.factories.set(name, factory);
    debug.log(DEBUG_CATEGORIES.CORE, `Registered factory: ${name}`);
  }

  /**
   * Get a dependency by name
   * @param {string} name - Service name
   * @returns {Object} Service instance
   */
  get(name) {
    // Check for existing instance
    if (this.instances.has(name)) {
      return this.instances.get(name);
    }

    // Check for singleton (already created from factory)
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    // Create from factory if available
    if (this.factories.has(name)) {
      const factory = this.factories.get(name);
      const instance = factory();
      this.singletons.set(name, instance);
      debug.log(DEBUG_CATEGORIES.CORE, `Created singleton from factory: ${name}`);
      return instance;
    }

    debug.warn(DEBUG_CATEGORIES.CORE, `Dependency not found: ${name}`);
    return null;
  }

  /**
   * Check if a dependency exists
   * @param {string} name - Service name
   * @returns {boolean} True if dependency exists
   */
  has(name) {
    return this.instances.has(name) || 
           this.singletons.has(name) || 
           this.factories.has(name);
  }

  /**
   * Get all registered dependency names
   * @returns {Array<string>} Array of dependency names
   */
  list() {
    const all = new Set([
      ...this.instances.keys(),
      ...this.singletons.keys(),
      ...this.factories.keys()
    ]);
    return Array.from(all).sort();
  }

  /**
   * Remove a dependency
   * @param {string} name - Service name
   */
  unregister(name) {
    const instance = this.instances.get(name) || this.singletons.get(name);
    
    // Call destroy method if available
    if (instance && typeof instance.destroy === 'function') {
      try {
        instance.destroy();
        debug.log(DEBUG_CATEGORIES.CORE, `Destroyed dependency: ${name}`);
      } catch (error) {
        debug.warn(DEBUG_CATEGORIES.CORE, `Error destroying ${name}:`, error);
      }
    }

    this.instances.delete(name);
    this.singletons.delete(name);
    this.factories.delete(name);
  }

  /**
   * Complete cleanup of all dependencies
   */
  cleanup() {
    debug.log(DEBUG_CATEGORIES.CORE, 'Dependency container cleanup starting...');

    // Destroy all instances in reverse registration order
    const allNames = this.list().reverse();
    
    for (const name of allNames) {
      this.unregister(name);
    }

    // Clear all maps
    this.instances.clear();
    this.singletons.clear();
    this.factories.clear();

    debug.log(DEBUG_CATEGORIES.CORE, 'Dependency container cleanup complete');
  }

  /**
   * Get container statistics for debugging
   * @returns {Object} Container statistics
   */
  getStats() {
    return {
      totalDependencies: this.instances.size + this.singletons.size,
      registeredInstances: this.instances.size,
      singletons: this.singletons.size,
      factories: this.factories.size,
      dependencies: this.list()
    };
  }
}

// Create and export singleton container
export const container = new DependencyContainer();

// Expose container to window for debugging in development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.container = container;
}

/**
 * Convenience function to get dependencies
 * @param {string} name - Service name
 * @returns {Object} Service instance
 */
export const getDependency = (name) => container.get(name);

/**
 * Convenience function to register dependencies
 * @param {string} name - Service name
 * @param {Object} instance - Service instance
 */
export const registerDependency = (name, instance) => container.register(name, instance);