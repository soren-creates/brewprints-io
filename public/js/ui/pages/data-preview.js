/**
 * Data Preview Component
 * Shows a condensed list of all recipe fields with their availability status
 * Now supports both BeerXML and BeerJSON field analysis
 */

import { 
  isValidArray, 
  isValidString 
} from '../../utilities/validation/validation-utils.js';

class DataPreview {
  constructor() {
    // Fields that are not yet implemented in the recipe view
    // Add field paths here to mark them with 🚧 in the data preview
    // Organized to match the section order: basicInfo, styleDetails, fermentables, 
    // hops, yeast, miscellaneous, water, mash, equipment
    this.unimplementedFields = new Set([
      // === Basic Information Section ===
      // Basic fields not displayed
      'coauthor',
      'description',
      // BeerJSON additional efficiency fields (mash/brewhouse efficiency ARE displayed in Brew Day Measurements)
      'efficiency.conversion',
      'efficiency.lauter',
      // efficiency.mash is NOT here because Mash Efficiency IS displayed
      // BeerJSON additional recipe fields
      'beer_pH',
      'calories_per_pint',
      'apparent_attenuation',
      
      // === Style Information Section ===
      // Style category/letter/guide fields (not displayed)
      'style.category',
      'style.categoryNumber',
      'style.styleLetter',
      'style.styleGuide',
      'style.type',
      // BeerJSON enhanced style descriptive fields
      'style.aroma',
      'style.appearance',
      'style.flavor',
      'style.mouthfeel',
      'style.overall_impression',
      'style.ingredients',
      'style.examples',
      
      // === Fermentables Section ===
      // Basic fermentable fields not displayed
      'fermentable.type',
      'fermentable.yield',
      'fermentable.origin',
      'fermentable.coarseFineDiff',
      'fermentable.moisture',
      'fermentable.diastaticPower',
      'fermentable.protein',
      'fermentable.maxInBatch',
      'fermentable.recommendMash',
      'fermentable.addAfterBoil',
      'fermentable.notes',
      // BeerJSON additional fields
      'fermentable.kolbach_index',
      'fermentable.friability',
      'fermentable.di_ph',
      'fermentable.fan',
      'fermentable.fermentability',
      
      // === Hops Section ===
      // Basic hop fields not displayed
      'hop.type',
      'hop.beta',
      'hop.hsi',
      'hop.humulene',
      'hop.caryophyllene',
      'hop.cohumulone',
      'hop.myrcene',
      'hop.notes',
      // BeerJSON additional fields
      'hop.producer',
      'hop.product_id',
      'hop.year',
      'hop.percent_lost',
      // BeerJSON extended hop oil content
      'hop.oil_content.farnesene',
      'hop.oil_content.linalool',
      'hop.oil_content.limonene',
      'hop.oil_content.nerol',
      'hop.oil_content.pinene',
      'hop.oil_content.other_oils',
      'hop.oil_total',
      'hop.substitutes',
      
      // === Yeast & Cultures Section ===
      // Basic yeast fields not displayed
      'yeast.form',
      'yeast.notes',
      // BeerJSON enhanced fields
      'culture.temperature_range.min',
      'culture.temperature_range.max',
      'culture.alcohol_tolerance',
      'culture.flocculation',
      'culture.best_for',
      'culture.pof',
      'culture.glucoamylase',
      
      // === Miscellaneous Section ===
      // Basic misc fields not displayed
      'misc.notes',
      // BeerJSON additional fields
      'misc.producer',
      'misc.product_id',
      
      // === Water Chemistry Section ===
      // Basic water fields not displayed
      'water.name',
      'water.amount',
      'water.notes',
      // BeerJSON additional fields
      'water.producer',
      'water.carbonate',
      'water.potassium',
      'water.iron',
      'water.nitrate',
      'water.nitrite',
      'water.fluoride',
      
      // === Mash Procedure Section ===
      // Basic mash fields not displayed
      'mash.grainTemp',
      'mash.spargeTemp',
      'mash.notes',
      'mashStep.description',
      'mashStep.waterGrainRatio',
      // Note: mash.ph (sparge pH in BeerXML) and mash.mashPH/mashStep pH are now displayed
      // Note: mashStep.start_ph and mashStep.end_ph are now supported for BeerJSON
      
      // === Equipment Section ===
      // Basic equipment fields not displayed (some are used in calculations but not displayed as equipment info)
      'equipment.name',
      'equipment.batchSize',
      'equipment.boilSize',
      'equipment.tunWeight',
      'equipment.tunSpecificHeat',
      'equipment.boilTime',
      'equipment.calcBoilVolume',
      'equipment.hopUtilization',
      'equipment.notes',
      // BeerJSON equipment fields
      'equipment.items'
    ]);

    // Comprehensive field definitions supporting both BeerXML and BeerJSON
    this.fieldDefinitions = {
      // Basic Recipe Information
      basicInfo: {
        title: 'Basic Information',
        fields: {
          'name':           { label: 'Recipe Name', beerXml: true, beerJson: true, required: true },
          'type':           { label: 'Recipe Type', beerXml: true, beerJson: true, required: true },
          'brewer':         { label: 'Brewer/Author', beerXml: true, beerJson: true, required: true }, // BeerXML: brewer, BeerJSON: author
          'coauthor':       { label: 'Co-Author', beerXml: false, beerJson: true },
          'description':    { label: 'Description', beerXml: false, beerJson: true },
          'date':           { label: 'Date', beerXml: true, beerJson: true }, // BeerXML: date, BeerJSON: created
          'batchSize':      { label: 'Batch Size', beerXml: true, beerJson: true, required: true }, // BeerXML: batchSize, BeerJSON: batch_size
          'boilSize':       { label: 'Boil Size', beerXml: true, beerJson: true, required: true }, // BeerXML: boilSize, BeerJSON: pre_boil_size
          'boilTime':       { label: 'Boil Time', beerXml: true, beerJson: true, required: true }, // BeerXML: boilTime, BeerJSON: boil_time
          'efficiency':     { label: 'Efficiency %', beerXml: true, beerJson: true, requiredForBeerJson: true }, // BeerXML: efficiency, BeerJSON: efficiency.brewhouse
          'og':             { label: 'Original Gravity', beerXml: true, beerJson: true },
          'fg':             { label: 'Final Gravity', beerXml: true, beerJson: true },
          'abv':            { label: 'ABV %', beerXml: true, beerJson: true },
          'ibu':            { label: 'IBU', beerXml: true, beerJson: true },
          'srm':            { label: 'Color (SRM)', beerXml: true, beerJson: true },
          'notes':          { label: 'Recipe Notes', beerXml: true, beerJson: true },
          // BeerJSON additional efficiency fields
          'efficiency.conversion': { label: 'Conversion Efficiency %', beerXml: false, beerJson: true },
          'efficiency.lauter':     { label: 'Lauter Efficiency %', beerXml: false, beerJson: true },
          'efficiency.mash':       { label: 'Mash Efficiency %', beerXml: false, beerJson: true },
          // BeerJSON additional recipe fields
          'beer_pH':        { label: 'Final Beer pH', beerXml: false, beerJson: true },
          'calories_per_pint': { label: 'Calories per Pint', beerXml: false, beerJson: true },
          'apparent_attenuation': { label: 'Apparent Attenuation %', beerXml: false, beerJson: true }
        }
      },

      // Style Information
      styleDetails: {
        title: 'Style Information', 
        fields: {
          'style.name':           { label: 'Style Name', beerXml: true, beerJson: true, required: true },
          'style.category':       { label: 'Category', beerXml: true, beerJson: true },
          'style.categoryNumber': { label: 'Category Number', beerXml: true, beerJson: true },
          'style.styleLetter':    { label: 'Style Letter', beerXml: true, beerJson: true },
          'style.styleGuide':     { label: 'Style Guide', beerXml: true, beerJson: true },
          'style.type':           { label: 'Style Type', beerXml: true, beerJson: true },
          'style.ogMin':          { label: 'OG Min', beerXml: true, beerJson: true },
          'style.ogMax':          { label: 'OG Max', beerXml: true, beerJson: true },
          'style.fgMin':          { label: 'FG Min', beerXml: true, beerJson: true },
          'style.fgMax':          { label: 'FG Max', beerXml: true, beerJson: true },
          'style.ibuMin':         { label: 'IBU Min', beerXml: true, beerJson: true },
          'style.ibuMax':         { label: 'IBU Max', beerXml: true, beerJson: true },
          'style.colorMin':       { label: 'Color Min', beerXml: true, beerJson: true },
          'style.colorMax':       { label: 'Color Max', beerXml: true, beerJson: true },
          'style.abvMin':         { label: 'ABV Min', beerXml: true, beerJson: true },
          'style.abvMax':         { label: 'ABV Max', beerXml: true, beerJson: true },
          'style.carbMin':        { label: 'Carbonation Min', beerXml: true, beerJson: true },
          'style.carbMax':        { label: 'Carbonation Max', beerXml: true, beerJson: true },
          // BeerJSON enhanced style descriptive fields
          'style.aroma':            { label: 'Aroma Description', beerXml: false, beerJson: true },
          'style.appearance':       { label: 'Appearance', beerXml: false, beerJson: true },
          'style.flavor':           { label: 'Flavor Description', beerXml: false, beerJson: true },
          'style.mouthfeel':        { label: 'Mouthfeel', beerXml: false, beerJson: true },
          'style.overall_impression': { label: 'Overall Impression', beerXml: false, beerJson: true },
          'style.ingredients':      { label: 'Typical Ingredients', beerXml: false, beerJson: true },
          'style.examples':         { label: 'Style Examples', beerXml: false, beerJson: true }
        }
      },

      // Fermentables - Enhanced for BeerJSON
      fermentables: {
        title: 'Fermentables',
        fields: {
          'ingredients.fermentables':       { label: 'Fermentables List', beerXml: true, beerJson: true, isArray: true, required: true },
          'fermentable.name':               { label: 'Name', beerXml: true, beerJson: true, required: true },
          'fermentable.amount':             { label: 'Amount', beerXml: true, beerJson: true, required: true },
          'fermentable.type':               { label: 'Type', beerXml: true, beerJson: true, required: true },
          'fermentable.color':              { label: 'Color', beerXml: true, beerJson: true, required: true },
          'fermentable.yield':              { label: 'Yield %', beerXml: true, beerJson: true, required: true },
          'fermentable.origin':             { label: 'Origin', beerXml: true, beerJson: true },
          'fermentable.supplier':           { label: 'Supplier/Producer', beerXml: true, beerJson: true },
          'fermentable.coarseFineDiff':     { label: 'Coarse Fine Diff', beerXml: true, beerJson: true },
          'fermentable.moisture':           { label: 'Moisture %', beerXml: true, beerJson: true },
          'fermentable.diastaticPower':     { label: 'Diastatic Power', beerXml: true, beerJson: true },
          'fermentable.protein':            { label: 'Protein %', beerXml: true, beerJson: true },
          'fermentable.maxInBatch':         { label: 'Max in Batch %', beerXml: true, beerJson: true },
          'fermentable.recommendMash':      { label: 'Recommend Mash', beerXml: true, beerJson: true },
          'fermentable.addAfterBoil':       { label: 'Add After Boil', beerXml: true, beerJson: true },
          'fermentable.maxInBatch':         { label: 'Max In Batch %', beerXml: true, beerJson: true },
          'fermentable.notes':              { label: 'Notes', beerXml: true, beerJson: true },
          // BeerJSON additional fields
          'fermentable.kolbach_index':      { label: 'Kolbach Index', beerXml: false, beerJson: true },
          'fermentable.friability':         { label: 'Friability %', beerXml: false, beerJson: true },
          'fermentable.di_ph':              { label: 'Distilled Water pH', beerXml: false, beerJson: true },
          'fermentable.fan':                { label: 'Free Amino Nitrogen', beerXml: false, beerJson: true },
          'fermentable.fermentability':     { label: 'Fermentability %', beerXml: false, beerJson: true }
        }
      },

      // Hops - Enhanced for BeerJSON
      hops: {
        title: 'Hops',
        fields: {
          'ingredients.hops':       { label: 'Hops List', beerXml: true, beerJson: true, isArray: true },
          'hop.name':               { label: 'Name', beerXml: true, beerJson: true, required: true },
          'hop.amount':             { label: 'Amount', beerXml: true, beerJson: true, required: true },
          'hop.alpha':              { label: 'Alpha Acid %', beerXml: true, beerJson: true, required: true },
          'hop.use':                { label: 'Use', beerXml: true, beerJson: true, required: true },
          'hop.time':               { label: 'Time', beerXml: true, beerJson: true, required: true },
          'hop.form':               { label: 'Form', beerXml: true, beerJson: true },
          'hop.type':               { label: 'Type', beerXml: true, beerJson: true }, // BeerXML: type (bittering, aroma, etc.)
          'hop.origin':             { label: 'Origin', beerXml: true, beerJson: true },
          'hop.beta':               { label: 'Beta Acid %', beerXml: true, beerJson: true }, // BeerXML has beta field
          'hop.hsi':                { label: 'Hop Storage Index', beerXml: true, beerJson: true }, // BeerXML has hsi field
          'hop.humulene':           { label: 'Humulene %', beerXml: true, beerJson: true },
          'hop.caryophyllene':      { label: 'Caryophyllene %', beerXml: true, beerJson: true },
          'hop.cohumulone':         { label: 'Cohumulone %', beerXml: true, beerJson: true },
          'hop.myrcene':            { label: 'Myrcene %', beerXml: true, beerJson: true },
          'hop.notes':              { label: 'Notes', beerXml: true, beerJson: true },
          // BeerJSON additional fields
          'hop.producer':           { label: 'Producer', beerXml: false, beerJson: true },
          'hop.product_id':         { label: 'Product ID', beerXml: false, beerJson: true },
          'hop.year':               { label: 'Harvest Year', beerXml: false, beerJson: true },
          'hop.percent_lost':       { label: 'Storage Loss % (6mo)', beerXml: false, beerJson: true },
          // BeerJSON extended hop oil content
          'hop.oil_content.farnesene':    { label: 'Farnesene %', beerXml: false, beerJson: true },
          'hop.oil_content.linalool':     { label: 'Linalool %', beerXml: false, beerJson: true },
          'hop.oil_content.limonene':     { label: 'Limonene %', beerXml: false, beerJson: true },
          'hop.oil_content.nerol':        { label: 'Nerol %', beerXml: false, beerJson: true },
          'hop.oil_content.pinene':       { label: 'Pinene %', beerXml: false, beerJson: true },
          'hop.oil_content.other_oils':   { label: 'Other Oils %', beerXml: false, beerJson: true },
          'hop.oil_total':                { label: 'Total Oil ml/100g', beerXml: false, beerJson: true },
          'hop.substitutes':              { label: 'Substitutes', beerXml: false, beerJson: true }
        }
      },

      // Yeast/Cultures - Enhanced for BeerJSON  
      yeast: {
        title: 'Yeast & Cultures',
        fields: {
          'ingredients.yeasts':             { label: 'Yeast/Cultures List', beerXml: true, beerJson: true, isArray: true }, // BeerXML: yeasts, BeerJSON: cultures
          'yeast.name':                     { label: 'Name', beerXml: true, beerJson: true, required: true },
          'yeast.amount':                   { label: 'Amount', beerXml: true, beerJson: true, required: true },
          'yeast.type':                     { label: 'Type', beerXml: true, beerJson: true, required: true },
          'yeast.form':                     { label: 'Form', beerXml: true, beerJson: true, required: true },
          'yeast.laboratory':               { label: 'Laboratory/Producer', beerXml: true, beerJson: true },
          'yeast.productId':                { label: 'Product ID', beerXml: true, beerJson: true },
          'yeast.attenuation':              { label: 'Attenuation %', beerXml: true, beerJson: true },
          'yeast.notes':                    { label: 'Notes', beerXml: true, beerJson: true },
          // BeerJSON enhanced fields
          'culture.temperature_range.min':  { label: 'Min Temperature', beerXml: false, beerJson: true },
          'culture.temperature_range.max':  { label: 'Max Temperature', beerXml: false, beerJson: true },
          'culture.alcohol_tolerance':      { label: 'Alcohol Tolerance %', beerXml: false, beerJson: true },
          'culture.flocculation':           { label: 'Flocculation', beerXml: false, beerJson: true },
          'culture.best_for':               { label: 'Best For Styles', beerXml: false, beerJson: true },
          'culture.pof':                    { label: 'POF+ (Phenol Producer)', beerXml: false, beerJson: true },
          'culture.glucoamylase':           { label: 'Glucoamylase+', beerXml: false, beerJson: true }
        }
      },

      // Miscellaneous Ingredients - Enhanced for BeerJSON
      miscellaneous: {
        title: 'Miscellaneous',
        fields: {
          'ingredients.miscs':      { label: 'Misc List', beerXml: true, beerJson: true, isArray: true },
          'misc.name':              { label: 'Name', beerXml: true, beerJson: true, required: true },
          'misc.amount':            { label: 'Amount', beerXml: true, beerJson: true, required: true },
          'misc.type':              { label: 'Type', beerXml: true, beerJson: true, required: true },
          'misc.use':               { label: 'Use', beerXml: true, beerJson: true, required: true },
          'misc.time':              { label: 'Time', beerXml: true, beerJson: true },
          'misc.notes':             { label: 'Notes', beerXml: true, beerJson: true },
          // BeerJSON additional fields
          'misc.producer':          { label: 'Producer', beerXml: false, beerJson: true },
          'misc.product_id':        { label: 'Product ID', beerXml: false, beerJson: true }
        }
      },

      // Water Chemistry - Enhanced for BeerJSON
      water: {
        title: 'Water Chemistry',
        fields: {
          'ingredients.waters':     { label: 'Water List', beerXml: true, beerJson: true, isArray: true },
          'water.name':             { label: 'Water Name', beerXml: true, beerJson: true, required: true },
          'water.amount':           { label: 'Amount', beerXml: true, beerJson: true },
          'water.calcium':          { label: 'Calcium (Ca²⁺)', beerXml: true, beerJson: true, required: true },
          'water.bicarbonate':      { label: 'Bicarbonate (HCO₃⁻)', beerXml: true, beerJson: true, required: true },
          'water.sulfate':          { label: 'Sulfate (SO₄²⁻)', beerXml: true, beerJson: true, required: true },
          'water.chloride':         { label: 'Chloride (Cl⁻)', beerXml: true, beerJson: true, required: true },
          'water.sodium':           { label: 'Sodium (Na⁺)', beerXml: true, beerJson: true, required: true },
          'water.magnesium':        { label: 'Magnesium (Mg²⁺)', beerXml: true, beerJson: true, required: true },
          'water.ph':               { label: 'Water pH', beerXml: true, beerJson: true },
          'water.notes':            { label: 'Notes', beerXml: true, beerJson: true },
          // BeerJSON additional fields
          'water.producer':         { label: 'Producer', beerXml: false, beerJson: true },
          'water.carbonate':        { label: 'Carbonate (CO₃²⁻)', beerXml: false, beerJson: true },
          'water.potassium':        { label: 'Potassium (K⁺)', beerXml: false, beerJson: true },
          'water.iron':             { label: 'Iron (Fe)', beerXml: false, beerJson: true },
          'water.nitrate':          { label: 'Nitrate (NO₃⁻)', beerXml: false, beerJson: true },
          'water.nitrite':          { label: 'Nitrite (NO₂⁻)', beerXml: false, beerJson: true },
          'water.fluoride':         { label: 'Fluoride (F⁻)', beerXml: false, beerJson: true }
        }
      },

      // Mash Procedure - Enhanced for BeerJSON
      mash: {
        title: 'Mash Procedure',
        fields: {
          'mash.name':              { label: 'Mash Name', beerXml: true, beerJson: true },
          'mash.grainTemp':         { label: 'Grain Temperature', beerXml: true, beerJson: true }, // BeerXML: grainTemp, BeerJSON: grain_temp
          'mash.mashStepPh':        { label: 'Mash pH', beerXml: true, beerJson: true }, // Virtual field: BeerXML mash.mashPH or BeerJSON saccharification step pH
          'mash.spargeStepPh':      { label: 'Sparge pH', beerXml: true, beerJson: true }, // Virtual field: BeerXML mash.ph or BeerJSON sparge step pH
          'mash.spargeTemp':        { label: 'Sparge Temperature', beerXml: true, beerJson: true }, // BeerXML: spargeTemp, BeerJSON: MashStepType with type="sparge" step_temperature
          'mash.notes':             { label: 'Mash Notes', beerXml: true, beerJson: true },
          'mash.steps':             { label: 'Mash Steps List', beerXml: true, beerJson: true, isArray: true }, // BeerXML: steps array, BeerJSON: mash_steps
          'mashStep.name':          { label: 'Step Name', beerXml: true, beerJson: true, required: true },
          'mashStep.type':          { label: 'Step Type', beerXml: true, beerJson: true, required: true },
          'mashStep.stepTemp':      { label: 'Step Temperature', beerXml: true, beerJson: true, required: true }, // BeerXML: stepTemp, BeerJSON: temperature
          'mashStep.stepTime':      { label: 'Step Time', beerXml: true, beerJson: true, required: true }, // BeerXML: stepTime, BeerJSON: time
          'mashStep.rampTime':      { label: 'Step Ramp Time', beerXml: true, beerJson: true }, // BeerXML: rampTime
          'mashStep.endTemp':       { label: 'Step End Temperature', beerXml: true, beerJson: true }, // BeerXML: endTemp
          'mashStep.description':   { label: 'Step Description', beerXml: true, beerJson: true },
          'mashStep.waterGrainRatio': { label: 'Step Water:Grain Ratio', beerXml: true, beerJson: true } // BeerXML: WATER_GRAIN_RATIO, BeerJSON: water_grain_ratio
        }
      },

      // Equipment - Enhanced for BeerJSON
      equipment: {
        title: 'Equipment',
        fields: {
          'equipment.name':             { label: 'Equipment Set Name', beerXml: true, beerJson: true },
          'equipment.batchSize':        { label: 'Equipment Batch Size', beerXml: true, beerJson: true }, // BeerXML: batchSize, BeerJSON: fermenter maximum_volume or recipe batch_size
          'equipment.boilSize':         { label: 'Equipment Boil Size', beerXml: true, beerJson: true }, // BeerXML: boilSize, BeerJSON: brew kettle maximum_volume or recipe pre_boil_size
          'equipment.tunVolume':        { label: 'Tun Volume', beerXml: true, beerJson: true }, // BeerXML: tunVolume, BeerJSON: EquipmentBase maximum_volume
          'equipment.tunWeight':        { label: 'Tun Weight', beerXml: true, beerJson: true }, // BeerXML: tunWeight, BeerJSON: EquipmentItemType weight
          'equipment.tunSpecificHeat':  { label: 'Tun Specific Heat', beerXml: true, beerJson: true }, // BeerXML: tunSpecificHeat, BeerJSON: EquipmentItemType specific_heat
          'equipment.trubChillerLoss':  { label: 'Trub Chiller Loss', beerXml: true, beerJson: true }, // BeerXML: trubChillerLoss, BeerJSON: EquipmentItemType loss
          'equipment.evapRate':         { label: 'Evaporation Rate', beerXml: true, beerJson: true }, // BeerXML: evapRate, BeerJSON: EquipmentItemType boil_rate_per_hour
          'equipment.boilTime':         { label: 'Equipment Boil Time', beerXml: true, beerJson: true }, // BeerXML: boilTime, BeerJSON: use recipe boil time
          'equipment.calcBoilVolume':   { label: 'Calc Boil Volume', beerXml: true, beerJson: true }, // BeerXML: calcBoilVolume, BeerJSON: defaults to true
          'equipment.lauterDeadspace':  { label: 'Lauter Deadspace', beerXml: true, beerJson: true }, // BeerXML: lauterDeadspace, BeerJSON: defaults to 0
          'equipment.hopUtilization':   { label: 'Hop Utilization', beerXml: true, beerJson: true }, // BeerXML: hopUtilization, BeerJSON: defaults to 100%
          'equipment.notes':            { label: 'Equipment Notes', beerXml: true, beerJson: true },
          'equipment.items':            { label: 'Equipment Items', beerXml: false, beerJson: true, isArray: true },
          'equipment.topUpKettle':      { label: 'Top Up Kettle', beerXml: true, beerJson: false, brewfatherJson: true }, // BeerXML: topUpKettle, Brewfather: topUpWater
          'equipment.topUpWater':       { label: 'Top Up Water (Top Up Fermenter)', beerXml: true, beerJson: false, brewfatherJson: true } // BeerXML: topUpWater, Brewfather: fermenterTopUp
        }
      }
    };
  }

