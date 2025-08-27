/**
 * Browser-compatible Brewfather to BeerJSON Converter
 */

// BeerJSON 1.0 compliant unit mappings
const BEERJSON_UNITS = {
  // Percentage units - BeerJSON requires "%" not "percent"
  PERCENT: '%',
  
  // Temperature units
  CELSIUS: 'C',
  FAHRENHEIT: 'F',
  
  // Color units - BeerJSON uses "Lovi" and "SRM" (case-sensitive)
  LOVIBOND: 'Lovi',
  SRM: 'SRM',
  
  // Volume units
  LITER: 'l',
  MILLILITER: 'ml',
  
  // Weight units
  KILOGRAM: 'kg',
  GRAM: 'g',
  
  // Other units
  SG: 'sg',
  IBU: 'IBUs',
  PPM: 'ppm',
  LINTNER: 'Lintner',
  VOLS: 'vols',
  MINUTE: 'min',
  DAY: 'day',
  EACH: 'each',
  L_PER_KG: 'l/kg'
};

import { normalizeHopUse } from '../utilities/hop-use-normalizer.js';

export class BrewfatherConverter {
  constructor() {
    this.brewfatherSpecificFields = [
      // Internal tracking
      '_id', '_version', '_timestamp', '_timestamp_ms', '_created', '_uid', 
      '_ev', '_ev_updated', '_public', '_share', '_origin', '_init', '_parent',
      
      // UI/Display data
      'img', 'thumb', 'path', 'searchTags', 'defaults', 'hidden',
      'styleColor', 'styleCarb', 'styleBuGu', 'styleOg', 'styleFg', 
      'styleAbv', 'styleIbu', 'styleRbr', 'styleConformity',
      
      // Calculated values
      'fermentableIbu', 'extraGravity', 'totalGravity', 'sumAromaHopPerLiter',
      'sumDryHopPerLiter', 'hopsTotalAmount', 'diastaticPower', 
      'yeastToleranceExceededBy', 'avgWeightedHopstandTemp', 'hopStandMinutes',
      'nutrition', 'buGuRatio', 'rbRatio',
      
      // Fermentation tracking
      'primaryTemp', 'fgFormula',
      
      // Ingredient-specific
      'inventory', 'costPerAmount', 'manufacturingDate', 'bestBeforeDate',
      'userNotes', 'usedIn', 'excluded', 'cgdb', 'fgdb', 'fan', 'friability',
      'hsi', 'actualTime', 'temp', 'timeUnit', 'lotNumber',
      'fermentsAll',
      
      // Process data
      'data', 'mashVolumeSurplus', 'mashPh',
      
      // Hop-specific Brewfather fields
      // Note: 'ibu' removed as it's also a valid BeerJSON field for style IBU ranges
      'usage', 'myrcene', 'humulene', 'caryophyllene', 'farnesene',
      'cohumulone', 'hsi', 'coHumulone', '_editFlag', '_timestamp_ms',
      
      // Culture-specific Brewfather fields  
      // Note: 'unit' and 'amount' are NOT Brewfather-specific - they're required BeerJSON fields
      'amountIsWeight', 'cells', 'cellsPerPack',
      
      // Additional undefined properties that may leak through
      'undefined', 'null'
    ];
  }

  /**
   * Convert Brewfather recipe to BeerJSON format
   */
  convert(brewfatherData) {
    const recipe = this.convertRecipe(brewfatherData);
    
    const beerJSON = {
      version: 1.0,
      recipes: [recipe]
    };

    // Add equipment if present
    if (brewfatherData.equipment) {
      beerJSON.equipments = [this.convertEquipment(brewfatherData.equipment, brewfatherData)];
    }

    return beerJSON;
  }

