# Brewprints.io

A specialized web application that converts recipe files (BeerXML 1.0, BeerJSON 1.0.2, and Brewfather JSON) into beautiful, thoughtfully-designed printable brewing logs. Designed for brewers who want to transform their digital recipes into professional, organized printed documents for use during actual brewing sessions.

## Key Features

### Core Functionality
- **Multi-Format Support**: Full support for BeerXML 1.0, BeerJSON 1.0.2, and Brewfather JSON formats with drag-and-drop file upload
- **Cloud Storage**: Save and share recipes with Firebase integration
- **User Authentication**: Secure user accounts via Clerk authentication
- **Recipe Privacy**: Control recipe visibility (private, unlisted, public, share tokens)
- **Data Fields Analysis**: View comprehensive field coverage analysis of recipe data
- **Print-Optimized Layout**: Clean, professional formatting designed specifically for printing
- **Section Controls**: Toggle visibility of different recipe sections for customized output

### Advanced Brewing Calculations
- **Calculation Pipeline**: Sophisticated caching system that manages calculation dependencies and avoids redundant calculations
- **Water Volume Tracking**: Complete system for tracking water/wort volumes throughout the brewing process
- **Multiple Brewing Methods**: Support for traditional all-grain, BIAB, and no-boil recipes
- **Sparge Detection**: Automatic classification of brewing systems based on volume analysis
- **Thermal Expansion**: Accounts for volume changes during temperature transitions
- **Brewfather Compatibility**: Special handling for Brewfather BeerXML exports

### Recipe Display
- **Comprehensive Statistics**: ABV, IBU, SRM with style range comparisons
- **Detailed Ingredients**: Fermentables, hops, yeast, and miscellaneous additions
- **Mash Profiles**: Step-by-step mash schedules with temperatures and times
- **Volume Flow Tracking**: Complete water volume calculations from strike to fermenter

## Usage

### Quick Start (Guest Mode)
1. Open the application at https://brewprints.io
2. Drag and drop a recipe file (BeerXML, BeerJSON, or Brewfather JSON) or click "Choose File"
3. The recipe view loads automatically, displaying your formatted brewing log
4. Use "Section Visibility" controls to customize which parts to include
5. Click "Data Fields" button to view field coverage analysis (click "Recipe View" to return)
6. Print either view using your browser's print function
7. Click the close button to return to the upload page

### Registered Users
1. Sign up/sign in to access cloud storage features
2. Save recipes to your personal library
3. Share recipes with custom privacy settings
4. Access your saved recipes from any device

## Project Structure

