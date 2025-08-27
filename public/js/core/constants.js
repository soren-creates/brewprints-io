// constants.js
// Centralized brewing-related constants for use throughout the app

// === UNIT CONVERSIONS ===
export const L_TO_GAL = 0.264172;
export const KG_TO_LB = 2.20462;
export const QT_TO_GAL = 0.25;
export const QT_TO_L = 0.946353;

// === BREWING CALCULATIONS ===
export const GRAIN_DISPLACEMENT_RATE = 0.08; // gal/lb
export const ABV_CONVERSION_FACTOR = 131.25; // Standard ABV calculation factor

// === WATER VOLUME CALCULATIONS ===
// Absolute boil-off rate validation (liters per hour)
export const BOIL_OFF_RATE_MIN_L_HR = 1.0;    // ~0.26 gal/hr (very gentle boil)
export const BOIL_OFF_RATE_MAX_L_HR = 8.0;    // ~2.1 gal/hr (very vigorous boil)
export const BOIL_OFF_RATE_TYPICAL_L_HR = 3.8; // ~1.0 gal/hr (typical home setup)

export const GRAIN_ABSORPTION_DEFAULT = 0.125; // qt/lb (traditional systems)
export const GRAIN_ABSORPTION_ALLINONE = 0.325; // qt/lb (all-in-one systems)
export const TRUB_LOSS_MIN = 0.5; // liters
export const TRUB_LOSS_MAX = 4; // liters
export const TRUB_LOSS_DEFAULT = 1.5; // liters
export const FERMENTER_LOSS_DEFAULT = 0.5; // liters
export const THERMAL_CONTRACTION_DEFAULT = 0.04; // 4%

// === GRAVITY CALCULATIONS ===
// Gravity ranges for last runnings
export const LAST_RUNNINGS_MIN = 1.008;  // Stop here to avoid tannins
export const LAST_RUNNINGS_MAX = 1.012;  // Conservative upper limit

// First runnings concentration factors
export const THICK_MASH_FACTOR = 1.4;    // ≤ 1.0 qt/lb (very thick)
export const NORMAL_MASH_FACTOR = 1.25;  // 1.0-1.5 qt/lb (typical)
export const THIN_MASH_FACTOR = 1.15;    // ≥ 1.5 qt/lb (thin)

// Water-to-grain ratio thresholds (qt/lb)
export const THICK_THRESHOLD = 1.0;
export const THIN_THRESHOLD = 1.5;

// === SRM CALCULATIONS ===
// Morey equation constants
export const MOREY_MULTIPLIER = 1.4922;
export const MOREY_EXPONENT = 0.6859;

// Color conversion constants
export const LOVIBOND_TO_SRM_FACTOR = 1.3546;
export const LOVIBOND_TO_SRM_OFFSET = -0.76;

// Maximum reasonable SRM value (very dark stout)
export const MAX_SRM = 40;

// === EFFICIENCY CALCULATIONS ===
export const DEFAULT_EFFICIENCY = 70;
export const MIN_EFFICIENCY = 30;
export const MAX_EFFICIENCY = 95;

// Yeast attenuation defaults by type
export const YEAST_ATTENUATION = {
  ale: 75,
  lager: 80,
  wheat: 72,
  wine: 85,
  champagne: 90,
  default: 75
};

// Brewing domain temperature ranges based on yeast strain characteristics (in Celsius)
// These ranges reflect optimal fermentation temperatures for different yeast types
export const BREWING_TEMPERATURE_RANGES = {
  'ale': { min: 18, max: 24 },        // 64-75°F - Standard ale fermentation range
  'lager': { min: 7, max: 13 },       // 45-55°F - Cold fermentation for clean lager profiles
  'wheat': { min: 18, max: 24 },      // 64-75°F - Wheat beer yeast, similar to ale
  'wine': { min: 18, max: 24 },       // 64-75°F - Wine yeast fermentation range
  'champagne': { min: 15, max: 20 },  // 59-68°F - Cooler for refined champagne character
  'brett': { min: 20, max: 28 },      // 68-82°F - Brettanomyces prefers warmer temperatures
  'kveik': { min: 25, max: 40 },      // 77-104°F - Traditional Norwegian farmhouse yeast
  'wild': { min: 18, max: 28 },       // 64-82°F - Wild/mixed fermentation cultures
  'saison': { min: 22, max: 30 },     // 72-86°F - Saison strains like warmth for character development
  'default': { min: 18, max: 24 }     // 64-75°F - Standard ale range fallback
};