  /**
   * Convert main recipe data
   */
  convertRecipe(data) {
    const recipe = {
      name: data.name,
      type: this.mapRecipeType(data.type),
      author: data.author,
      batch_size: {
        unit: "l",
        value: data.batchSize
      },
      efficiency: {
        brewhouse: {
          unit: BEERJSON_UNITS.PERCENT,
          value: data.efficiency
        }
      },
      ingredients: this.convertIngredients(data)
    };

    // Add mash efficiency if available
    if (data.mashEfficiency) {
      recipe.efficiency.mash = {
        unit: BEERJSON_UNITS.PERCENT,
        value: data.mashEfficiency
      };
    }

    // Add notes
    if (data.notes) {
      recipe.notes = data.notes;
    }

    // Add boil procedure
    if (data.boilTime) {
      recipe.boil = this.convertBoil(data);
    }

    // Add mash procedure if present
    if (data.mash) {
      // Extract pH values from Brewfather water structure
      const mashPh = data.water?.mashPh;
      const spargePh = data.water?.sparge?.ph;
      // Pass equipment info to check if this is a sparge or no-sparge recipe
      recipe.mash = this.convertMash(data.mash, mashPh, spargePh, data.equipment);
    }

    // Add fermentation procedure if present
    if (data.fermentation) {
      recipe.fermentation = this.convertFermentation(data.fermentation);
    }

    // Add style if present
    if (data.style) {
      recipe.style = this.convertStyle(data.style);
    }

    // Handle carbonationStyle separately for Brewfather recipes
    if (data.carbonationStyle && data.carbonationStyle.carbMin !== undefined && data.carbonationStyle.carbMax !== undefined) {
      if (!recipe.style) {
        recipe.style = { name: data.carbonationStyle.name || 'Unknown Style' };
      }
      
      // Add carbonation range to existing style
      if (!recipe.style.carbonation) {
        recipe.style.carbonation = {
          minimum: {
            unit: "vols",
            value: data.carbonationStyle.carbMin
          },
          maximum: {
            unit: "vols", 
            value: data.carbonationStyle.carbMax
          }
        };
      }
    }

    if (data.og) {
      recipe.original_gravity = {
        unit: "sg",
        value: data.og
      };
    }

    if (data.fg) {
      recipe.final_gravity = {
        unit: "sg", 
        value: data.fg
      };
    }

    if (data.abv) {
      recipe.alcohol_by_volume = {
        unit: BEERJSON_UNITS.PERCENT,
        value: data.abv
      };
    }

    if (data.ibu) {
      // BeerJSON 1.0 requires ibu_estimate to only contain "method" property
      recipe.ibu_estimate = {
        method: this.mapIBUFormula(data.ibuFormula)
      };
    }

    if (data.color) {
      recipe.color_estimate = {
        unit: "SRM",
        value: data.color
      };
    }

    if (data.carbonation) {
      recipe.carbonation = data.carbonation;
    }

    if (data.attenuation) {
      recipe.apparent_attenuation = {
        unit: BEERJSON_UNITS.PERCENT,
        value: data.attenuation * 100
      };
    }

    // Pre-boil and post-boil gravity are stored in the boil procedure's boil_steps
    // This is handled in the convertBoil() method

    // Add brewhouse efficiency if available from equipment meta
    if (data.equipment && data.equipment.brewhouseEfficiency) {
      if (!recipe.efficiency) recipe.efficiency = {};
      recipe.efficiency.brewhouse = {
        unit: BEERJSON_UNITS.PERCENT,
        value: data.equipment.brewhouseEfficiency
      };
    }

    // Add created date if available
    if (data._created && data._created.seconds) {
      recipe.created = new Date(data._created.seconds * 1000).toISOString().split('T')[0];
    }

    return recipe;
  }

  /**
   * Convert ingredients
   */
  convertIngredients(data) {
    const ingredients = {
      fermentable_additions: []
    };

    // Convert fermentables
    if (data.fermentables && data.fermentables.length > 0) {
      ingredients.fermentable_additions = data.fermentables
        .filter(f => !f.excluded)
        .map(f => this.convertFermentable(f));
    }

    // Convert hops
    if (data.hops && data.hops.length > 0) {
      ingredients.hop_additions = data.hops.map(h => this.convertHop(h));
    }

    // Convert yeasts/cultures
    if (data.yeasts && data.yeasts.length > 0) {
      ingredients.culture_additions = data.yeasts.map(y => this.convertCulture(y));
    }

    // Convert miscellaneous
    if (data.miscs && data.miscs.length > 0) {
      ingredients.miscellaneous_additions = data.miscs.map(m => this.convertMiscellaneous(m));
    }

    // Convert water additions with type prefixes for identification
    const waterAdditions = [];
    if (data.water) {
      // Add source water profile
      if (data.water.source) {
        waterAdditions.push(this.convertWater(data.water.source, 'Source'));
      }
      // Add target water profile
      if (data.water.target) {
        waterAdditions.push(this.convertWater(data.water.target, 'Target'));
      }
      // Add sparge water if it exists and is different from source
      // Compare by name since they may be different objects with same values
      if (data.water.sparge && 
          (!data.water.source || data.water.sparge.name !== data.water.source.name)) {
        waterAdditions.push(this.convertWater(data.water.sparge, 'Sparge'));
      }
      // Note: Skipping 'mash' and 'total' as they are typically duplicates
      // of source water with adjustments already reflected in target
    }
    if (waterAdditions.length > 0) {
      ingredients.water_additions = waterAdditions;
    }

    return ingredients;
  }