  /**
   * Check if field requires BeerJSON (not available in BeerXML)
   * @param {Object} field - Field definition
   * @param {string} sourceFormat - The source format ('beerxml', 'beerjson', or 'brewfather')
   * @returns {boolean} True if field requires BeerJSON and source is not BeerJSON-compatible
   */
  requiresBeerJson(field, sourceFormat) {
    // If source is BeerJSON or converted Brewfather (which becomes BeerJSON), no fields "require" BeerJSON
    if (sourceFormat === 'beerjson' || sourceFormat === 'brewfather') {
      return false;
    }
    return !field.beerXml && field.beerJson;
  }

  /**
   * Check if field requires BeerXML (not available in BeerJSON)
   * @param {Object} field - Field definition
   * @param {string} sourceFormat - The source format ('beerxml', 'beerjson', or 'brewfather')
   * @returns {boolean} True if field requires BeerXML and source is BeerJSON-compatible
   */
  requiresBeerXml(field, sourceFormat) {
    // If source is BeerXML, no fields "require" BeerXML
    if (sourceFormat === 'beerxml') {
      return false;
    }
    // Don't catch fields that also support Brewfather JSON (those have their own logic)
    if (field.brewfatherJson) {
      return false;
    }
    return field.beerXml && !field.beerJson;
  }

