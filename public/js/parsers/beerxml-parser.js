/**
 * Simplified BeerXML Parser
 * Focuses on core recipe data extraction without over-engineering
 */

import { 
  parseNumber,
  parseString,
  parseRawPercentage,
  getValidString
} from '../utilities/validation/validation-utils.js';
import { RecipeParsingError } from '../utilities/errors/application-errors.js';

class BeerXMLParser {
  constructor() {
    this.supportedVersions = ['1.0'];
  }

  parseFile(xmlContent) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      
      // Check for parsing errors
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        throw new RecipeParsingError('Invalid XML format detected', {
          userMessage: 'The uploaded file is not a valid BeerXML file. Please check the file format.',
          details: { parser: 'BeerXML', phase: 'XML_VALIDATION', error: parserError.textContent }
        });
      }

      // Find the first recipe
      const recipeNode = xmlDoc.querySelector('RECIPE');
      if (!recipeNode) {
        throw new RecipeParsingError('No recipe found in BeerXML file', {
          userMessage: 'The BeerXML file does not contain any recipe data.',
          details: { parser: 'BeerXML', phase: 'RECIPE_DETECTION' }
        });
      }

      return this.parseRecipe(recipeNode);
    } catch (error) {
      // Re-throw RecipeParsingError instances as-is
      if (error instanceof RecipeParsingError) {
        throw error;
      }
      // Wrap other errors in RecipeParsingError
      throw new RecipeParsingError(`Failed to parse BeerXML: ${error.message}`, {
        userMessage: 'Unable to process the BeerXML file. The file may be corrupted or use an unsupported format.',
        details: { parser: 'BeerXML', phase: 'GENERAL_PARSING', originalError: error.message }
      });
    }
  }

  parseRecipe(recipeNode) {
    // Check if this is a Brewfather export
    const isBrewfatherExport = this.isBrewfatherExport(recipeNode);
    
    const recipe = {
      name: this.getElementText(recipeNode, 'NAME'),
      brewer: this.getElementText(recipeNode, 'BREWER'),
      date: this.getElementText(recipeNode, 'DATE'),
      batchSize: this.parseOptionalFloat(recipeNode, 'BATCH_SIZE'),
      boilSize: this.parseOptionalFloat(recipeNode, 'BOIL_SIZE'),
      boilTime: this.parseOptionalFloat(recipeNode, 'BOIL_TIME'),
      efficiency: this.parseOptionalFloat(recipeNode, 'EFFICIENCY'),
      og: this.parseOptionalFloat(recipeNode, 'OG'),
      fg: this.parseOptionalFloat(recipeNode, 'FG'),
      abv: this.parseOptionalFloat(recipeNode, 'ABV'),
      ibu: this.parseOptionalFloat(recipeNode, 'IBU'),
      srm: this.parseOptionalFloat(recipeNode, 'EST_COLOR'),
      carbonation: this.parseOptionalFloat(recipeNode, 'CARBONATION'),
      notes: this.getElementText(recipeNode, 'NOTES'),
      type: this.getElementText(recipeNode, 'TYPE'),
      isBrewfatherExport: isBrewfatherExport,
      style: this.parseStyle(recipeNode),
      ingredients: this.parseIngredients(recipeNode),
      mash: this.parseMash(recipeNode),
      fermentation: this.parseFermentation(recipeNode),
      equipment: this.parseEquipment(recipeNode, isBrewfatherExport)
    };

    // Preserve Brewfather fermentation profile fields at recipe level
    if (recipeNode.querySelector('BF_FERMENTATION_PROFILE_ID') && this.getElementText(recipeNode, 'BF_FERMENTATION_PROFILE_ID') !== '') {
      recipe.BF_FERMENTATION_PROFILE_ID = this.getElementText(recipeNode, 'BF_FERMENTATION_PROFILE_ID');
    }
    if (recipeNode.querySelector('BF_FERMENTATION_PROFILE_NAME') && this.getElementText(recipeNode, 'BF_FERMENTATION_PROFILE_NAME') !== '') {
      recipe.BF_FERMENTATION_PROFILE_NAME = this.getElementText(recipeNode, 'BF_FERMENTATION_PROFILE_NAME');
    }

    return recipe;
  }

  /**
   * Detects if a recipe is exported from Brewfather by checking for Brewfather-specific tags
   * @param {Element} recipeNode - The recipe XML node
   * @returns {boolean} - True if this is a Brewfather export
   */
  isBrewfatherExport(recipeNode) {
    // Check for Brewfather-specific tags more precisely
    const bfTags = [
      'BF_ID',
      'BF_FERMENTATION_PROFILE_ID', 
      'BF_FERMENTATION_PROFILE_NAME'
    ];
    
    return bfTags.some(tag => {
      // Only check for direct child elements to avoid false positives
      return recipeNode.querySelector(tag) !== null;
    });
  }

  parseStyle(recipeNode) {
    const styleNode = recipeNode.querySelector('STYLE');
    if (!styleNode) return null;

    return {
      name: this.getElementText(styleNode, 'NAME'),
      category: this.getElementText(styleNode, 'CATEGORY'),
      categoryNumber: this.getElementText(styleNode, 'CATEGORY_NUMBER'),
      styleLetter: this.getElementText(styleNode, 'STYLE_LETTER'),
      styleGuide: this.getElementText(styleNode, 'STYLE_GUIDE'),
      type: this.getElementText(styleNode, 'TYPE'),
      ogMin: this.parseOptionalFloat(styleNode, 'OG_MIN'),
      ogMax: this.parseOptionalFloat(styleNode, 'OG_MAX'),
      fgMin: this.parseOptionalFloat(styleNode, 'FG_MIN'),
      fgMax: this.parseOptionalFloat(styleNode, 'FG_MAX'),
      ibuMin: this.parseOptionalFloat(styleNode, 'IBU_MIN'),
      ibuMax: this.parseOptionalFloat(styleNode, 'IBU_MAX'),
      colorMin: this.parseOptionalFloat(styleNode, 'COLOR_MIN'),
      colorMax: this.parseOptionalFloat(styleNode, 'COLOR_MAX'),
      abvMin: this.parseOptionalFloat(styleNode, 'ABV_MIN'),
      abvMax: this.parseOptionalFloat(styleNode, 'ABV_MAX'),
      carbMin: this.parseOptionalFloat(styleNode, 'CARB_MIN'),
      carbMax: this.parseOptionalFloat(styleNode, 'CARB_MAX')
    };
  }

  parseIngredients(recipeNode) {
    return {
      fermentables: this.parseFermentables(recipeNode),
      hops: this.parseHops(recipeNode),
      yeasts: this.parseYeasts(recipeNode),
      miscs: this.parseMiscs(recipeNode),
      waters: this.parseWaters(recipeNode)
    };
  }

  parseFermentables(recipeNode) {
    const fermentables = [];
    const fermentableNodes = recipeNode.querySelectorAll('FERMENTABLES > FERMENTABLE');
    
    fermentableNodes.forEach(node => {
      const obj = {};
      if (this.getElementText(node, 'NAME') !== '') obj.name = this.getElementText(node, 'NAME');
      if (this.getElementText(node, 'TYPE') !== '') obj.type = this.getElementText(node, 'TYPE');
      if (node.querySelector('AMOUNT')) obj.amount = parseNumber(this.getElementText(node, 'AMOUNT'));
      if (node.querySelector('YIELD')) obj.yield = parseRawPercentage(this.getElementText(node, 'YIELD'));
      if (node.querySelector('COLOR')) obj.color = parseNumber(this.getElementText(node, 'COLOR'));
      if (node.querySelector('ADD_AFTER_BOIL')) obj.addAfterBoil = this.getElementText(node, 'ADD_AFTER_BOIL').toUpperCase() === 'TRUE';
      if (this.getElementText(node, 'ORIGIN') !== '') obj.origin = this.getElementText(node, 'ORIGIN');
      if (this.getElementText(node, 'SUPPLIER') !== '') obj.supplier = this.getElementText(node, 'SUPPLIER');
      if (node.querySelector('COARSE_FINE_DIFF')) obj.coarseFineDiff = parseRawPercentage(this.getElementText(node, 'COARSE_FINE_DIFF'));
      if (node.querySelector('MOISTURE')) obj.moisture = parseRawPercentage(this.getElementText(node, 'MOISTURE'));
      if (node.querySelector('DIASTATIC_POWER')) obj.diastaticPower = parseNumber(this.getElementText(node, 'DIASTATIC_POWER'));
      if (node.querySelector('PROTEIN')) obj.protein = parseRawPercentage(this.getElementText(node, 'PROTEIN'));
      if (node.querySelector('MAX_IN_BATCH')) obj.maxInBatch = parseRawPercentage(this.getElementText(node, 'MAX_IN_BATCH'));
      if (node.querySelector('RECOMMEND_MASH')) obj.recommendMash = this.getElementText(node, 'RECOMMEND_MASH').toUpperCase() === 'TRUE';
      if (this.getElementText(node, 'NOTES') !== '') obj.notes = this.getElementText(node, 'NOTES');
      
      // Preserve Brewfather BF_ID
      if (node.querySelector('BF_ID') && this.getElementText(node, 'BF_ID') !== '') {
        obj.BF_ID = this.getElementText(node, 'BF_ID');
      }
      
      fermentables.push(obj);
    });
    return fermentables;
  }

  parseHops(recipeNode) {
    const hops = [];
    const hopNodes = recipeNode.querySelectorAll('HOPS > HOP');
    
    hopNodes.forEach(node => {
      const obj = {};
      if (this.getElementText(node, 'NAME') !== '') obj.name = this.getElementText(node, 'NAME');
      if (node.querySelector('ALPHA')) obj.alpha = parseRawPercentage(this.getElementText(node, 'ALPHA'));
      if (node.querySelector('AMOUNT')) obj.amount = parseNumber(this.getElementText(node, 'AMOUNT'));
      if (this.getElementText(node, 'USE') !== '') obj.use = this.getElementText(node, 'USE');
      if (node.querySelector('TIME')) obj.time = parseNumber(this.getElementText(node, 'TIME'));
      if (this.getElementText(node, 'TYPE') !== '') obj.type = this.getElementText(node, 'TYPE');
      if (this.getElementText(node, 'FORM') !== '') obj.form = this.getElementText(node, 'FORM');
      if (this.getElementText(node, 'ORIGIN') !== '') obj.origin = this.getElementText(node, 'ORIGIN');
      if (node.querySelector('BETA')) obj.beta = parseRawPercentage(this.getElementText(node, 'BETA'));
      if (node.querySelector('HSI')) obj.hsi = parseRawPercentage(this.getElementText(node, 'HSI'));
      if (this.getElementText(node, 'NOTES') !== '') obj.notes = this.getElementText(node, 'NOTES');
      if (this.getElementText(node, 'SUBSTITUTES') !== '') obj.substitutes = this.getElementText(node, 'SUBSTITUTES');
      
      // BeerXML hop oil content fields
      if (node.querySelector('HUMULENE')) obj.humulene = parseRawPercentage(this.getElementText(node, 'HUMULENE'));
      if (node.querySelector('CARYOPHYLLENE')) obj.caryophyllene = parseRawPercentage(this.getElementText(node, 'CARYOPHYLLENE'));
      if (node.querySelector('COHUMULONE')) obj.cohumulone = parseRawPercentage(this.getElementText(node, 'COHUMULONE'));
      if (node.querySelector('MYRCENE')) obj.myrcene = parseRawPercentage(this.getElementText(node, 'MYRCENE'));
      
      // Preserve Brewfather BF_ID
      if (node.querySelector('BF_ID') && this.getElementText(node, 'BF_ID') !== '') {
        obj.BF_ID = this.getElementText(node, 'BF_ID');
      }
      
      // Set source format for hop use normalization
      obj.sourceFormat = 'beerxml';
      
      hops.push(obj);
    });
    return hops;
  }

  parseYeasts(recipeNode) {
    const yeasts = [];
    const yeastNodes = recipeNode.querySelectorAll('YEASTS > YEAST');
    
    yeastNodes.forEach(node => {
      const obj = {};
      if (this.getElementText(node, 'NAME') !== '') obj.name = this.getElementText(node, 'NAME');
      if (this.getElementText(node, 'TYPE') !== '') obj.type = this.getElementText(node, 'TYPE');
      if (this.getElementText(node, 'FORM') !== '') obj.form = this.getElementText(node, 'FORM');
      if (node.querySelector('AMOUNT')) obj.amount = parseNumber(this.getElementText(node, 'AMOUNT'));
      if (this.getElementText(node, 'DISPLAY_AMOUNT') !== '') obj.displayAmount = this.getElementText(node, 'DISPLAY_AMOUNT');
      
      // Handle AMOUNT_IS_WEIGHT - only set if explicitly present in XML
      if (node.querySelector('AMOUNT_IS_WEIGHT')) {
        obj.amountIsWeight = this.getElementText(node, 'AMOUNT_IS_WEIGHT').toUpperCase() === 'TRUE';
      }
      
      if (this.getElementText(node, 'LABORATORY') !== '') obj.laboratory = this.getElementText(node, 'LABORATORY');
      if (this.getElementText(node, 'PRODUCT_ID') !== '') obj.productId = this.getElementText(node, 'PRODUCT_ID');
      if (node.querySelector('MIN_TEMPERATURE')) obj.minTemperature = parseNumber(this.getElementText(node, 'MIN_TEMPERATURE'));
      if (node.querySelector('MAX_TEMPERATURE')) obj.maxTemperature = parseNumber(this.getElementText(node, 'MAX_TEMPERATURE'));
      if (node.querySelector('ATTENUATION')) obj.attenuation = parseRawPercentage(this.getElementText(node, 'ATTENUATION'));
      if (this.getElementText(node, 'NOTES') !== '') obj.notes = this.getElementText(node, 'NOTES');
      
      // Preserve Brewfather BF_ID
      if (node.querySelector('BF_ID') && this.getElementText(node, 'BF_ID') !== '') {
        obj.BF_ID = this.getElementText(node, 'BF_ID');
      }
      
      yeasts.push(obj);
    });
    return yeasts;
  }

  parseMiscs(recipeNode) {
    const miscs = [];
    const miscNodes = recipeNode.querySelectorAll('MISCS > MISC');
    
    miscNodes.forEach(node => {
      const obj = {};
      if (this.getElementText(node, 'NAME') !== '') obj.name = this.getElementText(node, 'NAME');
      if (this.getElementText(node, 'TYPE') !== '') obj.type = this.getElementText(node, 'TYPE');
      if (this.getElementText(node, 'USE') !== '') obj.use = this.getElementText(node, 'USE');
      if (node.querySelector('TIME')) obj.time = parseNumber(this.getElementText(node, 'TIME'));
      if (node.querySelector('AMOUNT')) obj.amount = parseNumber(this.getElementText(node, 'AMOUNT'));
      if (this.getElementText(node, 'DISPLAY_AMOUNT') !== '') obj.displayAmount = this.getElementText(node, 'DISPLAY_AMOUNT');
      if (node.querySelector('AMOUNT_IS_WEIGHT')) obj.amountIsWeight = this.getElementText(node, 'AMOUNT_IS_WEIGHT').toUpperCase() === 'TRUE';
      if (this.getElementText(node, 'USE_FOR') !== '') obj.useFor = this.getElementText(node, 'USE_FOR');
      if (this.getElementText(node, 'NOTES') !== '') obj.notes = this.getElementText(node, 'NOTES');
      
      // Preserve Brewfather BF_ID
      if (node.querySelector('BF_ID') && this.getElementText(node, 'BF_ID') !== '') {
        obj.BF_ID = this.getElementText(node, 'BF_ID');
      }
      
      miscs.push(obj);
    });
    return miscs;
  }

  parseWaters(recipeNode) {
    const waters = [];
    const waterNodes = recipeNode.querySelectorAll('WATERS > WATER');
    
    waterNodes.forEach(node => {
      const obj = {};
      if (this.getElementText(node, 'NAME') !== '') obj.name = this.getElementText(node, 'NAME');
      if (node.querySelector('AMOUNT')) obj.amount = parseNumber(this.getElementText(node, 'AMOUNT'));
      if (node.querySelector('CALCIUM')) obj.calcium = parseNumber(this.getElementText(node, 'CALCIUM'));
      if (node.querySelector('BICARBONATE')) obj.bicarbonate = parseNumber(this.getElementText(node, 'BICARBONATE'));
      if (node.querySelector('SULFATE')) obj.sulfate = parseNumber(this.getElementText(node, 'SULFATE'));
      if (node.querySelector('CHLORIDE')) obj.chloride = parseNumber(this.getElementText(node, 'CHLORIDE'));
      if (node.querySelector('SODIUM')) obj.sodium = parseNumber(this.getElementText(node, 'SODIUM'));
      if (node.querySelector('MAGNESIUM')) obj.magnesium = parseNumber(this.getElementText(node, 'MAGNESIUM'));
      if (node.querySelector('PH')) obj.ph = parseNumber(this.getElementText(node, 'PH'));
      if (this.getElementText(node, 'NOTES') !== '') obj.notes = this.getElementText(node, 'NOTES');
      waters.push(obj);
    });
    return waters;
  }

  parseMash(recipeNode) {
    const mashNode = recipeNode.querySelector('MASH');
    if (!mashNode) return null;

    const mash = {};
    if (this.getElementText(mashNode, 'NAME') !== '') mash.name = this.getElementText(mashNode, 'NAME');
    if (mashNode.querySelector('GRAIN_TEMP')) mash.grainTemp = parseNumber(this.getElementText(mashNode, 'GRAIN_TEMP'));
    if (mashNode.querySelector('TUN_TEMP')) mash.tunTemp = parseNumber(this.getElementText(mashNode, 'TUN_TEMP'));
    if (mashNode.querySelector('SPARGE_TEMP')) mash.spargeTemp = parseNumber(this.getElementText(mashNode, 'SPARGE_TEMP'));
    // NOTE: In BeerXML spec, the PH field represents sparge water pH, not mash pH
    if (mashNode.querySelector('PH')) mash.ph = parseNumber(this.getElementText(mashNode, 'PH'));
    if (mashNode.querySelector('TUN_WEIGHT')) mash.tunWeight = parseNumber(this.getElementText(mashNode, 'TUN_WEIGHT'));
    if (mashNode.querySelector('TUN_SPECIFIC_HEAT')) mash.tunSpecificHeat = parseNumber(this.getElementText(mashNode, 'TUN_SPECIFIC_HEAT'));
    if (mashNode.querySelector('EQUIP_ADJUST')) mash.equipAdjust = this.getElementText(mashNode, 'EQUIP_ADJUST').toUpperCase() === 'TRUE';
    if (mashNode.querySelector('NOTES') && this.getElementText(mashNode, 'NOTES') !== '') mash.notes = this.getElementText(mashNode, 'NOTES');
    mash.steps = this.parseMashSteps(mashNode);
    return mash;
  }

  parseMashSteps(mashNode) {
    const steps = [];
    const stepNodes = mashNode.querySelectorAll('MASH_STEPS > MASH_STEP');
    
    stepNodes.forEach(node => {
      const obj = {};
      if (this.getElementText(node, 'NAME') !== '') obj.name = this.getElementText(node, 'NAME');
      if (this.getElementText(node, 'TYPE') !== '') obj.type = this.getElementText(node, 'TYPE');
      if (node.querySelector('INFUSE_AMOUNT')) obj.infuseAmount = parseNumber(this.getElementText(node, 'INFUSE_AMOUNT'));
      if (node.querySelector('STEP_TEMP')) obj.stepTemp = parseNumber(this.getElementText(node, 'STEP_TEMP'));
      if (node.querySelector('STEP_TIME')) obj.stepTime = parseNumber(this.getElementText(node, 'STEP_TIME'));
      if (node.querySelector('RAMP_TIME')) obj.rampTime = parseNumber(this.getElementText(node, 'RAMP_TIME'));
      if (node.querySelector('END_TEMP')) obj.endTemp = parseNumber(this.getElementText(node, 'END_TEMP'));
      if (this.getElementText(node, 'DESCRIPTION') !== '') obj.description = this.getElementText(node, 'DESCRIPTION');
      if (node.querySelector('WATER_GRAIN_RATIO')) obj.waterGrainRatio = parseNumber(this.getElementText(node, 'WATER_GRAIN_RATIO'));
      if (node.querySelector('DECOCTION_AMT')) obj.decoctionAmt = parseNumber(this.getElementText(node, 'DECOCTION_AMT'));
      if (node.querySelector('INFUSE_TEMP')) obj.infuseTemp = parseNumber(this.getElementText(node, 'INFUSE_TEMP'));
      steps.push(obj);
    });
    return steps;
  }

  parseFermentation(recipeNode) {
    // BeerXML 1.0 doesn't have detailed fermentation schedules
    // Extract basic fermentation info from recipe level
    const fermentation = {};
    if (recipeNode.querySelector('PRIMARY_AGE')) fermentation.primaryAge = parseNumber(this.getElementText(recipeNode, 'PRIMARY_AGE'));
    if (recipeNode.querySelector('PRIMARY_TEMP')) fermentation.primaryTemp = parseNumber(this.getElementText(recipeNode, 'PRIMARY_TEMP'));
    if (recipeNode.querySelector('SECONDARY_AGE')) fermentation.secondaryAge = parseNumber(this.getElementText(recipeNode, 'SECONDARY_AGE'));
    if (recipeNode.querySelector('SECONDARY_TEMP')) fermentation.secondaryTemp = parseNumber(this.getElementText(recipeNode, 'SECONDARY_TEMP'));
    if (recipeNode.querySelector('TERTIARY_AGE')) fermentation.tertiaryAge = parseNumber(this.getElementText(recipeNode, 'TERTIARY_AGE'));
    if (recipeNode.querySelector('TERTIARY_TEMP')) fermentation.tertiaryTemp = parseNumber(this.getElementText(recipeNode, 'TERTIARY_TEMP'));
    if (recipeNode.querySelector('AGE')) fermentation.age = parseNumber(this.getElementText(recipeNode, 'AGE'));
    if (recipeNode.querySelector('AGE_TEMP')) fermentation.ageTemp = parseNumber(this.getElementText(recipeNode, 'AGE_TEMP'));
    if (recipeNode.querySelector('FERMENTATION_STAGES')) fermentation.fermentationStages = parseNumber(this.getElementText(recipeNode, 'FERMENTATION_STAGES'));
    if (recipeNode.querySelector('BF_FERMENTATION_PROFILE_NAME')) fermentation.profileName = this.getElementText(recipeNode, 'BF_FERMENTATION_PROFILE_NAME');
    if (recipeNode.querySelector('CARBONATION')) fermentation.carbonation = parseNumber(this.getElementText(recipeNode, 'CARBONATION'));
    return fermentation;
  }

  parseEquipment(recipeNode, isBrewfatherExport = false) {
    const equipmentNode = recipeNode.querySelector('EQUIPMENT');
    if (!equipmentNode) return null;

    const lauterDeadspaceValue = equipmentNode.querySelector('LAUTER_DEADSPACE') ? parseNumber(this.getElementText(equipmentNode, 'LAUTER_DEADSPACE')) : undefined;
    const equipment = {};
    if (this.getElementText(equipmentNode, 'NAME') !== '') equipment.name = this.getElementText(equipmentNode, 'NAME');
    if (equipmentNode.querySelector('BOIL_SIZE')) equipment.boilSize = parseNumber(this.getElementText(equipmentNode, 'BOIL_SIZE'));
    if (equipmentNode.querySelector('BATCH_SIZE')) equipment.batchSize = parseNumber(this.getElementText(equipmentNode, 'BATCH_SIZE'));
    if (equipmentNode.querySelector('TUN_VOLUME')) equipment.tunVolume = parseNumber(this.getElementText(equipmentNode, 'TUN_VOLUME'));
    if (equipmentNode.querySelector('TUN_WEIGHT')) equipment.tunWeight = parseNumber(this.getElementText(equipmentNode, 'TUN_WEIGHT'));
    if (equipmentNode.querySelector('TUN_SPECIFIC_HEAT')) equipment.tunSpecificHeat = parseNumber(this.getElementText(equipmentNode, 'TUN_SPECIFIC_HEAT'));
    if (equipmentNode.querySelector('TOP_UP_WATER')) equipment.topUpWater = parseNumber(this.getElementText(equipmentNode, 'TOP_UP_WATER'));
    if (equipmentNode.querySelector('TRUB_CHILLER_LOSS')) equipment.trubChillerLoss = parseNumber(this.getElementText(equipmentNode, 'TRUB_CHILLER_LOSS'));
    if (equipmentNode.querySelector('EVAP_RATE')) equipment.evapRate = parseRawPercentage(this.getElementText(equipmentNode, 'EVAP_RATE'));
    if (equipmentNode.querySelector('BOIL_TIME')) equipment.boilTime = parseNumber(this.getElementText(equipmentNode, 'BOIL_TIME'));
    if (equipmentNode.querySelector('CALC_BOIL_VOLUME')) equipment.calcBoilVolume = this.getElementText(equipmentNode, 'CALC_BOIL_VOLUME').toUpperCase() === 'TRUE';
    if (equipmentNode.querySelector('TOP_UP_KETTLE')) equipment.topUpKettle = parseNumber(this.getElementText(equipmentNode, 'TOP_UP_KETTLE'));
    if (equipmentNode.querySelector('HOP_UTILIZATION')) equipment.hopUtilization = parseRawPercentage(this.getElementText(equipmentNode, 'HOP_UTILIZATION'));
    if (equipmentNode.querySelector('NOTES') && this.getElementText(equipmentNode, 'NOTES') !== '') equipment.notes = this.getElementText(equipmentNode, 'NOTES');
    if (isBrewfatherExport) {
      if (lauterDeadspaceValue !== undefined) equipment.mashTunDeadspace = lauterDeadspaceValue;
      equipment.lauterDeadspace = 0;
      equipment.brewfatherNote = 'LAUTER_DEADSPACE interpreted as Mash Tun Deadspace (recoverable volume)';
    } else {
      if (lauterDeadspaceValue !== undefined) equipment.lauterDeadspace = lauterDeadspaceValue;
      equipment.mashTunDeadspace = 0;
    }
    return equipment;
  }

  getElementText(parentNode, tagName) {
    const element = parentNode.querySelector(tagName);
    if (!element) {
      return undefined;
    }
    const rawValue = element.textContent;
    const trimmed = getValidString(rawValue, '', { trim: true });
    return trimmed === '' ? undefined : trimmed;
  }

  parseOptionalFloat(parentNode, tagName) {
    const element = parentNode.querySelector(tagName);
    if (!element) {
      return undefined;
    }
    
    const rawValue = element.textContent;
    const trimmed = parseString(rawValue, { trim: true, allowEmpty: false });
    if (trimmed === undefined) {
      return undefined;
    }
    
    return parseNumber(trimmed);
  }
}

export { BeerXMLParser };