  /**
   * Complete yield object with all required BeerJSON properties
   * @param {Object} fermentable - Brewfather fermentable data
   * @returns {Object} Complete yield object with all required properties
   */
  completeYieldObject(fermentable) {
    // Calculate fine grind value (default to 80% if not provided)
    const fineGrindValue = fermentable.potentialPercentage || fermentable.yield || 80;
    
    // Calculate coarse grind (typically 2% less than fine grind)
    const coarseGrindValue = fineGrindValue - 2;
    
    // Calculate fine/coarse difference
    const fineCoarseDifference = fermentable.coarseFineDiff || 2;
    
    // Calculate potential from fine grind percentage
    // Potential is the specific gravity contribution at 100% efficiency
    // Formula: 1 + (fineGrind% / 100 * 0.046)
    const potentialValue = 1 + (fineGrindValue / 100 * 0.046);
    
    return {
      fine_grind: {
        unit: BEERJSON_UNITS.PERCENT,
        value: fineGrindValue
      },
      coarse_grind: {
        unit: BEERJSON_UNITS.PERCENT,
        value: coarseGrindValue
      },
      fine_coarse_difference: {
        unit: BEERJSON_UNITS.PERCENT,
        value: fineCoarseDifference
      },
      potential: {
        unit: BEERJSON_UNITS.SG,
        value: potentialValue
      }
    };
  }

  /**
   * Convert fermentable ingredient
   */
  convertFermentable(fermentable) {
    const addition = {
      name: fermentable.name,
      type: this.mapFermentableType(fermentable.type),
      amount: {
        unit: BEERJSON_UNITS.KILOGRAM,
        value: fermentable.amount
      },
      yield: this.completeYieldObject(fermentable),
      color: {
        unit: BEERJSON_UNITS.LOVIBOND,
        value: fermentable.color
      },
      timing: {
        use: this.mapFermentableUse(fermentable.use)
      }
    };

    // Add optional fields from FermentableBase per official BeerJSON spec
    if (fermentable.origin) addition.origin = fermentable.origin;
    if (fermentable.supplier) addition.producer = fermentable.supplier;  // Allowed per official schema
    if (fermentable.productId || fermentable.product_id) addition.product_id = fermentable.productId || fermentable.product_id;
    
    // Note: Our custom schema validator incorrectly rejects some of these properties
    // that are allowed in the official BeerJSON schema. The validator needs updating.

    return addition;
  }

  /**
   * Convert hop ingredient
   */
  convertHop(hop) {
    const addition = {
      name: hop.name,
      alpha_acid: {
        unit: BEERJSON_UNITS.PERCENT,
        value: hop.alpha
      },
      amount: {
        unit: BEERJSON_UNITS.KILOGRAM, 
        value: hop.amount / 1000 // Convert grams to kg for BeerJSON consistency
      },
      timing: {
        use: this.mapHopUse(hop.use),
        time: {
          unit: "min",
          value: this.convertHopTime(hop.time, hop.timeUnit)
        }
      },
      // Preserve original Brewfather use for accurate normalization
      originalBrewfatherUse: hop.use,
      sourceFormat: 'brewfather'
    };

    // Note: Temperature is not allowed in TimingType schema
    // Hop temperature should be stored elsewhere if needed

    // Add only fields allowed in HopVarietyBase (for HopAdditionType)
    if (hop.origin) addition.origin = hop.origin;
    if (hop.supplier) addition.producer = hop.supplier;
    if (hop.productId || hop.product_id) addition.product_id = hop.productId || hop.product_id;
    if (hop.form) addition.form = this.mapHopForm(hop.form);
    if (hop.beta) {
      addition.beta_acid = {
        unit: BEERJSON_UNITS.PERCENT,
        value: hop.beta
      };
    }
    if (hop.year) addition.year = hop.year;

    // Note: The following fields are only allowed in VarietyInformation, not HopAdditionType:
    // - type, notes, substitutes, percent_lost, oil_content
    // These would cause BeerJSON validation errors if included in recipe hop additions

    return addition;
  }