  /**
   * Check if a field requires BeerXML or Brewfather JSON (not available in pure BeerJSON)
   * @param {Object} field - Field definition
   * @param {string} sourceFormat - The source format ('beerxml', 'beerjson', or 'brewfather')
   * @returns {boolean} True if field requires BeerXML or Brewfather JSON and source is pure BeerJSON
   */
  requiresBeerXmlOrBrewfather(field, sourceFormat) {
    // Only applies to pure BeerJSON files (not BeerXML or Brewfather)
    if (sourceFormat !== 'beerjson') {
      return false;
    }
    return field.beerXml && !field.beerJson && field.brewfatherJson;
  }

  /**
   * Analyze recipe data and return structured analysis
   */
  analyzeRecipeData(data) {
    const analysis = {};
    const sourceFormat = data.sourceFormat || 'beerxml'; // Default to beerxml for backward compatibility
    
    for (const [sectionKey, section] of Object.entries(this.fieldDefinitions)) {
      analysis[sectionKey] = {
        title: section.title,
        fields: {}
      };
      
      for (const [fieldKey, fieldDef] of Object.entries(section.fields)) {
        let status = this.checkFieldStatus(data, fieldKey, fieldDef, sourceFormat);
        
        // Determine if field is dynamically required based on ingredients
        const isDynamicallyRequired = this.isIngredientPropertyRequired(fieldKey, data, fieldDef);
        
        // Override status for ingredient properties when no ingredients of that type exist
        if (this.isIngredientProperty(fieldKey)) {
          const [itemType] = fieldKey.split('.');
          const hasIngredients = this.hasIngredientsOfType(data, itemType);
          
          if (!hasIngredients) {
            // Check if this field requires BeerJSON even when no ingredients exist
            if (this.requiresBeerJson(fieldDef, sourceFormat)) {
              status = 'requires-beerjson';
            } else if (this.requiresBeerXml(fieldDef, sourceFormat)) {
              status = 'requires-beerxml';
            } else if (this.requiresBeerXmlOrBrewfather(fieldDef, sourceFormat)) {
              status = 'requires-beerxml-or-brewfather';
            } else {
              status = 'not-applicable';
            }
          } else if (status === 'missing') {
            // If ingredients exist but field is missing, classify as required/optional
            status = fieldDef.required ? 'missing-required' : 'missing-optional';
          }
        } else if (status === 'missing') {
          // Non-ingredient fields use original logic
          status = fieldDef.required ? 'missing-required' : 'missing-optional';
        }
        
        analysis[sectionKey].fields[fieldKey] = {
          label: fieldDef.label,
          status: status,
          required: isDynamicallyRequired
        };
      }
    }
    
    return analysis;
  }

