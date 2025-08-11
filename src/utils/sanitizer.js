/**
 * Utility for sanitizing content before storing in JSON files
 * Prevents JSON parsing errors caused by special characters in user-generated content
 */

class ContentSanitizer {
  /**
   * Sanitize a string to be safe for JSON storage
   * @param {string} input - The input string to sanitize
   * @returns {string} - The sanitized string
   */
  static sanitizeString(input) {
    if (input === null || input === undefined) {
      return '';
    }
    
    // Convert to string if it's not already
    let str = String(input);
    
    // Remove or escape problematic characters that can break JSON
    str = str
      // Remove null bytes and control characters (except newlines and tabs)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Replace problematic quotes with safe alternatives
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      // Replace backslashes with forward slashes to avoid escaping issues
      .replace(/\\/g, '/')
      // Remove any remaining problematic characters
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
    
    return str.trim();
  }

  /**
   * Sanitize an object recursively, cleaning all string values
   * @param {any} obj - The object to sanitize
   * @returns {any} - The sanitized object
   */
  static sanitizeObject(obj) {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize the key as well
        const sanitizedKey = this.sanitizeString(key);
        if (sanitizedKey) {
          sanitized[sanitizedKey] = this.sanitizeObject(value);
        }
      }
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Sanitize data before writing to JSON file
   * @param {any} data - The data to sanitize
   * @returns {any} - The sanitized data ready for JSON.stringify
   */
  static sanitizeForJSON(data) {
    return this.sanitizeObject(data);
  }

  /**
   * Safely stringify data with sanitization
   * @param {any} data - The data to stringify
   * @param {number} space - Number of spaces for indentation (default: 2)
   * @returns {string} - The sanitized JSON string
   */
  static safeStringify(data, space = 2) {
    try {
      const sanitized = this.sanitizeForJSON(data);
      return JSON.stringify(sanitized, null, space);
    } catch (error) {
      console.error('Error in safeStringify:', error);
      // Fallback: try to stringify with minimal data
      try {
        return JSON.stringify({ error: 'Data sanitization failed', timestamp: Date.now() }, null, space);
      } catch (fallbackError) {
        console.error('Fallback stringify also failed:', fallbackError);
        return '{}';
      }
    }
  }

  /**
   * Safely read and parse a JSON file with error handling
   * @param {string} filePath - Path to the JSON file
   * @param {any} defaultValue - Default value to return if parsing fails
   * @returns {any} - The parsed data or default value
   */
  static safeReadJSON(filePath, defaultValue = null) {
    try {
      const fs = require('fs');
      if (!fs.existsSync(filePath)) {
        console.log(`File does not exist: ${filePath}`);
        return defaultValue;
      }
      
      const fileData = fs.readFileSync(filePath, 'utf8');
      if (!fileData || fileData.trim() === '') {
        console.log(`File is empty: ${filePath}`);
        return defaultValue;
      }
      
      return JSON.parse(fileData);
    } catch (error) {
      console.error(`Error reading/parsing JSON file ${filePath}:`, error);
      return defaultValue;
    }
  }

  /**
   * Safely read and parse a JSON file asynchronously
   * @param {string} filePath - Path to the JSON file
   * @param {any} defaultValue - Default value to return if parsing fails
   * @returns {Promise<any>} - Promise resolving to parsed data or default value
   */
  static async safeReadJSONAsync(filePath, defaultValue = null) {
    try {
      const fs = require('fs').promises;
      const fileData = await fs.readFile(filePath, 'utf8');
      
      if (!fileData || fileData.trim() === '') {
        console.log(`File is empty: ${filePath}`);
        return defaultValue;
      }
      
      return JSON.parse(fileData);
    } catch (error) {
      console.error(`Error reading/parsing JSON file ${filePath}:`, error);
      return defaultValue;
    }
  }
}

module.exports = ContentSanitizer;