  /**
   * Convert yeast/culture ingredient
   */
  convertCulture(yeast) {
    const addition = {
      name: yeast.name,
      type: this.mapYeastType(yeast.type),
      form: this.mapYeastForm(yeast.form),
      amount: {
        unit: yeast.unit === 'pkg' ? 'each' : yeast.unit || (yeast.amountIsWeight ? 'kg' : 'l'),
        value: yeast.amount
      }
    };

    // Add optional fields
    if (yeast.laboratory) addition.producer = yeast.laboratory;
    if (yeast.productId) addition.product_id = yeast.productId;
    if ((yeast.minTemp || yeast.tempMin) && (yeast.maxTemp || yeast.tempMax)) {
      addition.temperature_range = {
        minimum: {
          unit: BEERJSON_UNITS.CELSIUS,
          value: yeast.minTemp || yeast.tempMin
        },
        maximum: {
          unit: BEERJSON_UNITS.CELSIUS, 
          value: yeast.maxTemp || yeast.tempMax
        }
      };
    }
    // BeerJSON attenuation is a simple PercentType (single value)
    if (yeast.attenuation !== undefined && yeast.attenuation !== null) {
      addition.attenuation = {
        unit: BEERJSON_UNITS.PERCENT,
        value: yeast.attenuation
      };
    }
    if (yeast.minAttenuation && yeast.maxAttenuation) {
      addition.attenuation_range = {
        minimum: {
          unit: BEERJSON_UNITS.PERCENT,
          value: yeast.minAttenuation
        },
        maximum: {
          unit: BEERJSON_UNITS.PERCENT,
          value: yeast.maxAttenuation
        }
      };
    }
    if (yeast.maxAbv || yeast.alcoholTolerance) {
      addition.alcohol_tolerance = {
        unit: BEERJSON_UNITS.PERCENT,
        value: yeast.maxAbv || yeast.alcoholTolerance
      };
    }
    if (yeast.flocculation) {
      addition.flocculation = this.mapFlocculation(yeast.flocculation);
    }
    if (yeast.notes) addition.notes = yeast.notes;
    if (yeast.bestFor) addition.best_for = yeast.bestFor;
    if (yeast.maxReuse) addition.max_reuse = yeast.maxReuse;
    if (yeast.description) addition.description = yeast.description;

    return addition;
  }

  /**
   * Convert miscellaneous ingredient
   */
  convertMiscellaneous(misc) {
    const addition = {
      name: misc.name,
      type: this.mapMiscType(misc.type),
      amount: {
        unit: this.mapMiscUnit(misc.unit),
        value: misc.amount
      },
      timing: {
        use: this.mapMiscUse(misc.use)
      }
    };

    // Add timing
    if (misc.time !== undefined && misc.time !== null) {
      addition.timing.time = {
        unit: misc.timeIsDays ? "day" : "min",
        value: misc.time
      };
    }

    // Add optional fields allowed in MiscellaneousBase
    if (misc.producer || misc.supplier) addition.producer = misc.producer || misc.supplier;
    if (misc.product_id || misc.productId) addition.product_id = misc.product_id || misc.productId;
    
    // Note: 'notes' is only allowed in MiscellaneousType, not MiscellaneousAdditionType

    return addition;
  }

  /**
   * Convert water profile
   * @param {Object} water - Water profile data
   * @param {string} profileType - Type of water profile (Source, Target, Sparge)
   */
  convertWater(water, profileType) {
    const waterProfile = {
      name: profileType ? `${profileType}: ${water.name}` : water.name,
      // Required amount property - use a default if not available
      amount: {
        unit: "l",
        value: water.amount || 20  // Default amount if not specified
      }
    };
    
    // BeerJSON schema requires all major ions to be present
    // We include them if they have defined values, otherwise skip this water profile
    // This preserves the distinction between 0 (no ions) and undefined (unknown)
    
    // Check if we have enough data to create a valid water profile
    const hasRequiredData = [
      water.calcium, water.bicarbonate, water.sulfate, 
      water.chloride, water.sodium, water.magnesium
    ].some(ion => ion !== undefined && ion !== null);
    
    if (!hasRequiredData) {
      // Not enough ion data - return minimal profile with just name and amount
      return waterProfile;
    }
    
    // Include all required ions, using 0 for missing values only when we have some ion data
    waterProfile.calcium = {
      unit: "ppm",
      value: water.calcium ?? 0
    };
    
    waterProfile.bicarbonate = {
      unit: "ppm", 
      value: water.bicarbonate ?? 0
    };
    
    waterProfile.sulfate = {
      unit: "ppm",
      value: water.sulfate ?? 0
    };
    
    waterProfile.chloride = {
      unit: "ppm",
      value: water.chloride ?? 0
    };
    
    waterProfile.sodium = {
      unit: "ppm",
      value: water.sodium ?? 0
    };
    
    waterProfile.magnesium = {
      unit: "ppm",
      value: water.magnesium ?? 0
    };
    
    // Note: 'type' and 'ph' properties are not allowed in WaterAdditionType schema
    // pH is only allowed in WaterType (for record storage), not WaterAdditionType (for recipes)
    
    return waterProfile;
  }

