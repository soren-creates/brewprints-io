/**
 * pH Extraction Utilities
 * Handles extraction of pH values from various recipe data structures
 * Separated from formatters to maintain separation of concerns
 */

/**
 * Extract mash pH from mash data structure
 * @param {Object} mash - Mash data
 * @returns {number|null} Extracted mash pH value or null if not found
 */
export function extractMashPh(mash) {
  if (!mash) return null;
  
  // First check for BeerJSON-style pH in mash steps (primary saccharification step)
  if (mash.steps && Array.isArray(mash.steps)) {
    // Look for primary saccharification step (148-158°F range)
    const primaryStep = mash.steps.find(step => {
      if (step.stepTemp && step.stepTemp >= 148 && step.stepTemp <= 158) {
        return step.start_ph || step.end_ph || step.pH || step.ph;
      }
      return false;
    });
    
    if (primaryStep) {
      const ph = primaryStep.start_ph || primaryStep.end_ph || primaryStep.pH || primaryStep.ph;
      if (ph !== undefined && ph !== null) {
        const parsedPh = parseFloat(ph);
        if (!isNaN(parsedPh)) return parsedPh;
      }
    }
    
    // If no primary step found, check first step with pH
    const firstStepWithPh = mash.steps.find(step => 
      step.start_ph !== undefined || step.end_ph !== undefined || step.pH !== undefined || step.ph !== undefined
    );
    if (firstStepWithPh) {
      const ph = firstStepWithPh.start_ph || firstStepWithPh.end_ph || firstStepWithPh.pH || firstStepWithPh.ph;
      if (ph !== undefined && ph !== null) {
        const parsedPh = parseFloat(ph);
        if (!isNaN(parsedPh)) return parsedPh;
      }
    }
  }
  
  // Check for invalid BeerJSON with pH at mash root level
  if (mash.mashPH !== undefined && mash.mashPH !== null) {
    const ph = parseFloat(mash.mashPH);
    if (!isNaN(ph)) return ph;
  }
  
  // Check for other pH field variations
  if (mash.pH !== undefined && mash.pH !== null) {
    const ph = parseFloat(mash.pH);
    if (!isNaN(ph)) return ph;
  }
  
  return null;
}

/**
 * Extract sparge pH from mash data structure
 * @param {Object} mash - Mash data
 * @returns {number|null} Extracted sparge pH value or null if not found
 */
export function extractSpargePh(mash) {
  if (!mash) return null;
  
  // Look for sparge-type mash step
  if (mash.steps && Array.isArray(mash.steps)) {
    const spargeStep = mash.steps.find(step => 
      step.type && step.type.toLowerCase() === 'sparge' && (step.start_ph || step.end_ph || step.pH || step.ph)
    );
    if (spargeStep) {
      const ph = spargeStep.start_ph || spargeStep.end_ph || spargeStep.pH || spargeStep.ph;
      const parsedPh = parseFloat(ph);
      if (!isNaN(parsedPh)) return parsedPh;
    }
  }
  
  // BeerXML style - mash.ph is actually sparge pH
  if (mash.ph !== undefined && mash.ph !== null) {
    const ph = parseFloat(mash.ph);
    if (!isNaN(ph)) return ph;
  }
  
  // Check sparge temperature step (if it has pH)
  if (mash.spargeTemp && mash.spargePh) {
    const ph = parseFloat(mash.spargePh);
    if (!isNaN(ph)) return ph;
  }
  
  return null;
}