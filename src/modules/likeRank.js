const fs = require('fs');
const path = require('path');

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

    try {
      const fileData = fs.readFileSync(this.likeRankPath, 'utf8');
      data = JSON.parse(fileData);
    } catch (error) {
      console.error('Error reading like rank file:', error);
      data = { totalLikes: 0, likers: {} };
    }

    const { uniqueId, likeCount, profilePictureUrl, nickname, msgId } = msg;

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
        timestamp: msg.createTime,
        giftName: msg.giftName,
      };

      liker.totalLikes += Math.round(likeCount * multiplier);
      data.totalLikes += Math.round(likeCount * multiplier);
      fs.writeFileSync(this.likeRankPath, JSON.stringify(data, null, 2));
    }
  }

getTopLikers(count) {
  try {
    const data = fs.readFileSync(this.likeRankPath, 'utf8');
    const parsedData = JSON.parse(data);

    // Sort gifters by totalDiamonds in descending order and return top 3
    const topLikers = Object.values(parsedData.likers)
        .sort((a, b) => b.totalLikes - a.totalLikes)
        .slice(0, count);

   return topLikers;
  } catch (error) {
    console.error('Error reading like rank API:', error);
  }
}

  initialize() {
    const initialData = { totalLikes: 0, likers: {} };

    try {
      fs.writeFileSync(this.likeRankPath, JSON.stringify(initialData, null, 2));
      console.log('Like rank file has been reset.');
    } catch (error) {
      console.error('Error initializing like rank file:', error);
    }
  }
}

module.exports = LikeRank;