  /**
   * Convert boil procedure
   */
  convertBoil(data) {
    const boil = {
      name: "Boil",
      boil_time: {
        unit: "min",
        value: data.boilTime
      }
    };

    // Add pre-boil size if available - check both top level and equipment
    const boilSize = data.boilSize || (data.equipment && data.equipment.boilSize);
    if (boilSize) {
      boil.pre_boil_size = {
        unit: "l",
        value: boilSize
      };
    }

    // Add boil steps with gravity measurements if available
    const boilSteps = [];
    
    // Pre-boil measurement step
    if (data.preBoilGravity) {
      boilSteps.push({
        name: "Pre-boil measurement",
        description: "Initial gravity reading before boil begins",
        start_gravity: {
          unit: "sg",
          value: data.preBoilGravity
        },
        step_time: {
          unit: "min",
          value: 0
        }
      });
    }
    
    // Main boil step with post-boil gravity
    const mainBoilStep = {
      name: "Main boil",
      step_time: {
        unit: "min",
        value: data.boilTime
      }
    };
    
    if (data.postBoilGravity) {
      mainBoilStep.end_gravity = {
        unit: "sg",
        value: data.postBoilGravity
      };
    }
    
    boilSteps.push(mainBoilStep);
    
    if (boilSteps.length > 0) {
      boil.boil_steps = boilSteps;
    }

    return boil;
  }

  /**
   * Convert equipment
   */
  convertEquipment(equipment, recipeData = null) {
    const equipmentItems = [];

    // Create mash tun equipment item
    const mashTun = {
      name: "Mash Tun",
      type: "mash tun",
      form: "mash tun",  // BeerJSON form enum for equipment categorization
      loss: {
        unit: "l", 
        value: equipment.mashTunLoss || 0  // Unrecoverable loss (different from deadspace)
      }
    };

    // Add maximum_volume - prefer actual vessel volume over water capacity
    const mashTunVolume = equipment.mashTunVolume || equipment.mashWaterMax;
    if (mashTunVolume) {
      mashTun.maximum_volume = {
        unit: "l",
        value: mashTunVolume
      };
    }

    // Add grain absorption rate if available
    if (equipment.grainAbsorptionRate) {
      mashTun.grain_absorption_rate = {
        unit: "l/kg",
        value: equipment.grainAbsorptionRate
      };
    }

    // Add dead space information to notes since it's important but doesn't have a direct BeerJSON field
    let mashTunNotes = [];
    if (equipment.mashTunDeadSpace) {
      mashTunNotes.push(`Dead space (below false bottom): ${equipment.mashTunDeadSpace} L`);
    }
    if (mashTunNotes.length > 0) {
      mashTun.notes = mashTunNotes.join('. ');
    }

    equipmentItems.push(mashTun);

    // Create brew kettle equipment item
    // Maximum volume is mash water capacity plus dead space (total vessel capacity)
    const mashWaterMax = equipment.mashWaterMax;
    const mashTunDeadSpace = equipment.mashTunDeadSpace;
    const brewKettleMaxVolume = mashWaterMax + mashTunDeadSpace;

    const brewKettle = {
      name: "Brew Kettle", 
      type: "brew kettle",
      form: "brew kettle",  // BeerJSON form enum for equipment categorization
      maximum_volume: {
        unit: "l",
        value: brewKettleMaxVolume
      },
      loss: {
        unit: "l",
        value: equipment.trubChillerLoss
      }
    };

    // Add boil rate per hour if available
    if (equipment.boilOffPerHr) {
      brewKettle.boil_rate_per_hour = {
        unit: "l",
        value: equipment.boilOffPerHr
      };
    }

    equipmentItems.push(brewKettle);

    // Create fermenter equipment item
    const fermenter = {
      name: "Fermenter",
      type: "fermenter",
      form: "fermenter",  // BeerJSON form enum for equipment categorization
      maximum_volume: {
        unit: "l",
        value: equipment.fermenterVolume
      },
      loss: {
        unit: "l",
        value: equipment.fermenterLoss
      }
    };

    equipmentItems.push(fermenter);

    // Create equipment object with Brewfather top-up water fields
    const equipmentObject = {
      name: equipment.name,
      equipment_items: equipmentItems
    };

    // Add Brewfather-specific fields if present 
    if (recipeData) {
      // topUpWater (Brewfather) -> topUpKettle (BeerJSON)
      if (recipeData.data && recipeData.data.topUpWater) {
        equipmentObject.topUpKettle = recipeData.data.topUpWater;
      }
      // fermenterTopUp (Brewfather) -> topUpWater (BeerJSON)
      if (recipeData.equipment && recipeData.equipment.fermenterTopUp) {
        equipmentObject.topUpWater = recipeData.equipment.fermenterTopUp;
      }
    }
    
    // Add mashTunDeadspace if present (Brewfather's recoverable deadspace)
    if (equipment.mashTunDeadSpace !== undefined) {
      equipmentObject.mashTunDeadspace = equipment.mashTunDeadSpace;
    }

    return this.stripBrewfatherFields(equipmentObject);
  }

