#!/usr/bin/env node

/**
 * Integrated Build & Deploy Script
 * Handles all build-time generation: versioning, cache management, and deployment prep
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

class BuildManager {
  constructor() {
    this.buildInfo = null;
    this.backupFiles = new Map();
  }

  /**
   * Generate comprehensive build information
   */
  generateBuildInfo() {
    try {
      const gitHash = execSync('git rev-parse --short HEAD').toString().trim();
      const buildTime = new Date().toISOString();
      const branch = execSync('git branch --show-current').toString().trim();
      const buildTimestamp = Date.now();
      
      // Use ISO date for readable cache versions: v2025-01-31-1430
      const timeComponent = new Date().toISOString().substring(11, 16).replace(':', '');
      const cacheVersion = `${buildTime.split('T')[0]}-${timeComponent}`;

      this.buildInfo = {
        // Git information (for version display)
        git: {
          hash: gitHash,
          branch: branch
        },
        
        // Build timing
        buildTime: buildTime,
        buildTimestamp: buildTimestamp,
        
        // Cache versioning
        cacheVersion: cacheVersion,
        
        // Environment
        isProduction: true
      };

      console.log('✅ Build info generated:', {
        version: gitHash,
        cacheVersion: cacheVersion,
        buildTime: buildTime
      });

      return this.buildInfo;
    } catch (error) {
      throw new Error(`Failed to generate build info: ${error.message}`);
    }
  }

  /**
   * Backup original file before modification
   */
  backupFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    this.backupFiles.set(filePath, content);
  }

  /**
   * Update version.js file (from original deploy.js)
   */
  updateVersionFile() {
    const versionPath = path.join(process.cwd(), 'public', 'js', 'core', 'version.js');
    
    const versionInfo = {
      version: this.buildInfo.git.hash,
      buildTime: this.buildInfo.buildTime,
      branch: this.buildInfo.git.branch
    };

    const content = `export const VERSION_INFO = ${JSON.stringify(versionInfo, null, 2)};`;
    fs.writeFileSync(versionPath, content, 'utf8');
    
    console.log('✅ Version file updated:', versionPath);
  }

  /**
   * Update service worker with build version
   */
  updateServiceWorker() {
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    
    this.backupFile(swPath);
    let swContent = fs.readFileSync(swPath, 'utf8');
    
    // Replace dynamic cache version with build-time version
    swContent = swContent.replace(
      /const CACHE_VERSION = 'v' \+ \(window\.BUILD_TIMESTAMP \|\| Date\.now\(\)\);/,
      `const CACHE_VERSION = '${this.buildInfo.cacheVersion}';`
    );
    
    // Add build comment for debugging
    const versionComment = `// Build: ${this.buildInfo.git.hash} (${this.buildInfo.buildTime})`;
    swContent = swContent.replace('/**', `${versionComment}\n/**`);
    
    fs.writeFileSync(swPath, swContent, 'utf8');
    console.log('✅ Service Worker updated with cache version:', this.buildInfo.cacheVersion);
  }

  /**
   * Update HTML with build timestamp
   */
  updateHTML() {
    const htmlPath = path.join(process.cwd(), 'public', 'index.html');
    
    this.backupFile(htmlPath);
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    if (!htmlContent.includes('window.BUILD_TIMESTAMP')) {
      // Add build timestamp script before other scripts
      const buildScript = `    <!-- Build Information -->
    <script>
      window.BUILD_TIMESTAMP = ${this.buildInfo.buildTimestamp};
      window.BUILD_VERSION = "${this.buildInfo.git.hash}";
    </script>

`;
      
      htmlContent = htmlContent.replace('    <!-- Clerk SDK', buildScript + '    <!-- Clerk SDK');
    } else {
      // Update existing build info
      htmlContent = htmlContent.replace(
        /window\.BUILD_TIMESTAMP = \d+;/,
        `window.BUILD_TIMESTAMP = ${this.buildInfo.buildTimestamp};`
      );
      htmlContent = htmlContent.replace(
        /window\.BUILD_VERSION = "[^"]*";/,
        `window.BUILD_VERSION = "${this.buildInfo.git.hash}";`
      );
    }
    
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log('✅ HTML updated with build information');
  }

  /**
   * Revert all files to original state
   */
  revertFiles() {
    console.log('🔄 Reverting files to development mode...');
    
    for (const [filePath, originalContent] of this.backupFiles) {
      fs.writeFileSync(filePath, originalContent, 'utf8');
      console.log('✅ Reverted:', filePath);
    }

    // Remove version.js if it exists
    const versionPath = path.join(process.cwd(), 'public', 'js', 'core', 'version.js');
    if (fs.existsSync(versionPath)) {
      fs.unlinkSync(versionPath);
      console.log('✅ Removed version.js');
    }

    this.backupFiles.clear();
    console.log('✅ All files reverted to development mode');
  }

  /**
   * Execute production build
   */
  async buildProduction() {
    console.log('🔧 Starting production build...\n');

    try {
      // Generate build information
      this.generateBuildInfo();

      // Update all build files
      this.updateVersionFile();
      this.updateServiceWorker();
      this.updateHTML();

      console.log('\n✅ Production build complete!');
      console.log('📋 Build Summary:');
      console.log(`   Git Version: ${this.buildInfo.git.hash} (${this.buildInfo.git.branch})`);
      console.log(`   Cache Version: ${this.buildInfo.cacheVersion}`);
      console.log(`   Build Time: ${this.buildInfo.buildTime}`);
      console.log('\n🚀 Ready for deployment with: firebase deploy');

    } catch (error) {
      console.error('❌ Production build failed:', error.message);
      
      // Attempt to revert changes
      try {
        this.revertFiles();
        console.log('🔄 Changes reverted due to build failure');
      } catch (revertError) {
        console.error('❌ Failed to revert changes:', revertError.message);
        console.error('⚠️  Manual cleanup may be required');
      }
      
      throw error;
    }
  }

  /**
   * Development mode restoration
   */
  restoreDevelopment() {
    console.log('🔄 Restoring development mode...\n');

    try {
      // Revert service worker to dynamic versioning
      const swPath = path.join(process.cwd(), 'public', 'sw.js');
      if (fs.existsSync(swPath)) {
        let swContent = fs.readFileSync(swPath, 'utf8');
        
        // Remove build comment
        swContent = swContent.replace(/^\/\/ Build:.*\n/, '');
        
        // Restore dynamic versioning
        swContent = swContent.replace(
          /const CACHE_VERSION = '[^']+';/,
          `const CACHE_VERSION = 'v' + (window.BUILD_TIMESTAMP || Date.now());`
        );
        
        fs.writeFileSync(swPath, swContent, 'utf8');
        console.log('✅ Service Worker restored to development mode');
      }

      // Remove version.js
      const versionPath = path.join(process.cwd(), 'public', 'js', 'core', 'version.js');
      if (fs.existsSync(versionPath)) {
        fs.unlinkSync(versionPath);
        console.log('✅ Version file removed');
      }

      console.log('✅ Development mode restored');
      console.log('🔧 Use: npm run dev (for local development)');

    } catch (error) {
      console.error('❌ Failed to restore development mode:', error.message);
      throw error;
    }
  }
}

// Command line interface
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMainModule) {
  const command = process.argv[2];
  const buildManager = new BuildManager();
  
  console.log('🚀 Brewprints Build & Deploy Manager\n');
  
  (async () => {
    try {
      switch (command) {
        case 'build':
          await buildManager.buildProduction();
          break;
          
        case 'dev':
          buildManager.restoreDevelopment();
          break;
          
        default:
          console.log('Usage: node build-deploy.js [build|dev]');
          console.log('');
          console.log('Commands:');
          console.log('  build  - Prepare production build (versioning, caching, git info)');
          console.log('  dev    - Restore development mode');
          console.log('');
          console.log('Typical workflow:');
          console.log('  npm run build:prod    # Prepare for production');
          console.log('  firebase deploy       # Deploy to production');
          console.log('  npm run build:dev     # Restore development mode');
          process.exit(1);
      }
    } catch (error) {
      console.error('\n❌ Build process failed:', error.message);
      process.exit(1);
    }
  })();
}

export { BuildManager };