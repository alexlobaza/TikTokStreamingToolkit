// services/followers.js - Follower tracking service
const fs = require('fs');
const path = require('path');
const ContentSanitizer = require('../utils/sanitizer');

class FollowersService {
    constructor(config) {
        this.config = config;
        this.filePath = path.join(__dirname, '..', "..", 'public', 'follower-goal', 'followerCount.json');
    }

    /**
     * Initialize follower count file if it doesn't exist
     */
    initialize(shouldContinue = false) {
        if (shouldContinue) {
            // Check if file exists, if so, preserve it
            if (fs.existsSync(this.filePath)) {
                console.log('Follower count file: Continuing with existing data.');
                return; // Don't reset, preserve existing data
            }
        }

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
            fs.writeFileSync(this.filePath, ContentSanitizer.safeStringify(initialData, 2));
            console.log('Follower count file initialized');
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
        // Read the current data from the file with safe parsing
        data = ContentSanitizer.safeReadJSON(this.filePath, { count: 0, ids: [] });
        
        // Check if the unique ID already exists
        if (!data.ids.includes(uniqueId)) {
            // Add the unique ID to the list
            data.ids.push(uniqueId);
            
            // Increment the count
            data.count += 1;
            
            // Write the updated data back to the file
            fs.writeFileSync(this.filePath, ContentSanitizer.safeStringify(data, 2));
        }
        
        return data.count;
    }

    /**
     * Get the current follower count
     * @returns {Promise<object>} The follower count data
     */
    async getFollowerCount() {
        return new Promise((resolve) => {
            const data = ContentSanitizer.safeReadJSON(this.filePath, { count: 0, ids: [] });
            resolve(data);
        });
    }
}

module.exports = FollowersService;