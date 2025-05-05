// services/followers.js - Follower tracking service
const fs = require('fs');
const path = require('path');

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
            fs.writeFileSync(this.filePath, JSON.stringify(initialData, null, 2));
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
        try {
            // Read the current data from the file
            const fileData = fs.readFileSync(this.filePath, 'utf8');
            data = JSON.parse(fileData);
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
            
            // Write the updated data back to the file
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
        }
        
        return data.count;
    }

    /**
     * Get the current follower count
     * @returns {Promise<object>} The follower count data
     */
    async getFollowerCount() {
        return new Promise((resolve, reject) => {
            fs.readFile(this.filePath, 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(JSON.parse(data));
                }
            });
        });
    }
}

module.exports = FollowersService;