```
├── public/
│   ├── index.html                          # Main application entry point
│   ├── js/                                 # All JavaScript modules
│   │   ├── auth/                               # Authentication integration
│   │   │   └── clerk-config.js                     # Clerk authentication configuration
│   │   ├── core/                               # Core application logic
│   │   │   ├── main.js                             # Application initialization & state management
│   │   │   ├── formatter.js                        # Data transformation for display
│   │   │   ├── constants.js                        # Brewing domain constants & defaults
│   │   │   ├── recipe-validator.js                 # Recipe validation & sanitization
│   │   │   ├── calculation-orchestrator.js         # Calculation orchestration with caching
│   │   │   ├── firebase-config.js                  # Firebase project configuration
│   │   │   └── version.js                          # Application version information
│   │   ├── storage/                            # Data persistence
│   │   │   └── storage-manager.js                  # Firebase integration & recipe storage
│   │   ├── parsers/                            # Multi-format parsing
│   │   │   ├── parser-manager.js                   # Multi-format parser management
│   │   │   ├── beerxml-parser.js                   # BeerXML 1.0 parsing with Brewfather detection
│   │   │   ├── beerjson-parser.js                  # BeerJSON 1.0.2 parsing
│   │   │   └── brewfather-converter.js             # Brewfather JSON to BeerJSON conversion
│   │   ├── calculations/                       # Specialized calculation modules
│   │   │   ├── calculation-coordinator.js          # Calculation dependencies & caching
│   │   │   ├── water-volume-calculator.js          # Main water calculation orchestrator
│   │   │   ├── evaporation-calculator.js           # Boil-off calculations
│   │   │   ├── volume-flow-calculator.js           # Volume tracking through brewing
│   │   │   ├── sparge-calculator.js                # Sparge detection & validation
│   │   │   ├── efficiency-calculator.js            # Brewing efficiency calculations
│   │   │   ├── gravity-calculator.js               # Gravity & ABV calculations
│   │   │   ├── ibu-calculator.js                   # IBU (bitterness) calculations
│   │   │   ├── hop-calculator.js                   # Hop utilization analysis
│   │   │   ├── yeast-calculator.js                 # Yeast attenuation calculations
│   │   │   ├── grain-bill-calculator.js            # Grain bill analysis & diastatic power
│   │   │   ├── recipe-metrics-calculator.js        # Recipe balance & water chemistry metrics
│   │   │   ├── srm-calculator.js                   # SRM (color) calculations
│   │   │   └── carbonation-calculator.js           # CO2 calculations
│   │   ├── formatters/                         # Specialized formatting modules
│   │   │   ├── ingredient-formatter.js             # Ingredient display formatting
│   │   │   ├── text-formatter.js                   # Text processing utilities
│   │   │   ├── time-formatter.js                   # Time/duration formatting
│   │   │   └── unit-formatter.js                   # Unit conversion & display
│   │   ├── ui/                                 # User interface components
│   │   │   ├── recipe-renderer.js                  # Main recipe rendering orchestrator
│   │   │   ├── components/                         # Reusable UI components
│   │   │   │   ├── navigation-manager.js               # View switching & navigation state
│   │   │   │   ├── recipe-image-manager.js             # Recipe image handling
│   │   │   │   ├── print-controls.js                   # Print functionality
│   │   │   │   ├── header-manager.js                   # Header management
│   │   │   │   ├── section-manager.js                  # Section visibility management
│   │   │   │   ├── loading-manager.js                  # Loading state management
│   │   │   │   ├── upload-modal.js                     # File upload modal
│   │   │   │   ├── debug-toggle.js                     # Development debugging controls
│   │   │   │   └── lucide-icons.js                     # Icon management system
│   │   │   ├── pages/                              # Page-level components
│   │   │   │   ├── data-preview.js                     # Data preview functionality
│   │   │   │   └── my-recipes.js                       # Saved recipes management
│   │   │   └── renderers/                          # Specialized section renderers
│   │   │       ├── base-renderer.js                    # Base class for all renderers
│   │   │       ├── header-renderer.js                  # Recipe header & basic info
│   │   │       ├── stats-renderer.js                   # Recipe statistics with style ranges
│   │   │       ├── ingredients-renderer.js             # Fermentables, hops, yeast, misc
│   │   │       ├── mash-fermentation-renderer.js       # Mash steps & fermentation
│   │   │       ├── measurements-renderer.js            # Brew day measurements
│   │   │       ├── volume-tracking-renderer.js         # Water volume calculations
│   │   │       └── water-profiles-renderer.js          # Water profile information
│   │   └── utilities/                          # Helper functions (organized by function)
│   │       ├── data/                               # Data manipulation utilities
│   │       │   ├── water-calculation-preprocessor.js   # Recipe data processing for water calculations
│   │       │   ├── recipe-utils.js                     # Recipe data manipulation
│   │       │   ├── water-utils.js                      # Water calculation utilities
│   │       │   └── ph-extraction-utils.js              # Water pH analysis utilities
│   │       ├── formatting/                         # Formatting utilities
│   │       │   └── formatting-utils.js                 # Number & unit formatting
│   │       ├── validation/                         # Validation utilities
│   │       │   ├── validation-utils.js                 # Data validation utilities
│   │       │   ├── beerjson-validator.js               # BeerJSON schema validation
│   │       │   ├── security-utils.js                   # Security validation utilities
│   │       │   ├── schema-loader.js                    # JSON schema loading
│   │       │   └── schemas/                            # BeerJSON validation schemas
│   │       ├── performance/                        # Performance optimization utilities
│   │       │   └── sharing-performance.js              # Sharing system performance
│   │       ├── errors/                             # Error handling modules
│   │       │   ├── error-handler.js                    # Centralized error handling & user feedback
│   │       │   ├── error-utils.js                      # Error utility functions
│   │       │   ├── application-errors.js               # Application error types
│   │       │   └── auth-errors.js                      # Authentication error types
│   │       ├── hop-use-normalizer.js               # Hop usage standardization
│   │       └── debug.js                            # Development debugging utilities
│   └── styles/                             # CSS stylesheets (modular architecture)
│       ├── base.css                            # Core styles, CSS variables, OKLCH colors
│       ├── components.css                      # UI components (modals, buttons, toasts)
│       ├── utilities.css                       # Utility classes and dynamic states
│       ├── print.css                           # Print media styles only
│       ├── recipe.css                          # Recipe page specific styles
│       ├── my-recipes.css                      # My Recipes page specific styles
│       └── data-preview.css                    # Data preview styling
├── recipes/                            # Sample recipe files
│   ├── beerxml/                            # BeerXML format examples
│   ├── beerjson/                           # BeerJSON format examples
│   └── brewfather/                         # Brewfather JSON format examples
├── firebase.json                       # Firebase hosting configuration
└── database.rules.json                 # Firebase security rules
```