  /**
   * Check if a field path represents an ingredient property
   */
  isIngredientProperty(fieldPath) {
    return fieldPath.includes('.') && 
      fieldPath.split('.')[0].match(/^(fermentable|hop|yeast|culture|misc|water|mashStep)/);
  }

  hasIngredientsOfType(data, itemType) {
    const arrayPaths = {
      'fermentable': 'ingredients.fermentables',
      'hop': 'ingredients.hops',
      'yeast': 'ingredients.yeasts', // BeerXML uses yeasts
      'culture': 'ingredients.cultures', // BeerJSON uses cultures
      'misc': 'ingredients.miscs',
      'water': 'ingredients.waters',
      'mashStep': 'mash.steps' // BeerXML uses steps array
    };
    
    // For yeast/culture, check both arrays since they're combined in one section
    if (itemType === 'yeast' || itemType === 'culture') {
      const yeastArray = this.getNestedValue(data, 'ingredients.yeasts');
      const cultureArray = this.getNestedValue(data, 'ingredients.cultures');
      return isValidArray(yeastArray, { allowEmpty: false }) || 
             isValidArray(cultureArray, { allowEmpty: false });
    }
    
    const array = this.getNestedValue(data, arrayPaths[itemType]);
    return isValidArray(array, { allowEmpty: false });
  }

