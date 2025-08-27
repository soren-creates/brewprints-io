/**
 * Water Profiles Renderer
 * Handles rendering of water chemistry information
 */

import { BaseRenderer } from './base-renderer.js';

class WaterProfilesRenderer extends BaseRenderer {
  constructor() {
    super();
  }

  render(recipeAnalysis, container) {
    if (!recipeAnalysis || (!recipeAnalysis.sourceWaterProfile && !recipeAnalysis.targetWaterProfile)) {
      return;
    }

    let waterHTML = `
      <section id="water-profiles-section" class="recipe-section" data-section="water-profiles">
        <h2 class="section-title">Water Profiles</h2>
        <div class="water-profiles-container">
    `;

    // Render source water profile if available
    if (recipeAnalysis.sourceWaterProfile) {
      waterHTML += this.renderWaterProfile(recipeAnalysis.sourceWaterProfile, 'Source Water', 'source-water');
    }

    // Render target water profile if available and different from source
    if (recipeAnalysis.targetWaterProfile && 
        recipeAnalysis.targetWaterProfile !== recipeAnalysis.sourceWaterProfile) {
      waterHTML += this.renderWaterProfile(recipeAnalysis.targetWaterProfile, 'Target Water', 'target-water');
    }

    // Add sulfate/chloride ratio summary (with column break hint)
    if (recipeAnalysis.sulfateChlorideRatio > 0) {
      waterHTML += this.renderWaterChemistrySummary(recipeAnalysis);
    }

    waterHTML += '</div></section>';
    container.insertAdjacentHTML('beforeend', waterHTML);
  }

  renderWaterProfile(waterProfile, title, className) {
    // Define the ion order for consistent display
    const ionOrder = ['Ca', 'Mg', 'Na', 'SO4', 'Cl', 'HCO3'];

    // Extract clean name for display if it has a type prefix
    let displayName = waterProfile.name || '';
    if (displayName && displayName.includes(': ')) {
      const parts = displayName.split(': ');
      if (parts.length >= 2) {
        displayName = parts.slice(1).join(': '); // Handle names that might contain ': '
      }
    }

    // Use the clean name in the title if appropriate
    const profileTitle = displayName && title.toLowerCase().includes('water') ? 
                        `${title} (${displayName})` : title;

    let profileHTML = `
      <div class="subsection ${className}">
        <h3 class="subsection-title">${profileTitle}</h3>
        <div class="water-profile-table">
    `;

    // Check if water profile has ANY ion data to determine if we should show the table
    const hasAnyIonData = ionOrder.some(ion => {
      const value = waterProfile[ion] ?? waterProfile[ion.toLowerCase()];
      return value !== undefined && value !== null && value !== '' && !isNaN(value);
    });

    // If water profile has some ion data, show full table with "?" for missing values
    const availableIons = [];
    if (hasAnyIonData) {
      for (const ion of ionOrder) {
        // Check both uppercase and lowercase property names
        const value = waterProfile[ion] ?? waterProfile[ion.toLowerCase()];
        
        if (value !== undefined && value !== null && value !== '' && !isNaN(value)) {
          // Has explicit value (including 0)
          availableIons.push({
            symbol: ion,
            value: Math.round(parseFloat(value))
          });
        } else {
          // Missing value - show "?" to indicate unknown
          availableIons.push({
            symbol: ion,
            value: '?'
          });
        }
      }
    }

    // Add pH if available
    if (waterProfile.pH || waterProfile.ph) {
      const pH = waterProfile.pH || waterProfile.ph;
      availableIons.push({
        symbol: 'pH',
        value: parseFloat(pH).toFixed(2)
      });
    }

    if (availableIons.length > 0) {
      // Create top row with ion symbols
      profileHTML += '<div class="water-profile-row ion-symbols">';
      availableIons.forEach(ion => {
        profileHTML += `<span class="name-value">${ion.symbol}</span>`;
      });
      profileHTML += '</div>';

      // Create bottom row with values (no ppm units)
      profileHTML += '<div class="water-profile-row ion-values">';
      availableIons.forEach(ion => {
        profileHTML += `<span class="value-text-md">${ion.value}</span>`;
      });
      profileHTML += '</div>';
    }

    profileHTML += '</div></div>';
    return profileHTML;
  }

  renderWaterChemistrySummary(recipeAnalysis) {
    // Add character description based on ratio
    const ratio = recipeAnalysis.sulfateChlorideRatio;
    let characterDescription = '';
    
    if (ratio <= 0.3) {
      characterDescription = 'Very malt-forward';
    } else if (ratio <= 0.5) {
      characterDescription = 'Malt-forward';
    } else if (ratio <= 1.5) {
      characterDescription = 'Balanced';
    } else if (ratio <= 3.0) {
      characterDescription = 'Hop-forward';
    } else {
      characterDescription = 'Very hop-forward';
    }

    let summaryHTML = `
      <div class="ingredient-summary water-chemistry-summary">
        <div class="summary-line>
          <span class="summary-label">Sulfate:Chloride Ratio: <span class="summary-value">${recipeAnalysis.sulfateChlorideRatioFormatted} — ${characterDescription}</span></span>
        </div>
      </div>
    `;

    return summaryHTML;
  }
}

export { WaterProfilesRenderer };