// services/followers.js - Follower tracking service
const fs = require('fs');
const path = require('path');
const { safeReadJson, safeWriteJson } = require('../utils/safeJson');

class FollowersService {
    constructor(config) {
        this.config = config;
        this.filePath = path.join(__dirname, '..', "..", 'public', 'follower-goal', 'followerCount.json');
    }

    /**
     * Initialize follower count file if it doesn't exist
     */
    initialize() {
        let startingCount = 0;
        try {
            if (this.config.followerGoal && this.config.followerGoal.startingCount) {
                startingCount = this.config.followerGoal.startingCount;
            }
        } catch (error) {
            console.error('Error reading follower goal config:', error);
        }
        
        // Initialize with both count and ids
        const initialData = { count: startingCount, ids: [] };
        
        try {
            if (safeWriteJson(this.filePath, initialData, 2)) {
                console.log('Follower count file initialized');
            } else {
                console.error('Failed to initialize follower count file');
            }
        } catch (error) {
            console.error('Error initializing follower count:', error);
        }
    }

    /**
     * Update follower count when a new follower is detected
     * @param {string} uniqueId - The follower's unique ID
     * @returns {number} The updated follower count
     */
    updateFollowerCount(uniqueId) {
        let data;
        try {
            // Read the current data from the file safely
            data = safeReadJson(this.filePath, { count: 0, ids: [] });
        } catch (error) {
            // If the file doesn't exist or is invalid, start from default values
            console.error('Error reading follower count:', error);
            data = { count: 0, ids: [] };
        }
        
        // Check if the unique ID already exists
        if (!data.ids.includes(uniqueId)) {
            // Add the unique ID to the list
            data.ids.push(uniqueId);
            
            // Increment the count
            data.count += 1;
            
            // Write the updated data back to the file safely
            if (!safeWriteJson(this.filePath, data, 2)) {
                console.error('Failed to write follower count data');
            }
        }
        
        return data.count;
    }

    /**
     * Get the current follower count
     * @returns {Promise<object>} The follower count data
     */
    async getFollowerCount() {
        return new Promise((resolve, reject) => {
            try {
                const data = safeReadJson(this.filePath, { count: 0, ids: [] });
                resolve(data);
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = FollowersService;