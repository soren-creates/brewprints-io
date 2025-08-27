/**
 * Recipe Utilities
 * 
 * Utility functions for recipe data analysis and validation.
 */

/**
 * Calculate total weight of fermentable ingredients
 * @param {Array} fermentables - Array of fermentable objects
 * @returns {number} Total weight in kg
 */
function calculateTotalFermentableWeight(fermentables) {
  if (!fermentables) return 0;
  return fermentables.reduce((total, f) => total + f.amount, 0);
}

/**
 * Check if recipe has any ingredients
 * @param {Object} ingredients - Recipe ingredients object
 * @returns {boolean} True if recipe has ingredients
 */
function hasIngredients(ingredients) {
  if (!ingredients) return false;
  return Boolean((ingredients.fermentables && ingredients.fermentables.length > 0) ||
                 (ingredients.hops && ingredients.hops.length > 0) ||
                 (ingredients.yeasts && ingredients.yeasts.length > 0) ||
                 (ingredients.miscs && ingredients.miscs.length > 0));
}

/**
 * Check if recipe has specific types of ingredients
 * @param {Object} ingredients - Recipe ingredients object
 * @param {string} type - Type to check ('fermentables', 'hops', 'yeasts', 'miscs', 'waters')
 * @returns {boolean} True if recipe has ingredients of specified type
 */
function hasIngredientsOfType(ingredients, type) {
  if (!ingredients || !ingredients[type]) return false;
  return ingredients[type].length > 0;
}

/**
 * Get all grains from fermentables (excluding extracts, sugars, etc.)
 * @param {Array} fermentables - Array of fermentable objects
 * @returns {Array} Array of grain fermentables only
 */
function getGrainFermentables(fermentables) {
  if (!fermentables) return [];
  return fermentables.filter(f => 
    f.type && (f.type.toLowerCase() === 'grain' || f.type.toLowerCase() === 'adjunct')
  );
}

/**
 * Get total grain weight from fermentables
 * @param {Array} fermentables - Array of fermentable objects
 * @returns {number} Total grain weight in kg
 */
function getTotalGrainWeight(fermentables) {
  const grains = getGrainFermentables(fermentables);
  return calculateTotalFermentableWeight(grains);
}

/**
 * Get brewing method type based on fermentables
 * @param {Array} fermentables - Array of fermentable objects
 * @returns {string} Brewing method ('All Grain', 'Extract', 'Partial Mash')
 */
function getBrewingMethod(fermentables) {
  if (!fermentables || fermentables.length === 0) return 'Unknown';
  
  const hasGrain = fermentables.some(f => 
    f.type && (f.type.toLowerCase() === 'grain' || f.type.toLowerCase() === 'adjunct')
  );
  const hasExtract = fermentables.some(f => 
    f.type && f.type.toLowerCase() === 'extract'
  );
  
  if (hasGrain && !hasExtract) {
    return 'All Grain';
  } else if (!hasGrain && hasExtract) {
    return 'Extract';
  } else if (hasGrain && hasExtract) {
    return 'Partial Mash';
  } else {
    return 'Other';
  }
}

/**
 * Get hop varieties used in recipe
 * @param {Array} hops - Array of hop objects
 * @returns {Array} Array of unique hop names
 */
function getHopVarieties(hops) {
  if (!hops) return [];
  return [...new Set(hops.map(hop => hop.name))].filter(Boolean);
}

/**
 * Get yeast strains used in recipe
 * @param {Array} yeasts - Array of yeast objects
 * @returns {Array} Array of unique yeast names
 */
function getYeastStrains(yeasts) {
  if (!yeasts) return [];
  return [...new Set(yeasts.map(yeast => yeast.name))].filter(Boolean);
}



/**
 * Get convenience flags for recipe features
 * @param {Object} recipeData - Recipe data object  
 * @param {Object} ingredients - Recipe ingredients object
 * @returns {Object} Object with boolean flags for recipe features
 */
function getRecipeFlags(recipeData, ingredients) {
  return {
    hasIngredients: hasIngredients(ingredients),
    hasMash: Boolean(recipeData.mash && recipeData.mash.steps && recipeData.mash.steps.length > 0),
    hasStyle: Boolean(recipeData.style && recipeData.style.name),
    hasEquipment: Boolean(recipeData.equipment && recipeData.equipment.name),
    hasFermentation: Boolean(recipeData.fermentation && (
      recipeData.fermentation.primaryAge > 0 || 
      recipeData.fermentation.secondaryAge > 0 || 
      recipeData.fermentation.tertiaryAge > 0
    ))
  };
}

export {
  calculateTotalFermentableWeight,
  hasIngredients,
  hasIngredientsOfType,
  getGrainFermentables,
  getTotalGrainWeight,
  getBrewingMethod,
  getHopVarieties,
  getYeastStrains,
  getRecipeFlags
};
