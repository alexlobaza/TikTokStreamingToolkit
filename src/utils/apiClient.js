// utils/apiClient.js - API call utilities
const axios = require('axios');

/**
 * Make an API call to the specified endpoint
 * @param {string} endpoint - The API endpoint to call
 * @param {object} config - The application configuration
 * @returns {Promise<object|null>} The response data or null on error
 */
function callApi(endpoint, config) {
    const fullUrl = config.apiCalls.apiUrl + endpoint;
    
    return axios.get(fullUrl)
        .then(response => {
            return response.data;
        })
        .catch(error => {
            console.error(`API call failed: ${fullUrl}`, error.message);
            return null;
        });
}

module.exports = {
    callApi
};