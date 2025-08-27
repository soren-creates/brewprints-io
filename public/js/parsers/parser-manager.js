/**
 * Parser Manager
 * Handles format detection and routes to appropriate parser
 */

import { BeerXMLParser } from './beerxml-parser.js';
import { BeerJSONParser } from './beerjson-parser.js';
import { BrewfatherConverter } from './brewfather-converter.js';
import { debug, DEBUG_CATEGORIES } from '../utilities/debug.js';
import { RecipeParsingError } from '../utilities/errors/application-errors.js';

class ParserManager {
  constructor() {
    this.beerXMLParser = new BeerXMLParser();
    this.beerJSONParser = new BeerJSONParser();
    this.brewfatherConverter = new BrewfatherConverter();
  }

  /**
   * Parse a file by detecting its format and routing to the appropriate parser
   * @param {string} fileContent - The raw file content
   * @param {string} fileName - The original file name for format detection
   * @returns {Object} Parsed recipe data in standardized internal format
   */
  parseFile(fileContent, fileName) {
    debug.group(DEBUG_CATEGORIES.PARSER, 'Starting file parsing', () => {
      debug.log(DEBUG_CATEGORIES.PARSER, `File: ${fileName}`);
      debug.log(DEBUG_CATEGORIES.PARSER, `Size: ${fileContent.length} characters`);
    });
    
    const format = this.detectFormat(fileName, fileContent);
    debug.log(DEBUG_CATEGORIES.PARSER, `Detected format: ${format}`);
    
    try {
      let recipe;
      switch (format) {
        case 'beerxml':
          debug.log(DEBUG_CATEGORIES.PARSER, 'Parsing as BeerXML...');
          recipe = this.beerXMLParser.parseFile(fileContent);
          break;
        case 'beerjson':
          debug.log(DEBUG_CATEGORIES.PARSER, 'Parsing as BeerJSON...');
          recipe = this.beerJSONParser.parseFile(fileContent);
          break;
        case 'brewfather':
          debug.log(DEBUG_CATEGORIES.PARSER, 'Converting Brewfather to BeerJSON and parsing...');
          // Convert Brewfather format to BeerJSON then parse
          const brewfatherData = JSON.parse(fileContent);
          const convertedBeerJSON = this.brewfatherConverter.convert(brewfatherData);
          recipe = this.beerJSONParser.parseFile(JSON.stringify(convertedBeerJSON));
          break;
        default:
          throw new RecipeParsingError(`Unsupported file format: ${format}`, {
            userMessage: 'Unsupported file format. Please provide a BeerXML (.xml) or BeerJSON (.json) file.',
            details: { 
              parser: 'ParserManager', 
              phase: 'FORMAT_DETECTION', 
              detectedFormat: format, 
              fileName,
              fileAnalysis: {
                extension: fileName?.toLowerCase().split('.').pop() || 'unknown',
                hasContent: fileContent?.length > 0,
                contentLength: fileContent?.length || 0,
                contentStart: fileContent?.substring(0, 100) || 'No content'
              },
              supportedFormats: ['BeerXML (.xml)', 'BeerJSON (.json)', 'Brewfather (.json)'],
              remediation: 'Export your recipe from brewing software in BeerXML or BeerJSON format'
            }
          });
      }
      
      debug.group(DEBUG_CATEGORIES.PARSER, 'Parsing completed successfully', () => {
        debug.log(DEBUG_CATEGORIES.PARSER, `Recipe name: ${recipe.name || 'Unnamed'}`);
        debug.log(DEBUG_CATEGORIES.PARSER, `Fermentables: ${recipe.ingredients?.fermentables?.length || 0}`);
        debug.log(DEBUG_CATEGORIES.PARSER, `Hops: ${recipe.ingredients?.hops?.length || 0}`);
      });
      
      // Add format metadata to recipe data
      recipe.sourceFormat = format;
      return recipe;
      
    } catch (error) {
      // Re-throw RecipeParsingError instances as-is
      if (error instanceof RecipeParsingError) {
        throw error;
      }
      
      // Wrap other errors in RecipeParsingError with format context
      throw new RecipeParsingError(`Failed to parse ${format.toUpperCase()} file: ${error.message}`, {
        userMessage: `Unable to process the ${format.toUpperCase()} file. Please check the file format and try again.`,
        details: { 
          parser: 'ParserManager', 
          phase: 'PARSING_EXECUTION', 
          format, 
          fileName, 
          originalError: error.message,
          fileContext: {
            fileSize: fileContent?.length || 0,
            formatDetected: format,
            contentPreview: fileContent?.substring(0, 200) || 'No content'
          },
          remediation: format === 'brewfather' 
            ? 'Try exporting recipe as BeerXML from Brewfather instead'
            : 'Verify the file was exported correctly from your brewing software'
        }
      });
    }
  }

  /**
   * Detect file format based on extension and content
   * @param {string} fileName - The file name
   * @param {string} fileContent - The file content for validation
   * @returns {string} Format identifier ('beerxml', 'beerjson', 'brewfather', or 'unknown')
   */
  detectFormat(fileName, fileContent) {
    if (!fileName) {
      return 'unknown';
    }

    const extension = fileName.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'xml':
        // Validate that it's actually XML content
        if (this.isValidXML(fileContent)) {
          return 'beerxml';
        }
        break;
      case 'json':
        // Validate that it's actually JSON content and determine JSON format
        if (this.isValidJSON(fileContent)) {
          return this.detectJSONFormat(fileContent);
        }
        break;
    }
    
    return 'unknown';
  }

  /**
   * Basic XML validation
   * @param {string} content - Content to validate
   * @returns {boolean} True if valid XML
   */
  isValidXML(content) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, 'text/xml');
      return !xmlDoc.querySelector('parsererror');
    } catch (error) {
      return false;
    }
  }

  /**
   * Basic JSON validation
   * @param {string} content - Content to validate
   * @returns {boolean} True if valid JSON
   */
  isValidJSON(content) {
    try {
      JSON.parse(content);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Detect specific JSON format (BeerJSON vs Brewfather native)
   * @param {string} content - JSON content to analyze
   * @returns {string} Format identifier ('beerjson' or 'brewfather')
   */
  detectJSONFormat(content) {
    try {
      const data = JSON.parse(content);
      
      // BeerJSON format has a 'version' field and 'recipes' array at root level
      if (data.version && data.recipes && Array.isArray(data.recipes)) {
        return 'beerjson';
      }
      
      // Brewfather native format has specific fields like _version, _timestamp, equipment
      if (data._version && (data._timestamp || data._timestamp_ms) && data.equipment) {
        return 'brewfather';
      }
      
      // If it has a recipes array but no version, it might be malformed BeerJSON
      if (data.recipes && Array.isArray(data.recipes)) {
        return 'beerjson';
      }
      
      // Default to beerjson for other JSON structures (could be malformed)
      return 'beerjson';
      
    } catch (error) {
      // If we can't parse it, default to beerjson (will fail during parsing)
      return 'beerjson';
    }
  }

  /**
   * Get list of supported file formats
   * @returns {Array} Array of supported format objects
   */
  getSupportedFormats() {
    return [
      {
        name: 'BeerXML',
        extensions: ['.xml'],
        description: 'BeerXML 1.0 format'
      },
      {
        name: 'BeerJSON',
        extensions: ['.json'],
        description: 'BeerJSON 1.0 format'
      },
      {
        name: 'Brewfather',
        extensions: ['.json'],
        description: 'Brewfather native format (automatically converted to BeerJSON)'
      }
    ];
  }
}

export { ParserManager };