  /**
   * Convert mash profile
   */
  convertMash(mash, mashPh, spargePh, equipment) {
    const mashProfile = {
      name: mash.name,
      grain_temperature: {
        unit: 'C',
        value: mash.grainTemp
      },
      mash_steps: []
    };

    if (mash.steps && mash.steps.length > 0) {
      mashProfile.mash_steps = mash.steps.map((step, index) => {
        const mashStep = {
          name: step.name || this.inferMashStepName(step.stepTemp),
          type: this.mapMashStepType(step.type),
          amount: step.infuseAmount ? {
            unit: "l",
            value: step.infuseAmount
          } : undefined,
          step_temperature: {
            unit: BEERJSON_UNITS.CELSIUS,
            value: step.stepTemp
          },
          step_time: {
            unit: "min",
            value: step.stepTime
          }
        };

        // Add Brewfather mashPh to primary saccharification step (148-158°F / 64-70°C)
        if (mashPh && step.stepTemp >= 64 && step.stepTemp <= 70) {
          mashStep.start_ph = {
            unit: "pH",
            value: mashPh
          };
        }

        return mashStep;
      });
    } else if (mashPh) {
      // If no mash steps but mash pH is available, create a default saccharification step
      mashProfile.mash_steps = [{
        name: "Saccharification",
        type: "temperature",
        step_temperature: {
          unit: BEERJSON_UNITS.CELSIUS,
          value: 67 // Default saccharification temperature
        },
        step_time: {
          unit: "min",
          value: 60 // Default saccharification time
        },
        start_ph: {
          unit: "pH",
          value: mashPh
        }
      }];
    }

    // Add sparge step if sparge pH is available AND this is actually a sparge recipe
    if (spargePh && this.isSpargingRecipe(equipment)) {
      mashProfile.mash_steps.push({
        name: "Sparge",
        type: "sparge",
        step_temperature: {
          unit: BEERJSON_UNITS.CELSIUS,
          value: 76 // Default sparge temperature
        },
        step_time: {
          unit: "min",
          value: 30 // Default sparge time
        },
        start_ph: {
          unit: "pH",
          value: spargePh
        }
      });
    }

    return this.stripBrewfatherFields(mashProfile);
  }

  /**
   * Check if this is a sparging recipe based on equipment configuration
   * @param {Object} equipment - Equipment data
   * @returns {boolean} True if recipe uses sparging
   */
  isSpargingRecipe(equipment) {
    if (!equipment) return false;
    
    // Check waterCalculation field (most reliable indicator)
    if (equipment.waterCalculation) {
      return equipment.waterCalculation !== 'No Sparge';
    }
    
    // Check equipment name for "No Sparge" indicator
    if (equipment.name) {
      return !equipment.name.toLowerCase().includes('no sparge');
    }
    
    // Default to assuming sparging if unclear
    return true;
  }

  /**
   * Infer mash step name based on temperature
   * @param {number} tempC - Temperature in Celsius
   * @returns {string} Inferred step name
   */
  inferMashStepName(tempC) {
    if (tempC <= 40) {
      return "Mash Step";
    } else if (tempC <= 43) {
      return "β-Glucanase Rest";
    } else if (tempC <= 45) {
      return "Ferulic Acid Rest";
    } else if (tempC <= 50) {
      return "Protein Rest";
    } else if (tempC <= 55) {
      return "Protein (Proteinase) Rest";
    } else if (tempC <= 67) {
      return "Saccharification";
    } else if (tempC <= 69) {
      return "β-Amylase and α-Amylase Rest";
    } else if (tempC < 75) {
      return "α-Amylase Rest";
    } else if (tempC <= 78) {
      return "Mash Out";
    } else {
      return "Mash Step";
    }
  }

  /**
   * Convert fermentation profile
   */
  convertFermentation(fermentation) {
    const fermentationProfile = {
      name: fermentation.name || "Primary Fermentation",
      fermentation_steps: []
    };

    if (fermentation.steps && fermentation.steps.length > 0) {
      fermentationProfile.fermentation_steps = fermentation.steps.map(step => ({
        name: step.name || step.type || "Primary",
        start_temperature: {
          unit: BEERJSON_UNITS.CELSIUS,
          value: step.stepTemp || 20
        },
        step_time: {
          unit: "day",
          value: step.stepTime || 0
        }
      }));
    }

    return this.stripBrewfatherFields(fermentationProfile);
  }