  /**
   * Check if ingredient properties should be considered required
   * based on whether ingredients of that type exist in the data
   */
  isIngredientPropertyRequired(fieldPath, data, fieldDef) {
    const sourceFormat = data.sourceFormat || 'beerxml';
    
    // Check format-specific requirements
    if (fieldDef.requiredForBeerJson && (sourceFormat === 'beerjson' || sourceFormat === 'brewfather')) {
      // Required for BeerJSON/Brewfather but not BeerXML
      return true;
    }
    
    // If it's not marked as required in definition, it's never required
    if (!fieldDef.required) return false;
    
    // Handle ingredient field paths (e.g., 'hop.name', 'yeast.type')
    if (fieldPath.includes('.') && fieldPath.split('.')[0].match(/^(fermentable|hop|yeast|culture|misc|water|mashStep)/)) {
      const [itemType] = fieldPath.split('.');
      
      // For yeast/culture, check both arrays since they're combined in one section
      if (itemType === 'yeast' || itemType === 'culture') {
        const yeastArray = this.getNestedValue(data, 'ingredients.yeasts');
        const cultureArray = this.getNestedValue(data, 'ingredients.cultures');
        return (Array.isArray(yeastArray) && yeastArray.length > 0) || 
               (Array.isArray(cultureArray) && cultureArray.length > 0);
      }
      
      const arrayPaths = {
        'fermentable': 'ingredients.fermentables',
        'hop': 'ingredients.hops',
        'misc': 'ingredients.miscs',
        'water': 'ingredients.waters',
        'mashStep': 'mash.steps' // BeerXML uses steps array
      };
      
      const array = this.getNestedValue(data, arrayPaths[itemType]);
      
      // Only required if ingredients of this type exist
      return Array.isArray(array) && array.length > 0;
    }
    
    // Non-ingredient fields use their original required setting
    return fieldDef.required;
  }
  