// === IBU CALCULATIONS ===
export const KG_TO_OZ = 35.274;
export const L_TO_QT = 1.05669;
export const L_TO_FL_OZ = 33.814;
export const ALPHA_ACID_FACTOR = 7490; // Factor from Tinseth formula
export const BIGNESS_FACTOR_BASE = 1.65;
export const BIGNESS_FACTOR_EXPONENT = 0.000125;
export const BOIL_TIME_FACTOR_COEFFICIENT = 0.04;
export const BOIL_TIME_FACTOR_DIVISOR = 4.15;

// Hop utilization adjustments
export const WHIRLPOOL_MAX_TIME = 10; // Whirlpool/flameout hops get max 10 min equivalent
export const DEFAULT_NON_BOIL_TIME = 5; // Default time for unspecified non-boil hops

// === STAT RANGE DEFAULTS ===
export const STAT_BASE_RANGES = {
  'IBU': { min: -9, max: 110 },
  'SRM': { min: 0, max: 54 },
  'ABV': { min: 0, max: 15 },
  'OG': { min: 1.030, max: 1.090 },
  'FG': { min: 0.990, max: 1.050 },
  'CO₂': { min: 0.5, max: 5.0 }
};

// Stat range padding and thresholds
export const GRAVITY_TARGET_RANGE_SIZE = 0.060; // 60 gravity points
export const GRAVITY_PADDING = 0.008; // 8 gravity points

// === BREWING DEFAULTS ===
export const DEFAULT_OG = 1.050;
export const DEFAULT_FG = 1.010;
export const DEFAULT_ABV = 5.0;
export const DEFAULT_IBU = 0;
export const DEFAULT_SRM = 2;
export const DEFAULT_BOIL_TIME = 60; // minutes
export const DEFAULT_MASH_TIME = 60; // minutes
export const DEFAULT_BATCH_SIZE = 5.0; // gallons
export const DEFAULT_BOIL_SIZE = 6.5; // gallons
export const DEFAULT_FERMENTATION_TEMP = 68; // Fahrenheit
export const DEFAULT_MASH_TEMP = 152; // Fahrenheit
export const DEFAULT_SPARGE_TEMP = 170; // Fahrenheit
export const DEFAULT_YEAST_ATTENUATION = 75; // percent

// === BREWING DOMAIN LIMITS ===
export const BREWING_LIMITS = {
  // Core brewing parameters
  ibu: { min: 0, max: 120 },
  srm: { min: 0, max: 50 },
  og: { min: 1.000, max: 1.200 },
  fg: { min: 0.990, max: 1.100 },
  abv: { min: 0, max: 20 },
  efficiency: { min: 10, max: 100 },
  carbonation: { min: 0, max: 5 },
  ph: { min: 3.0, max: 6.0 },
  
  // Physical measurement limits
  temperature: { min: -20, max: 120 }, // Celsius - covers freezing to boiling + margin
  time: { min: 0, max: 525600 }, // minutes - 0 to 1 year (accommodates extended aging and fermentation)
  amount: { min: 0, max: 1000000 }, // kg/L - reasonable upper bound
  percentage: { min: 0, max: 100 }, // Standard percentage
  gravity: { min: 0.9, max: 2.0 }, // Broader than brewing-specific og/fg
  
  // Water chemistry limits  
  mineralContent: { min: 0, max: 2000 }, // ppm - typical brewing water range
  phExtended: { min: 0, max: 14 }, // Full pH scale for water chemistry
  
  // Equipment-specific limits
  boilOffRate: { min: 0.5, max: 8.0 }, // L/hr reasonable range for evaporation
  alphaAcid: { min: 1.0, max: 25.0 },  // Typical hop alpha acid range
  fermentableYield: { min: 50, max: 100 }, // Percentage yield range for fermentables
  
  // Extended brewing ranges for edge cases
  gravityExtended: { min: 0.900, max: 2.000 }, // For barleywines, ice beers
  abvExtended: { min: 0, max: 50 }, // For spirits/fortified beverages
  ibuExtended: { min: 0, max: 200 }, // For extreme hop bombs
  temperatureExtended: { min: -40, max: 200 }, // For extreme brewing processes
  
  // File size limits
  fileSize: { min: 0, max: 10485760 } // 10MB max file size
};

// === CARBONATION DEFAULTS ===
export const DEFAULT_CARBONATION = 2.4;
export const DEFAULT_CARB_MIN = 2.2;
export const DEFAULT_CARB_MAX = 2.8;