  /**
   * Convert style information for recipe
   */
  convertStyle(style) {
    const styleData = {
      name: style.name,
      category: style.category,
      category_number: style.categoryNumber,
      style_letter: style.styleLetter,
      style_guide: style.styleGuide,
      type: this.mapStyleType(style.type)
    };

    // Add original gravity range
    if (style.ogMin !== undefined && style.ogMax !== undefined) {
      styleData.original_gravity = {
        minimum: {
          unit: "sg",
          value: style.ogMin
        },
        maximum: {
          unit: "sg", 
          value: style.ogMax
        }
      };
    }

    // Add final gravity range
    if (style.fgMin !== undefined && style.fgMax !== undefined) {
      styleData.final_gravity = {
        minimum: {
          unit: "sg",
          value: style.fgMin
        },
        maximum: {
          unit: "sg",
          value: style.fgMax
        }
      };
    }

    // Add IBU range
    if (style.ibuMin !== undefined && style.ibuMax !== undefined) {
      styleData.international_bitterness_units = {
        minimum: {
          unit: "IBUs",
          value: style.ibuMin
        },
        maximum: {
          unit: "IBUs",
          value: style.ibuMax
        }
      };
    }

    // Add color range (Brewfather uses colorMin/colorMax for SRM)
    if (style.colorMin !== undefined && style.colorMax !== undefined) {
      styleData.color = {
        minimum: {
          unit: "SRM",
          value: style.colorMin
        },
        maximum: {
          unit: "SRM",
          value: style.colorMax
        }
      };
    }

    // Add ABV range
    if (style.abvMin !== undefined && style.abvMax !== undefined) {
      styleData.alcohol_by_volume = {
        minimum: {
          unit: BEERJSON_UNITS.PERCENT,
          value: style.abvMin
        },
        maximum: {
          unit: BEERJSON_UNITS.PERCENT,
          value: style.abvMax
        }
      };
    }

    // Add carbonation range
    if (style.carbMin !== undefined && style.carbMax !== undefined) {
      styleData.carbonation = {
        minimum: {
          unit: "vols",
          value: style.carbMin
        },
        maximum: {
          unit: "vols",
          value: style.carbMax
        }
      };
    }

    // Add notes if available
    if (style.notes) {
      styleData.notes = style.notes;
    }

    return this.stripBrewfatherFields(styleData);
  }

  /**
   * Strip Brewfather-specific fields from an object
   */
  stripBrewfatherFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip undefined or null values entirely
      if (value === undefined || value === null) {
        continue;
      }
      