  /**
   * Check if a field is present, missing, or requires BeerJSON
   * @param {Object} data - Recipe data
   * @param {string} fieldPath - Path to field
   * @param {Object} fieldDef - Field definition
   * @param {string} sourceFormat - Source format ('beerxml' or 'beerjson')
   */
  checkFieldStatus(data, fieldPath, fieldDef, sourceFormat) {
    // Handle special virtual fields
    if (fieldPath === 'mash.mashStepPh') {
      // Check for BeerJSON mash step pH (saccharification steps)
      const mashSteps = this.getNestedValue(data, 'mash.steps');
      if (Array.isArray(mashSteps)) {
        // Look for primary saccharification step (148-158°F range) with pH
        const primaryStepWithPh = mashSteps.find(step => {
          if (step.stepTemp && step.stepTemp >= 148 && step.stepTemp <= 158) {
            return step.start_ph !== undefined || step.end_ph !== undefined || step.pH !== undefined || step.ph !== undefined;
          }
          return false;
        });
        
        if (primaryStepWithPh) {
          return 'present';
        }
        
        // If no primary step found, check first step with pH
        const firstStepWithPh = mashSteps.find(step => 
          step.start_ph !== undefined || step.end_ph !== undefined || step.pH !== undefined || step.ph !== undefined
        );
        if (firstStepWithPh) {
          return 'present';
        }
      }
      
      // Check for BeerXML/invalid BeerJSON mash pH at root level
      const mashPH = this.getNestedValue(data, 'mash.mashPH');
      if (mashPH !== undefined && mashPH !== null && mashPH !== '') {
        return 'present';
      }
      
      const mashRootPh = this.getNestedValue(data, 'mash.pH');
      if (mashRootPh !== undefined && mashRootPh !== null && mashRootPh !== '') {
        return 'present';
      }
      
      return fieldDef.required ? 'missing-required' : 'missing-optional';
    }
    
    if (fieldPath === 'mash.spargeStepPh') {
      // Check for BeerJSON sparge-type mash step with pH
      const mashSteps = this.getNestedValue(data, 'mash.steps');
      if (Array.isArray(mashSteps)) {
        const spargeStepWithPh = mashSteps.find(step => 
          step.type === 'sparge' && (step.start_ph !== undefined || step.ph !== undefined)
        );
        if (spargeStepWithPh) {
          return 'present';
        }
      }
      
      // Check for BeerXML mash.ph (sparge pH)
      const mashPh = this.getNestedValue(data, 'mash.ph');
      if (mashPh !== undefined && mashPh !== null && mashPh !== '') {
        return 'present';
      }
      
      return fieldDef.required ? 'missing-required' : 'missing-optional';
    }
    
    // Check if field requires BeerJSON (not available in BeerXML)
    if (this.requiresBeerJson(fieldDef, sourceFormat)) {
      // Check if data is present, but mark as "requires-beerjson" regardless
      const value = this.getNestedValue(data, fieldPath);
      const hasData = isValidString(value, { allowEmpty: false }) || 
                      (typeof value === 'number' && !isNaN(value));
      return hasData ? 'present' : 'requires-beerjson';
    }

    // Check if field requires BeerXML (not available in BeerJSON)
    if (this.requiresBeerXml(fieldDef, sourceFormat)) {
      // Check if data is present, but mark as "requires-beerxml" regardless
      const value = this.getNestedValue(data, fieldPath);
      const hasData = isValidString(value, { allowEmpty: false }) || 
                      (typeof value === 'number' && !isNaN(value));
      return hasData ? 'present' : 'requires-beerxml';
    }

    // Check if field requires BeerXML or Brewfather JSON (not available in pure BeerJSON)
    if (this.requiresBeerXmlOrBrewfather(fieldDef, sourceFormat)) {
      // Check if data is present, but mark as "requires-beerxml-or-brewfather" regardless
      const value = this.getNestedValue(data, fieldPath);
      const hasData = isValidString(value, { allowEmpty: false }) || 
                      (typeof value === 'number' && !isNaN(value));
      return hasData ? 'present' : 'requires-beerxml-or-brewfather';
    }

    // Handle array fields (like ingredients lists)
    if (fieldDef.isArray) {
      const value = this.getNestedValue(data, fieldPath);
      const hasData = isValidArray(value, { allowEmpty: false });
      
      if (hasData) {
        return 'present';
      } else {
        // For array fields, use original required setting since they're not ingredient properties
        return fieldDef.required ? 'missing-required' : 'missing-optional';
      }
    }
    
    // Handle ingredient field paths (e.g., 'fermentable.name')
    if (fieldPath.includes('.') && fieldPath.split('.')[0].match(/^(fermentable|hop|yeast|culture|misc|water|mashStep)/)) {
      const [itemType, fieldName] = fieldPath.split('.');
      let arrays = [];
      
      // For yeast/culture, check both arrays since they're combined in one section
      if (itemType === 'yeast' || itemType === 'culture') {
        const yeastArray = this.getNestedValue(data, 'ingredients.yeasts');
        const cultureArray = this.getNestedValue(data, 'ingredients.cultures');
        if (Array.isArray(yeastArray)) arrays.push(yeastArray);
        if (Array.isArray(cultureArray)) arrays.push(cultureArray);
      } else {
        // Map item type to the correct array path
        let arrayPath = '';
        switch(itemType) {
          case 'fermentable':
            arrayPath = 'ingredients.fermentables';
            break;
          case 'hop':
            arrayPath = 'ingredients.hops';
            break;
          case 'misc':
            arrayPath = 'ingredients.miscs';
            break;
          case 'water':
            arrayPath = 'ingredients.waters';
            break;
          case           'mashStep':
            arrayPath = 'mash.steps'; // BeerXML uses steps array
            break;
        }
        
        const array = this.getNestedValue(data, arrayPath);
        if (Array.isArray(array)) arrays.push(array);
      }
      
      // Check if the field exists in at least one item in any of the arrays
      for (const array of arrays) {
        if (array.length > 0) {
          const hasField = array.some(item => {
            const value = item[fieldName];
            return value !== null && value !== undefined && value !== '';
          });
          
          if (hasField) {
            return 'present';
          }
        }
      }
      
      // For ingredient properties, just return 'missing' - the analyzeRecipeData method
      // will determine if it should be 'missing-required', 'missing-optional', or 'not-applicable'
      return 'missing';
    }
    
    // Handle nested paths
    const value = this.getNestedValue(data, fieldPath);
    
    // Check if value exists and is meaningful
    if (value !== null && value !== undefined && value !== '') {
      return 'present';
    }
    
    return fieldDef.required ? 'missing-required' : 'missing-optional';
  }
  
