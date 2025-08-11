// src/utils/safeJson.js - Safe JSON operations for user data
const fs = require('fs');

/**
 * Safely stringify data for JSON files, handling special characters in user data
 * @param {any} data - The data to stringify
 * @param {number} spaces - Number of spaces for indentation (default: 2)
 * @returns {string} - Safe JSON string
 */
function safeStringify(data, spaces = 2) {
    try {
        // Deep clone the data to avoid modifying the original
        const clonedData = JSON.parse(JSON.stringify(data));
        
        // Recursively sanitize strings in the data
        const sanitizedData = sanitizeStrings(clonedData);
        
        return JSON.stringify(sanitizedData, null, spaces);
    } catch (error) {
        console.error('Error in safeStringify:', error);
        // Fallback to basic stringify if sanitization fails
        return JSON.stringify(data, null, spaces);
    }
}

/**
 * Recursively sanitize strings in data to prevent JSON corruption
 * @param {any} data - The data to sanitize
 * @returns {any} - Sanitized data
 */
function sanitizeStrings(data) {
    if (typeof data === 'string') {
        return sanitizeString(data);
    } else if (Array.isArray(data)) {
        return data.map(item => sanitizeStrings(item));
    } else if (data !== null && typeof data === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(data)) {
            sanitized[key] = sanitizeStrings(value);
        }
        return sanitized;
    }
    return data;
}

/**
 * Sanitize a single string to prevent JSON corruption
 * @param {string} str - The string to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    
    // Replace problematic characters that could break JSON
    return str
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/"/g, '\\"')    // Escape quotes
        .replace(/\n/g, '\\n')   // Escape newlines
        .replace(/\r/g, '\\r')   // Escape carriage returns
        .replace(/\t/g, '\\t')   // Escape tabs
        .replace(/\f/g, '\\f')   // Escape form feeds
        .replace(/\b/g, '\\b')   // Escape backspace
        .replace(/\u0000/g, '\\u0000') // Escape null bytes
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, (char) => {
            // Escape other control characters
            return `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`;
        });
}

/**
 * Safely read and parse a JSON file
 * @param {string} filePath - Path to the JSON file
 * @param {any} defaultValue - Default value if file is invalid or missing
 * @returns {any} - Parsed data or default value
 */
function safeReadJson(filePath, defaultValue = null) {
    try {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }
        
        const fileData = fs.readFileSync(filePath, 'utf8');
        
        // Check if file is empty
        if (!fileData.trim()) {
            return defaultValue;
        }
        
        return JSON.parse(fileData);
    } catch (error) {
        console.error(`Error reading JSON file ${filePath}:`, error);
        
        // Try to backup the corrupted file
        try {
            const backupPath = `${filePath}.corrupted.${Date.now()}`;
            fs.copyFileSync(filePath, backupPath);
            console.log(`Corrupted file backed up to: ${backupPath}`);
        } catch (backupError) {
            console.error('Failed to backup corrupted file:', backupError);
        }
        
        return defaultValue;
    }
}

/**
 * Safely write data to a JSON file
 * @param {string} filePath - Path to the JSON file
 * @param {any} data - Data to write
 * @param {number} spaces - Number of spaces for indentation (default: 2)
 * @returns {boolean} - Success status
 */
function safeWriteJson(filePath, data, spaces = 2) {
    try {
        const jsonString = safeStringify(data, spaces);
        fs.writeFileSync(filePath, jsonString, 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing JSON file ${filePath}:`, error);
        return false;
    }
}

module.exports = {
    safeStringify,
    safeReadJson,
    safeWriteJson,
    sanitizeString,
    sanitizeStrings
};