// === TEMPERATURE CONVERSIONS ===
export const CELSIUS_TO_FAHRENHEIT_MULTIPLIER = 9/5;
export const CELSIUS_TO_FAHRENHEIT_OFFSET = 32;

// === ADDITIONAL UNIT CONVERSIONS ===
export const ML_PER_LITER = 1000;
export const GRAMS_PER_KG = 1000;
export const OZ_PER_LB = 16;
export const MINUTES_PER_DAY = 1440;
export const GALLONS_TO_QUARTS = 4;

// === GRAVITY CALCULATION CONSTANTS ===
export const YIELD_TO_PPG_CONVERSION = 0.46;
export const GRAVITY_RANGE_PADDING = 0.010; // ±10 gravity points for ranges

// === SPARGE ANALYSIS CONSTANTS ===
export const SPARGE_THRESHOLD_L = 2.0; // Minimum shortfall to require sparge
export const EXCESS_WATER_THRESHOLD_L = 1.0; // Excess indicating no-sparge
export const MAX_SPARGE_RATIO = 0.75; // Maximum sparge as % of target volume
export const MIN_STRIKE_RATIO = 0.3; // Minimum strike water ratio
export const MAX_STRIKE_RATIO = 0.9; // Maximum strike water ratio

// === VALIDATION TOLERANCES ===
export const VOLUME_TOLERANCE_L = 0.001; // Volume calculation precision
export const TRUB_LOSS_TOLERANCE_L = 0.05; // Trub loss validation tolerance
export const BATCH_SIZE_TOLERANCE_PERCENT = 0.02; // 2% batch size tolerance
export const THERMAL_EXPANSION_WARNING_THRESHOLD = 0.1; // 10% warning threshold

// === HOP ANALYSIS CONSTANTS ===
export const HOP_RATE_UNITS = {
  GRAMS_PER_LITER: 'g/L',
  OZ_PER_GAL: 'oz/gal'
};

// Hop rate thresholds for analysis
export const HOP_RATE_THRESHOLDS = {
  DRY_HOP_LOW: 1.0,    // g/L - light dry hopping
  DRY_HOP_MEDIUM: 4.0, // g/L - moderate dry hopping  
  DRY_HOP_HIGH: 8.0,   // g/L - heavy dry hopping
  AROMA_LOW: 2.0,      // g/L - light aroma hopping
  AROMA_MEDIUM: 6.0,   // g/L - moderate aroma hopping
  AROMA_HIGH: 12.0     // g/L - heavy aroma hopping
};

// === RECIPE ANALYSIS CONSTANTS ===
export const BU_GU_RATIO_RANGES = {
  MALTY: 0.5,         // Below 0.5 - malt-forward
  BALANCED: 1.0,      // 0.5-1.0 - balanced
  HOPPY: 1.5          // Above 1.0 - hop-forward
};

// Diastatic power thresholds (degrees Lintner)
export const DIASTATIC_POWER_THRESHOLDS = {
  INSUFFICIENT: 30,   // Below 30°L - insufficient for conversion
  ADEQUATE: 50,       // 30-50°L - adequate conversion
  GOOD: 80,           // 50-80°L - good conversion
  EXCELLENT: 120      // Above 80°L - excellent conversion
};

// === WATER CHEMISTRY CONSTANTS ===
export const SULFATE_CHLORIDE_RATIOS = {
  MALTY: 0.5,         // Below 0.5:1 - malt-forward
  BALANCED: 1.5,      // 0.5-1.5:1 - balanced
  HOPPY: 3.0          // Above 1.5:1 - hop-forward
};

// === APPLICATION EVENTS ===
export const EVENTS = {
  CONTINUE_TO_RECIPE: 'continueToRecipe',
  BACK_TO_UPLOAD: 'backToUpload',
  BACK_TO_DATA_PREVIEW: 'backToDataPreview',
  PAGE_CHANGED: 'pageChanged',
  SAVE_RECIPE: 'saveRecipe',
  SHOW_MY_RECIPES: 'showMyRecipes',
  LOAD_SAVED_RECIPE: 'loadSavedRecipe',
  RECIPE_SAVED: 'recipeSaved',
  RECIPE_LOADED: 'recipeLoaded',
  OFFLINE_QUEUE_PROCESSED: 'offlineQueueProcessed',
  AUTH_STATE_CHANGED: 'authStateChanged',
  AUTH_ERROR: 'authError'
};