  /**
   * Get nested value from object using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, part) => {
      return current?.[part];
    }, obj);
  }

  /**
   * Calculate statistics from analysis
   */
  calculateStats(analysis, sourceFormat = 'beerxml') {
    let totalRequired = 0;
    let presentRequired = 0;
    let totalOptional = 0;
    let presentOptional = 0;
    let beerJsonOnlyFields = 0;
    let totalBeerXmlFields = 0;
    let totalBeerJsonFields = 0;
    let foundFields = 0;
    
    // Count field definitions to get totals - needs to be dynamic based on source format
    for (const section of Object.values(this.fieldDefinitions)) {
      for (const fieldDef of Object.values(section.fields)) {
        if (fieldDef.beerXml) totalBeerXmlFields++;
        
        // Count fields that are supported by BeerJSON-compatible formats
        // For BeerXML sources, show what would be available in BeerJSON + Brewfather
        // For Brewfather sources, show what is actually supported
        // For pure BeerJSON sources, show only pure BeerJSON fields
        const isSupported = fieldDef.beerJson || 
                          ((sourceFormat === 'brewfather' || sourceFormat === 'beerxml') && fieldDef.brewfatherJson);
        if (isSupported) totalBeerJsonFields++;
      }
    }
    
    // Count analysis results
    for (const section of Object.values(analysis)) {
      for (const [fieldKey, field] of Object.entries(section.fields)) {
        // Count format-specific fields and exclude from completeness calculations
        if (field.status === 'requires-beerjson') {
          beerJsonOnlyFields++;
          continue; // Don't include in completeness calculations
        }
        
        if (field.status === 'requires-beerxml') {
          // BeerXML-only fields when loading BeerJSON - exclude from calculations
          continue; // Don't include in completeness calculations
        }
        
        if (field.status === 'requires-beerxml-or-brewfather') {
          // BeerXML or Brewfather-only fields when loading pure BeerJSON - exclude from calculations
          continue; // Don't include in completeness calculations
        }
        
        // Count found fields (excluding not-applicable)
        if (field.status === 'present') {
          foundFields++;
        }
        
        // Skip not-applicable fields from completeness calculations
        if (field.status === 'not-applicable') continue;
        
        if (field.required) {
          totalRequired++;
          if (field.status === 'present') presentRequired++;
        } else {
          // For BeerJSON, exclude Brewfather top-up fields from denominator but count them in numerator if present
          const isBrewfatherTopUpField = (fieldKey === 'equipment.topUpKettle' || fieldKey === 'equipment.topUpWater');
          const isBeerJsonSource = (sourceFormat === 'beerjson');
          
          if (!(isBrewfatherTopUpField && isBeerJsonSource)) {
            totalOptional++;
          }
          if (field.status === 'present') presentOptional++;
        }
      }
    }
    
    return {
      totalRequired,
      presentRequired,
      totalOptional,
      presentOptional,
      requiredPercentage: totalRequired > 0 ? Math.round((presentRequired / totalRequired) * 100) : 100,
      optionalPercentage: totalOptional > 0 ? Math.round((presentOptional / totalOptional) * 100) : 100,
      beerJsonOnlyFields,
      totalBeerXmlFields,
      totalBeerJsonFields,
      foundFields,
      beerXmlPercentage: totalBeerJsonFields > 0 ? Math.round((totalBeerXmlFields / totalBeerJsonFields) * 100) : 100,
      foundPercentage: totalBeerJsonFields > 0 ? Math.round((foundFields / totalBeerJsonFields) * 100) : 100
    };
  }
  
