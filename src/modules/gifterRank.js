const fs = require('fs');
const path = require('path');
const ContentSanitizer = require('../utils/sanitizer');

class GifterRank {
  constructor(config) {
    this.config = config;
    this.gifterRankPath = path.join(__dirname, '../../public', 'gifter-rank', 'gifterRank.json');
    this.updateQueue = [];
  }

  // Function to process the gifter rank update queue
  processQueue() {
    if (this.updateQueue.length === 0) return;

    const msg = this.updateQueue.shift();
    this.updateFromQueue(msg);
    this.processQueue(); // Recursively process the next item in the queue
  }

  // Modified update function to use queue
  update(msg) {
    this.updateQueue.push(msg);
    this.processQueue();
  }

  // Actual update logic moved into this function
  updateFromQueue(msg) {
    let data;
    
    const uniqueId = msg.user.uniqueId;
    const nickname = msg.user.nickname;
    const profilePictureUrl = msg.user.profilePicture?.["url"]?.[0] || null;
    const diamondCount = msg.giftDetails.diamondCount;
    const msgId = msg.common.msgId;
    const repeatCount = msg.repeatCount;
    const repeatEnd = msg.repeatEnd;
    const giftType = msg.giftDetails.giftType;

    if (repeatEnd == false && giftType == 1) {
      return;
    }

    // Read the current data from the file with safe parsing
    data = ContentSanitizer.safeReadJSON(this.gifterRankPath, { totalDiamonds: 0, gifters: {} });

    if (this.config.gifterRank.excludeUsers.includes(uniqueId)) {
      console.log(`Excluding user with uniqueId: ${uniqueId}`);
      return;
    }

    if (!data.gifters[uniqueId]) {
      data.gifters[uniqueId] = {
        uniqueId,
        nickname,
        profilePictureUrl,
        totalDiamonds: 0,
        gifts: {},
      };
    }

    const gifter = data.gifters[uniqueId];

    const diamonds = Number(diamondCount) * Number(repeatCount);

    if (!gifter.gifts[msgId]) {
      gifter.gifts[msgId] = {
        diamonds,
        timestamp: msg.createTime,
        giftName: msg.giftName,
      };

      gifter.totalDiamonds += diamonds;
      data.totalDiamonds += diamonds;

      fs.writeFileSync(this.gifterRankPath, ContentSanitizer.safeStringify(data, 2));
    }
  }

  getTotalDiamonds() {
    const parsedData = ContentSanitizer.safeReadJSON(this.gifterRankPath, { totalDiamonds: 0 });
   
    return parsedData.totalDiamonds;
  }

  getTopGifters(count) {
    try {
      const parsedData = ContentSanitizer.safeReadJSON(this.gifterRankPath, { gifters: {} });

      // Sort gifters by totalDiamonds in descending order and return top 3
      const topGifters = Object.values(parsedData.gifters)
          .sort((a, b) => b.totalDiamonds - a.totalDiamonds)
          .slice(0, count);
  
      return topGifters;
    } catch (error) {
      console.error('Error reading gifter rank API:', error);
    }
  }
  
  initialize(shouldContinue = false) {
    if (shouldContinue) {
      // Check if file exists, if so, preserve it
      if (fs.existsSync(this.gifterRankPath)) {
        console.log('Gifter rank file: Continuing with existing data.');
        return; // Don't reset, preserve existing data
      }
    }

    const initialData = { totalDiamonds: 0, gifters: {} };

    try {
      fs.writeFileSync(this.gifterRankPath, ContentSanitizer.safeStringify(initialData, 2));
      console.log('Gifter rank file has been reset.');
    } catch (error) {
      console.error('Error initializing gifter rank file:', error);
    }
  }
}

module.exports = GifterRank;
