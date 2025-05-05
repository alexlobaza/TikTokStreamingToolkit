const fs = require('fs');
const path = require('path');

class Viewers {
  constructor(config) {
    this.config = config;
    this.viewersPath = path.join(__dirname, '../../public', 'viewers', 'viewers.json');
    this.updateQueue = [];
    this.ensureDirectoryExists();
  }

  // Ensure the directory exists before writing
  ensureDirectoryExists() {
    const dir = path.dirname(this.viewersPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log('Created viewers directory');
    }
  }

  // Function to process the viewers update queue
  processQueue() {
    if (this.updateQueue.length === 0) return;
    const data = this.updateQueue.shift();
    this.updateFromQueue(data);
    this.processQueue(); // Recursively process the next item in the queue
  }

  // Modified update function to use queue
  update(data) {
    this.updateQueue.push(data);
    this.processQueue();
  }

  // Actual update logic moved into this function
  updateFromQueue(data) {
    let fileData;
    try {
      const rawData = fs.readFileSync(this.viewersPath, 'utf8');
      fileData = JSON.parse(rawData);
    } catch (error) {
      console.error('Error reading viewers file:', error);
      fileData = { 
        entries: {},
        totalUpdates: 0
      };
    }

    const { viewerCount, msgId, roomId } = data;
    const timestamp = Date.now();
    const eventId = msgId || `viewer_${timestamp}`;

    // Check if this event ID already exists (avoiding duplicates)
    if (fileData.entries[eventId]) {
      return;
    }

    // Add the new entry using eventId as the key
    fileData.entries[eventId] = {
      timestamp,
      viewerCount,
      roomId
    };

    // Update the total count of updates
    fileData.totalUpdates++;

    // Write the updated data back to the file
    fs.writeFileSync(this.viewersPath, JSON.stringify(fileData, null, 2));
  }

  initialize() {
    const initialData = { 
      entries: {},
      totalUpdates: 0
    };
    
    try {
      this.ensureDirectoryExists();
      fs.writeFileSync(this.viewersPath, JSON.stringify(initialData, null, 2));
      console.log('Viewers file has been reset.');
    } catch (error) {
      console.error('Error initializing viewers file:', error);
    }
  }
}

module.exports = Viewers;