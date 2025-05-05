const fs = require('fs');
const path = require('path');

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

    const { uniqueId, nickname, profilePictureUrl, diamondCount, msgId, repeatCount, repeatEnd, giftType } = msg;

    if (repeatEnd == false && giftType == 1) {
      return;
    }

    try {
      const fileData = fs.readFileSync(this.gifterRankPath, 'utf8');
      data = JSON.parse(fileData);
    } catch (error) {
      console.error('Error reading gifter rank file:', error);
      data = { totalDiamonds: 0, gifters: {} };
    }

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

      fs.writeFileSync(this.gifterRankPath, JSON.stringify(data, null, 2));
    }
  }

  getTotalDiamonds() {
    const data = fs.readFileSync(this.gifterRankPath, 'utf8');
    const parsedData = JSON.parse(data);
   
    return parsedData.totalDiamonds;
  }

  getTopGifters(count) {
    try {
      const data = fs.readFileSync(this.gifterRankPath, 'utf8');
      const parsedData = JSON.parse(data);

      // Sort gifters by totalDiamonds in descending order and return top 3
      const topGifters = Object.values(parsedData.gifters)
          .sort((a, b) => b.totalDiamonds - a.totalDiamonds)
          .slice(0, count);
  
      return topGifters;
    } catch (error) {
      console.error('Error reading gifter rank API:', error);
    }
  }
  
  initialize() {
    const initialData = { totalDiamonds: 0, gifters: {} };

    try {
      fs.writeFileSync(this.gifterRankPath, JSON.stringify(initialData, null, 2));
      console.log('Gifter rank file has been reset.');
    } catch (error) {
      console.error('Error initializing gifter rank file:', error);
    }
  }
}

module.exports = GifterRank;