  /**
   * Render the data preview page
   */
  render(recipeData, container) {
    const analysis = this.analyzeRecipeData(recipeData);
    const sourceFormat = recipeData.sourceFormat || 'beerxml';
    const isBeerJSON = sourceFormat === 'beerjson' || sourceFormat === 'brewfather';
    
    // Calculate statistics
    const stats = this.calculateStats(analysis, sourceFormat);
    
    let html = `
      <div class="data-preview-container">
        <div class="data-preview-header">
          <h1>Recipe Data Analysis</h1>
          <h2>${this.escapeHtml(recipeData.name || 'Untitled Recipe')}</h2>

          <div class="data-preview-notices">
            ${sourceFormat === 'brewfather' ? `
            <div class="format-notice brewfather-notice">
              <span class="notice-badge">Brewfather Format Converted</span>
              <span class="notice-text">Successfully converted to BeerJSON format with full field coverage</span>
            </div>` : isBeerJSON ? `
            <div class="format-notice beerjson-notice">
              <span class="notice-badge">BeerJSON Format Detected</span>
              <span class="notice-text">Full field coverage with enhanced ingredient and procedure details</span>
            </div>` : `
            <div class="format-notice beerxml-notice">
              <span class="notice-badge">BeerXML Format Detected</span>
              <span class="notice-text">${stats.totalBeerJsonFields - stats.totalBeerXmlFields} additional fields available with BeerJSON format</span>
            </div>`}
            
            ${recipeData.isBrewfatherExport && recipeData.equipment?.mashTunDeadspace > 0 ? `
            <div class="format-notice brewfather-notice">
              <span class="notice-badge">Brewfather Export Detected</span>
              <span class="notice-text">Lauter deadspace will be interpreted as recoverable mash tun deadspace</span>
            </div>` : ''}
            
          </div>

          <div class="data-preview-stats">
            <div class="progress-stat">
              <div class="progress-label required-label">
                <span>Required Fields</span>
                <span class="progress-count">${stats.presentRequired}/${stats.totalRequired}</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill ${stats.requiredPercentage === 100 ? 'complete' : 'incomplete-required'}" 
                    style="width: ${stats.requiredPercentage}%"></div>
              </div>
            </div>
            <div class="progress-stat">
              <div class="progress-label">
                <span>Optional Fields</span>
                <span class="progress-count${stats.optionalPercentage > 100 ? ' celebration-101' : ''}">${stats.presentOptional}/${stats.totalOptional}</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill ${stats.optionalPercentage === 100 ? 'complete' : 'incomplete-optional'}${stats.optionalPercentage > 100 ? ' celebration-progress-fill' : ''}" 
                    style="width: ${stats.optionalPercentage}%"></div>
              </div>
            </div>
            <div class="progress-stat">
              <div class="progress-label">
                <span>Data Coverage</span>
                <span class="progress-count coverage-progress-count">
                  ${!isBeerJSON ? `<span class="coverage-beerxml-text">
                    ${stats.foundFields} / ${stats.totalBeerXmlFields}<br>${stats.totalBeerXmlFields > 0 ? Math.round((stats.foundFields / stats.totalBeerXmlFields) * 100) : 100}% BeerXML
                  </span>` : ''}
                  <span class="coverage-beerjson-text${stats.foundPercentage > 100 ? ' celebration-101' : ''}">${stats.foundFields} / ${stats.totalBeerJsonFields}<br>${stats.foundPercentage}% ${isBeerJSON ? 'BeerJSON' : 'BeerJSON'}</span>
                </span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill coverage-beerjson" style="width: 100%"></div>
                ${!isBeerJSON ? `<div class="progress-fill coverage-beerxml" style="width: ${stats.beerXmlPercentage}%"></div>` : ''}
                <div class="progress-fill coverage-found${stats.foundPercentage > 100 ? ' celebration-progress-fill' : ''}" style="width: ${stats.foundPercentage}%"></div>
              </div>
              <div class="progress-markers-coverage">
                <div class="progress-marker marker-beerjson" style="left: 100%"></div>
                ${!isBeerJSON ? `<div class="progress-marker marker-beerxml" style="left: ${stats.beerXmlPercentage}%"></div>` : ''}
              </div>
              <div class="progress-markers">
                <div class="progress-marker marker-found" style="left: ${stats.foundPercentage}%"></div>
              </div>
              <div class="progress-badges">
                <div class="progress-badge badge-beerjson" style="left: 100%">100% Coverage<br>BeerJSON</div>
                ${!isBeerJSON ? `<div class="progress-badge badge-beerxml" style="left: ${stats.beerXmlPercentage}%">100% Coverage<br>BeerXML</div>` : ''}
                <div class="progress-badge badge-found${stats.foundPercentage > 100 ? ' celebration-badge' : ''}" style="left: ${stats.foundPercentage}%">Data Found</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="data-preview-sections">
    `;
    
    // Render sections in the specified order
    const sectionOrder = [
      'basicInfo',
      'styleDetails', 
      'fermentables',
      'hops',
      'yeast',
      'miscellaneous',
      'water',
      'mash',
      'equipment'
    ];
    
    // Render each section in order with enhanced styling
    for (const sectionKey of sectionOrder) {
      if (analysis[sectionKey]) {
        html += this.renderSection(analysis[sectionKey], sectionKey, recipeData, stats);
      }
    }
    
    html += `
        </div>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Add event listeners
    this.attachEventListeners();
  }
  
  /**
   * Render a single section with contextual styling
   */
  renderSection(section, sectionKey, recipeData, stats) {
    // Check if this section has any not-applicable fields
    const hasNotApplicableFields = Object.values(section.fields).some(field => field.status === 'not-applicable');
    const sectionClass = hasNotApplicableFields ? 'data-section section-not-applicable' : 'data-section';
    
    // Add "(No ingredients)" suffix for sections with not-applicable fields
    const titleSuffix = hasNotApplicableFields ? ' (No ingredients found)' : '';
    
    let html = `
      <div class="${sectionClass}">
        <h3 class="data-section-title">${section.title}${titleSuffix}</h3>
        <div class="field-list">
    `;
    
    for (const [fieldKey, field] of Object.entries(section.fields)) {
      const badgeClass = this.getBadgeClass(field.status);
      const badgeText = this.getBadgeText(field.status);
      const isCelebration = stats && stats.foundPercentage > 100 && field.status === 'present';
      const isRequired = field.required;
      const isNotApplicable = field.status === 'not-applicable';
      const isRequiresBeerJson = field.status === 'requires-beerjson' || field.status === 'requires-beerxml' || field.status === 'requires-beerxml-or-brewfather';
      
      // Add not-applicable class to field labels for styling
      // Only dim requires-beerjson fields when the section has not-applicable fields (no ingredients)
      const labelClasses = [
        'field-label',
        isRequired ? 'required-field' : '',
        (isNotApplicable || (isRequiresBeerJson && hasNotApplicableFields)) ? 'field-not-applicable' : ''
      ].filter(Boolean).join(' ');
      
      // Check if field is unimplemented in recipe view
      const isUnimplemented = this.unimplementedFields.has(fieldKey);
      
      html += `
        <div class="field-item">
          <span class="${labelClasses}">
            ${isUnimplemented ? '🚧 ' : ''}${this.escapeHtml(field.label)}
            ${isRequired ? '<span>*</span>' : ''}
          </span>
          <span class="field-badge ${badgeClass}${isCelebration ? ' celebration-badge' : ''}">${badgeText}</span>
        </div>
      `;
    }
    
    html += `
        </div>
      </div>
    `;
    
    return html;
  }

  /**
   * Get badge CSS class for field status
   */
  getBadgeClass(status) {
    switch (status) {
      case 'present': return 'badge-present';
      case 'missing-required': return 'badge-missing-required';
      case 'missing-optional': return 'badge-missing-optional';
      case 'requires-beerjson': return 'badge-requires-beerjson';
      case 'requires-beerxml': return 'badge-requires-beerxml';
      case 'requires-beerxml-or-brewfather': return 'badge-requires-beerjson'; // Use same blue styling as requires-beerjson
      case 'not-applicable': return 'badge-not-applicable';
      default: return 'badge-missing-optional';
    }
  }
  
  /**
   * Get badge text for field status
   */
  getBadgeText(status) {
    switch (status) {
      case 'present': return 'Found';
      case 'missing-required': return 'Missing';
      case 'missing-optional': return 'Optional';
      case 'requires-beerjson': return 'Requires BeerJSON';
      case 'requires-beerxml': return 'BeerXML Only';
      case 'requires-beerxml-or-brewfather': return 'Requires BeerXML or Brewfather JSON';
      case 'not-applicable': return 'N/A';
      default: return 'Optional';
    }
  }
  
  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  
  /**
   * Attach event listeners for buttons
   */
  attachEventListeners() {

  }
}

export { DataPreview };