## Development

### Local Development Server

**Firebase Serve** (Recommended - Full Functionality):
```bash
firebase serve
```
- Provides static hosting + Firebase Functions emulation
- Access at: http://localhost:5000
- All cloud features work locally

**Alternative Static Servers** (Limited Functionality):

**Visual Studio Code**: Right-click on `public` folder and select "Open with Live Server"

**Node.js**: 
```bash
npx http-server public -p 3000
```

**Python**: 
```bash
cd public && python -m http.server 3000
```

**Note**: Static servers use fallback configuration - cloud features will use production endpoints.

### Testing Environment

```bash
npm test                 # Run test suite
```

**Browser Testing**: Run test files directly in the browser with web server running.
**Test Framework**: Custom testUtils with jsdom
**No Runtime Dependencies**: Vanilla JavaScript with ES6 modules only
**Development Dependencies**: jsdom for Node.js testing

## Architecture

### Application Architecture

No build process required. This is a static web application using vanilla JavaScript with ES6 modules.

### Core Data Flow
1. **Authentication** → **File Upload** → **Recipe Display** (with optional **Data Fields** view)
2. **ParserManager** detects file format and routes to appropriate parser (BeerXML, BeerJSON, or Brewfather)
3. **RecipeValidator** validates and sanitizes recipe data, applying brewing domain defaults
4. **CalculationOrchestrator** processes brewing calculations with dependency caching
5. **RecipeFormatter** transforms validated data into display-ready format
6. **RecipeRenderer** orchestrates section rendering using specialized renderers
7. **StorageManager** handles cloud storage and sharing for authenticated users

### Key Design Patterns
- **Modular CSS Architecture**: Organized CSS system with variables-first approach and standardized component classes
- **Trusted Input Contract System**: RecipeValidator provides guarantees to calculation modules, eliminating redundant validation
- **Modular Architecture**: Clean separation between authentication, parsing, validation, calculation, and rendering
- **Base Renderer Pattern**: All section renderers inherit from a common BaseRenderer class providing shared functionality
- **Calculation Orchestration**: Sophisticated caching system manages calculation dependencies and prevents redundant work
- **Privacy-First Storage**: Default private recipes with granular sharing controls
- **Centralized Domain Knowledge**: All brewing constants and defaults consolidated in single module
- **Navigation Management**: Centralized view switching and navigation state management
- **Error Handling**: Unified error handling system with user-friendly notifications
- **Event-Driven UI**: Page transitions use custom events for loose coupling

### Advanced Systems

**Authentication & Storage**: Secure user management featuring:
- Clerk-powered authentication with multiple sign-in options
- Firebase-backed cloud storage with automatic synchronization
- Privacy-first approach with default private recipes
- Granular sharing controls (private, unlisted, public, temporary share tokens)
- Automatic user data protection and secure token management

**Calculation Orchestration**: A sophisticated caching system that:
- Manages calculation dependencies to avoid redundant work
- Automatically detects when recipes change and clears relevant caches
- Provides error handling for calculation failures
- Improves performance for complex brewing calculations
- Supports advanced brewing science validation

**Water Volume Tracking**: A comprehensive system that:
- Automatically detects brewing method (traditional all-grain vs BIAB vs no-sparge)
- Prioritizes data sources (absolute boil-off rates over percentages)
- Tracks complete volume flow from strike water to fermenter
- Accounts for thermal expansion and contraction
- Handles various recipe formats and equipment configurations

**Security & Validation**: Comprehensive protection including:
- BeerJSON schema validation with detailed error reporting
- Input sanitization and XSS protection
- OWASP security compliance validation
- Secure sharing token generation and expiration
- Content Security Policy enforcement

**Navigation & Error Handling**: Robust user experience features including:
- Centralized view switching between upload, preview, recipe, and my-recipes views
- User-friendly error notifications with automatic dismissal
- Proper scroll management during navigation transitions
- Graceful handling of authentication, file loading, and calculation errors

## Browser Support

Works in all modern browsers that support ES6 modules (Chrome 61+, Firefox 60+, Safari 10.1+, Edge 16+).