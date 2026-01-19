const fs = require('fs');
const path = require('path');
const ContentSanitizer = require('../utils/sanitizer');

class LikeRank {
  constructor(config) {
    this.config = config;
    this.likeRankPath = path.join(__dirname, '../../public', 'like-rank', 'likeRank.json');
    this.updateQueue = [];
  }

  // Function to process the like rank update queue
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
    const profilePictureUrl = msg.user.profilePicture["url"][0];
    const likeCount = msg.likeCount;
    const msgId = msg.common.msgId;

    // Read the current data from the file with safe parsing
    data = ContentSanitizer.safeReadJSON(this.likeRankPath, { totalLikes: 0, likers: {} });

    if (this.config.likeRank.excludeUsers.includes(uniqueId)) {
      return;
    }

    if (!data.likers[uniqueId]) {
      data.likers[uniqueId] = {
        uniqueId,
        nickname,
        profilePictureUrl,
        totalLikes: 0,
        likeEvents: {},
      };
    }

    const liker = data.likers[uniqueId];
    const multiplier = likeCount >= 15 ? 2 : 1;

    if (!liker.likeEvents[msgId]) {
      liker.likeEvents[msgId] = {
        likes: Math.round(likeCount * multiplier),
        timestamp: msg.common?.createTime,
        giftName: msg.giftDetails?.giftName,
      };

      liker.totalLikes += Math.round(likeCount * multiplier);
      data.totalLikes += Math.round(likeCount * multiplier);
      fs.writeFileSync(this.likeRankPath, ContentSanitizer.safeStringify(data, 2));
    }
  }

  getTopLikers(count) {
    try {
      const parsedData = ContentSanitizer.safeReadJSON(this.likeRankPath, { likers: {} });

    // Sort gifters by totalDiamonds in descending order and return top 3
    const topLikers = Object.values(parsedData.likers)
        .sort((a, b) => b.totalLikes - a.totalLikes)
        .slice(0, count);

   return topLikers;
  } catch (error) {
    console.error('Error reading like rank API:', error);
  }
}

  initialize(shouldContinue = false) {
    if (shouldContinue) {
      // Check if file exists, if so, preserve it
      if (fs.existsSync(this.likeRankPath)) {
        console.log('Like rank file: Continuing with existing data.');
        return; // Don't reset, preserve existing data
      }
    }

    const initialData = { totalLikes: 0, likers: {} };

    try {
      fs.writeFileSync(this.likeRankPath, ContentSanitizer.safeStringify(initialData, 2));
      console.log('Like rank file has been reset.');
    } catch (error) {
      console.error('Error initializing like rank file:', error);
    }
  }
}

module.exports = LikeRank;