      // Skip Brewfather-specific fields
      if (!this.brewfatherSpecificFields.includes(key)) {
        if (Array.isArray(value)) {
          cleaned[key] = value.map(item => this.stripBrewfatherFields(item));
        } else if (typeof value === 'object' && value !== null) {
          cleaned[key] = this.stripBrewfatherFields(value);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }

  // Mapping functions
  mapRecipeType(type) {
    const typeMap = {
      'Extract': 'extract',
      'Partial Mash': 'partial mash', 
      'All Grain': 'all grain',
      'BIAB': 'biab'
    };
    return typeMap[type] || 'extract';
  }

  mapFermentableType(type) {
    const typeMap = {
      'Grain': 'grain',
      'Extract': 'extract',
      'Liquid Extract': 'extract',  // Both liquid and dry extracts map to 'extract' or 'dry extract'
      'Dry Extract': 'dry extract',
      'Sugar': 'sugar',
      'Adjunct': 'other'
    };
    return typeMap[type] || 'grain';
  }

  mapFermentableUse(use) {
    // BeerJSON 1.0 requires specific timing use enums
    const useMap = {
      'Mash': 'add_to_mash',
      'Boil': 'add_to_boil',
      'Fermentation': 'add_to_fermentation',
      'Bottling': 'add_to_package',
      'Packaging': 'add_to_package'
    };
    return useMap[use] || 'add_to_mash';
  }

  mapHopUse(use) {
    // BeerJSON 1.0 requires specific timing use enums
    const useMap = {
      'Boil': 'add_to_boil',
      'Dry Hop': 'add_to_fermentation',
      'Aroma': 'add_to_boil',  // Aroma is typically late boil
      'First Wort': 'add_to_boil',  // First wort is still a boil addition
      'Whirlpool': 'add_to_boil'  // Whirlpool is post-boil but part of boil process
    };
    return useMap[use] || 'add_to_boil';
  }

  mapHopForm(form) {
    const formMap = {
      'Pellet': 'pellet',
      'Leaf': 'leaf',
      'Plug': 'plug',
      'Extract': 'extract'
    };
    return formMap[form] || 'pellet';
  }

  mapYeastType(type) {
    const typeMap = {
      'Ale': 'ale',
      'Lager': 'lager', 
      'Wheat': 'wheat',
      'Wine': 'wine',
      'Champagne': 'champagne',
      'Wild': 'wild'
    };
    return typeMap[type] || 'ale';
  }

  mapYeastForm(form) {
    const formMap = {
      'Liquid': 'liquid',
      'Dry': 'dry',
      'Slant': 'slant',
      'Culture': 'culture'
    };
    return formMap[form] || 'liquid';
  }

  mapFlocculation(floc) {
    const flocMap = {
      'Low': 'low',
      'Medium': 'medium',
      'Medium-Low': 'medium',
      'Medium-High': 'medium',
      'High': 'high',
      'Very High': 'very high'
    };
    return flocMap[floc] || 'medium';
  }

  mapMiscType(type) {
    if (!type) return 'other'; // Default fallback
    
    // Only standardize common categories, preserve descriptive types
    const standardizedMap = {
      'Water Agent': 'water agent',
      'Other': 'other'
    };
    
    // If it's a term that needs standardization, use the mapping
    if (standardizedMap[type]) {
      return standardizedMap[type];
    }
    
    // Otherwise, preserve the original description with lowercase formatting
    return type.toLowerCase();
  }

  mapMiscUnit(unit) {
    const unitMap = {
      'kg': 'kg',
      'g': 'g',
      'oz': 'oz',
      'lb': 'lb',
      'tsp': 'tsp',
      'tbsp': 'tbsp',
      'l': 'l',
      'ml': 'ml',
      'each': 'each'
    };
    return unitMap[unit] || 'g';
  }

  mapMiscUse(use) {
    if (!use) return 'add_to_boil'; // Default fallback
    
    // BeerJSON 1.0 requires specific timing use enums
    const useMap = {
      'Mash': 'add_to_mash',
      'Boil': 'add_to_boil',
      'Fermentation': 'add_to_fermentation',
      'Primary': 'add_to_fermentation',
      'Secondary': 'add_to_fermentation',
      'Bottling': 'add_to_package',
      'Packaging': 'add_to_package'
    };
    
    // Try to map common terms, otherwise default to boil
    return useMap[use] || 'add_to_boil';
  }

  mapMashStepType(type) {
    const typeMap = {
      'Infusion': 'infusion',
      'Temperature': 'temperature',
      'Decoction': 'decoction'
    };
    return typeMap[type] || 'infusion';
  }

  mapIBUFormula(formula) {
    const formulaMap = {
      'tinseth': 'Tinseth',
      'rager': 'Rager',
      'garetz': 'Garetz'
    };
    return formulaMap[formula] || 'Tinseth';
  }

  mapStyleType(type) {
    if (!type) return 'beer'; // Default fallback for beer styles
    
    const styleTypeMap = {
      // Beer styles - most Brewfather styles are beer
      'IPA': 'beer',
      'Stout': 'beer', 
      'Porter': 'beer',
      'Lager': 'beer',
      'Ale': 'beer',
      'Wheat': 'beer',
      'Sour': 'beer',
      'Pilsner': 'beer',
      'Belgian': 'beer',
      
      // Other beverage types
      'Cider': 'cider',
      'Mead': 'mead',
      'Wine': 'wine',
      'Kombucha': 'kombucha',
      'Soda': 'soda'
    };
    
    return styleTypeMap[type] || 'beer'; // Default to beer for unrecognized styles
  }

  /**
   * Convert hop time to minutes based on Brewfather timeUnit
   * @param {number} time - Time value
   * @param {string} timeUnit - Time unit ('days', 'minutes', etc.)
   * @returns {number} Time in minutes
   */
  convertHopTime(time, timeUnit) {
    if (!timeUnit) {
      // Default to minutes if no timeUnit specified
      return time;
    }
    
    const lowerUnit = timeUnit.toLowerCase();
    if (lowerUnit === 'days' || lowerUnit === 'day') {
      // Convert days to minutes
      return time * 24 * 60; // 1440 minutes per day
    } else if (lowerUnit === 'hours' || lowerUnit === 'hour' || lowerUnit === 'hr') {
      // Convert hours to minutes
      return time * 60; // 60 minutes per hour
    }
    
    // Default to minutes for other units or if unrecognized
    return time;
  }

}