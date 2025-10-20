const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ContentSanitizer = require('../utils/sanitizer');
const FormData = require('form-data');

class Comments {
  constructor(config) {
    this.config = config;
    this.commentsPath = path.join(__dirname, '../../public', 'comments', 'comments.json');
    this.likeRankPath = path.join(__dirname, '../../public', 'like-rank', 'likeRank.json');
    this.viewersPath = path.join(__dirname, '../../public', 'viewers', 'viewers.json');
    this.updateQueue = [];
    this.ensureDirectoryExists();
    this.initTimestamp = Date.now(); // Store initialization timestamp
  }

  // Check if offsite sync is enabled in config
  isOffsiteSyncEnabled() {
    return (
      this.config &&
      this.config.apiCalls &&
      this.config.apiCalls.storeLogOffsite &&
      this.config.apiCalls.storeLogOffsite.enabled === true &&
      this.config.apiCalls.storeLogOffsite.endpoint
    );
  }

  // Start the periodic offsite sync
  startOffsiteSync() {
    console.log('Starting offsite comments sync (every 3 minutes)');
    
    // Perform initial sync
    this.syncCommentsOffsite();
    
    // Set up periodic sync every 3 minutes (180000 ms)
    this.syncInterval = setInterval(() => {
      this.syncCommentsOffsite();
    }, 180000);
  }

  // Stop the offsite sync
  stopOffsiteSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Offsite comments sync stopped');
    }
  }

  // Load like-rank data if available
  getLikeRankData() {
    try {
      if (fs.existsSync(this.likeRankPath)) {
        const likeRankData = fs.readFileSync(this.likeRankPath, 'utf8');
        return JSON.parse(likeRankData);
      }
    } catch (error) {
      console.error('Error reading like-rank data:', error);
    }
    return null;
  }

  getViewerData() {
    try {
      if (fs.existsSync(this.likeRankPath)) {
        const viewerData = fs.readFileSync(this.viewersPath, 'utf8');
        return JSON.parse(viewerData);
      }
    } catch (error) {
      console.error('Error reading like-rank data:', error);
    }
    return null;
  }

  // Perform the actual offsite sync
  syncCommentsOffsite() {
    if (!this.isOffsiteSyncEnabled()) return;
    
    try {
      // Get API URL and endpoint from config
      const baseUrl = this.config.apiCalls.apiUrl || '';
      const endpoint = this.config.apiCalls.storeLogOffsite.endpoint;
      const fullUrl = baseUrl + endpoint;
      
      // Generate filename with initialization timestamp
      const formattedDate = new Date(this.initTimestamp).toISOString()
        .replace(/T/, '-')
        .replace(/\..+/, '')
        .replace(/:/g, '-');
      const syncFilename = `${formattedDate}-stream-log.json`;
      
      // Read the current comments file
      let commentsData = ContentSanitizer.safeReadJSON(this.commentsPath, { likeData: {} });
      
      // Load and add like-rank data if available
      const likeRankData = this.getLikeRankData();
      if (likeRankData) {
        commentsData.likeData = likeRankData;
      } else {
        commentsData.likeData = {}
      }
      
      const viewerData = this.getViewerData();
      if (viewerData) {
        commentsData.viewerData = viewerData;
      } else {
        commentsData.viewerData = {};
        return;
      }

      // Convert back to string with the added like data
      const fileContent = ContentSanitizer.safeStringify(commentsData, 2);
      
      // Create form data
      const formData = new FormData();
      
      // Extract key from endpoint (assuming format like "sync-comments.php?key=xxxx")
      const keyMatch = endpoint.match(/[?&]key=([^&]+)/);
      const key = keyMatch ? keyMatch[1] : '';
      
      // Add key and filename to form data
      if (key) {
        formData.append('key', key);
      }
      formData.append('filename', syncFilename);
      formData.append('content', fileContent);
      
      // Send the request
      axios.post(fullUrl, formData, {
        headers: formData.getHeaders(),
        timeout: 30000 // 30 second timeout
      })
      .then(response => {
        if (response.data && response.data.success) {
          console.log(`Comments successfully synced offsite at ${new Date().toLocaleString()}`);
        } else {
          console.error('Offsite sync error:', response.data);
        }
      })
      .catch(error => {
        console.error('Offsite sync failed:', error.message);
      });
    } catch (error) {
      console.error('Error in syncCommentsOffsite:', error);
    }
  }

  // Ensure the comments directory exists
  ensureDirectoryExists() {
    const commentsDir = path.dirname(this.commentsPath);
    if (!fs.existsSync(commentsDir)) {
      fs.mkdirSync(commentsDir, { recursive: true });
      console.log('Comments directory created:', commentsDir);
    }
  }

  // Function to process the comments update queue
  processQueue() {
    if (this.updateQueue.length === 0) return;
    const msg = this.updateQueue.shift();
    this.updateFromQueue(msg);
    // Recursively process the next item in the queue
    this.processQueue();
  }

  // Add comment to queue for processing
  update(msg) {
    this.updateQueue.push(msg);
    this.processQueue();
  }

  updateFromQueue(msg) {
    let data;
    
    // Check if this is a special event (gift, follow, share, or subscribe)
    const isSpecialEvent = msg.isGift || msg.isShare || msg.isSubscribe || msg.isFollow;
    const eventType = msg.eventType || 'chat';

    const uniqueId = msg.user?.uniqueId || null;
    const nickname = msg.user?.nickname || null;
    const profilePictureUrl = msg.user?.profilePicture?.['url']?.[0] || null;
    const comment = msg.comment || null;
    const createTime = msg.common?.createTime || null;
    const followRole = msg.userRole || null;
    const teamMemberLevel = msg.user?.userHonor?.level || null;
    const followInfo = msg.user?.followInfo || null;
    const userDetails = msg.user || null;
    const isModerator = msg.userIdentity?.isModeratorOfAnchor || null;
    const isSubscriber = msg.userIdentity?.isSubscriberOfAnchor || null;
    const isNewGifter = msg.userIdentity?.isNewGifterOfAnchor || null;
    const isNewSubscriber = msg.userIdentity?.isNewSubscriberOfAnchor || null;
    const msgId = msg.common?.msgId || null;
    
    // Correctly parse timestamps as numbers
    const timestamp = typeof createTime === 'string' ? parseInt(createTime, 10) : createTime;
  
    // Read the current data from the file with safe parsing
    data = ContentSanitizer.safeReadJSON(this.commentsPath, { 
      totalComments: 0, 
      commenters: {},
      commentsById: {}, // Use an object with msgId as keys instead of an array
      commentsOrder: [], // Array of msgIds to maintain order
      initTimestamp: this.initTimestamp // Add initialization timestamp to the data
    });

    // Ensure the necessary data structures exist
    if (!data.commentsById) {
      data.commentsById = {};
    }
    if (!data.commentsOrder) {
      data.commentsOrder = [];
    }
    if (!data.initTimestamp) {
      data.initTimestamp = this.initTimestamp;
    }
  
    // Generate a message ID if one doesn't exist
    const commentId = msgId || `${uniqueId}_${eventType}_${comment}}`;
    
    // Check if we've already processed this message by checking if it exists in commentsById
    if (data.commentsById[commentId]) {
      return;
    }
  
    // Check if we want to exclude users (e.g. bots)
    if (this.config.comments && this.config.comments.excludeUsers && 
        this.config.comments.excludeUsers.includes(uniqueId)) {
      console.log(`Excluding comment from user with uniqueId: ${uniqueId}`);
      return;
    }
  
    // Create or update commenter info
    if (!data.commenters[uniqueId]) {
      data.commenters[uniqueId] = {
        uniqueId,
        nickname,
        profilePictureUrl,
        commentCount: 0
      };
    }
  
    // Generate a special icon/emoji for each type of event
    let eventIcon = '';
    let additionalClasses = '';
    let giftData = {};
    
    if (msg.isGift) {
      eventIcon = '🎁 ';
      additionalClasses = 'event-gift';
      giftData = {
        totalDiamonds: Number(msg["diamondCount"]) * Number(msg["repeatCount"]),
        name: msg["giftName"],
        price: Number(msg["diamondCount"]),
        count: Number(msg["repeatCount"])
      }
    } else if (msg.isShare) {
      eventIcon = '🔄 ';
      additionalClasses = 'event-share';
    } else if (msg.isSubscribe) {
      eventIcon = '⭐ ';
      additionalClasses = 'event-subscribe';
    } else if (msg.isFollow) {
      eventIcon = '👋 ';
      additionalClasses = 'event-follow';
    }
  
    // Prepare comment object with all needed metadata
    const commentObj = {
      id: commentId,
      uniqueId,
      nickname,
      profilePictureUrl,
      comment: isSpecialEvent ? `${eventIcon}${comment}` : comment,
      timestamp: timestamp,
      isPinned: false,
      isHighlighted: false,
      isModerator: !!isModerator,
      isSubscriber: !!isSubscriber,
      isNewGifter: !!isNewGifter,
      isNewSubscriber: !!isNewSubscriber,
      userRole: followRole || 'none',
      teamMemberLevel: teamMemberLevel || 0,
      userDetails: userDetails || {},
      followInfo: followInfo || {},
      // Add event-specific properties
      isSpecialEvent,
      eventType,
      additionalClasses,
      giftData
    };
    
    // Update commenter stats
    data.commenters[uniqueId].commentCount += 1;
    data.commenters[uniqueId].lastSeen = createTime;
    
    // Store comment in the commentsById object using the commentId as the key
    data.commentsById[commentId] = commentObj;
    
    // Add commentId to the commentsOrder array to maintain chronological order
    data.commentsOrder.push(commentId);
    
    // Update total comment count
    data.totalComments += 1;

    // Limit the number of stored comments if configured
    if (this.config.comments && this.config.comments.maxCommentsStored) {
      const maxComments = this.config.comments.maxCommentsStored;
      if (data.commentsOrder.length > maxComments) {
        // Remove oldest comments
        const commentsToRemove = data.commentsOrder.splice(0, data.commentsOrder.length - maxComments);
        
        // Remove those comments from the commentsById object
        commentsToRemove.forEach(id => {
          delete data.commentsById[id];
        });
      }
    }
  
    // Write updated data back to file
    fs.writeFileSync(this.commentsPath, ContentSanitizer.safeStringify(data, 2));
  }

  // Initialize or reset comments file
  initialize() {
    const initialData = { 
      totalComments: 0, 
      commenters: {},
      commentsById: {}, // Use an object instead of an array
      commentsOrder: [], // Array of ids to maintain order
      initTimestamp: this.initTimestamp // Add initialization timestamp
    };

    try {
      // Ensure directory exists before writing
      this.ensureDirectoryExists();
      fs.writeFileSync(this.commentsPath, ContentSanitizer.safeStringify(initialData, 2));
      console.log('Comments file has been initialized.');
    } catch (error) {
      console.error('Error initializing comments file:', error);
    }
  }

  // Get all comments
  getAllComments() {
    try {
      const data = ContentSanitizer.safeReadJSON(this.commentsPath, { 
        totalComments: 0, 
        commenters: {}, 
        comments: [],
        initTimestamp: this.initTimestamp 
      });
      
      // Convert commentsById to array for backward compatibility
      let commentsArray = [];
      if (data.commentsById && data.commentsOrder) {
        // Use commentsOrder to maintain chronological order
        commentsArray = data.commentsOrder.map(id => data.commentsById[id]).filter(Boolean);
      } else if (data.comments) {
        // Backward compatibility with old format
        commentsArray = data.comments;
      }
      
      // Sort comments by timestamp (oldest first) before returning
      commentsArray.sort((a, b) => {
        const tsA = typeof a.timestamp === 'string' ? parseInt(a.timestamp, 10) : a.timestamp;
        const tsB = typeof b.timestamp === 'string' ? parseInt(b.timestamp, 10) : b.timestamp;
        return tsA - tsB;
      });
      
      // Return in a format compatible with previous implementation
      return {
        totalComments: data.totalComments,
        commenters: data.commenters,
        comments: commentsArray,
        initTimestamp: data.initTimestamp,
        likeData: data.likeData // Include likeData if it exists
      };
    } catch (error) {
      console.error('Error reading comments file:', error);
      return { 
        totalComments: 0, 
        commenters: {}, 
        comments: [],
        initTimestamp: this.initTimestamp 
      };
    }
  }

  // Get recent comments
  getRecentComments(limit = 100) {
    try {
      const data = this.getAllComments();
      
      return {
        totalComments: data.totalComments,
        comments: data.comments,
        likeData: data.likeData // Include likeData if it exists
      };
    } catch (error) {
      console.error('Error reading comments file:', error);
      return { totalComments: 0, comments: [] };
    }
  }

  // Pin/unpin a comment
  togglePinComment(commentId, isPinned = true) {
    try {
      const data = ContentSanitizer.safeReadJSON(this.commentsPath, { 
        commentsById: {}, 
        comments: [] 
      });
      
      // Check if we're using the new structure
      if (data.commentsById && data.commentsById[commentId]) {
        data.commentsById[commentId].isPinned = isPinned;
        fs.writeFileSync(this.commentsPath, ContentSanitizer.safeStringify(data, 2));
        return true;
      } 
      // Backward compatibility with old structure
      else if (data.comments) {
        const commentIndex = data.comments.findIndex(c => c.id === commentId);
        if (commentIndex !== -1) {
          data.comments[commentIndex].isPinned = isPinned;
          fs.writeFileSync(this.commentsPath, ContentSanitizer.safeStringify(data, 2));
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error updating pinned comment:', error);
      return false;
    }
  }

  // Highlight/unhighlight a comment
  toggleHighlightComment(commentId, isHighlighted = true) {
    try {
      const data = ContentSanitizer.safeReadJSON(this.commentsPath, { 
        commentsById: {}, 
        comments: [] 
      });
      
      // Check if we're using the new structure
      if (data.commentsById && data.commentsById[commentId]) {
        data.commentsById[commentId].isHighlighted = isHighlighted;
        fs.writeFileSync(this.commentsPath, ContentSanitizer.safeStringify(data, 2));
        return true;
      } 
      // Backward compatibility with old structure
      else if (data.comments) {
        const commentIndex = data.comments.findIndex(c => c.id === commentId);
        if (commentIndex !== -1) {
          data.comments[commentIndex].isHighlighted = isHighlighted;
          fs.writeFileSync(this.commentsPath, ContentSanitizer.safeStringify(data, 2));
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Error updating highlighted comment:', error);
      return false;
    }
  }

  // Get pinned comments
  getPinnedComments() {
    try {
      const data = this.getAllComments();
      
      // Get pinned comments and sort them by timestamp (oldest first)
      const pinnedComments = data.comments.filter(c => c.isPinned);
      pinnedComments.sort((a, b) => {
        const tsA = typeof a.timestamp === 'string' ? parseInt(a.timestamp, 10) : a.timestamp;
        const tsB = typeof b.timestamp === 'string' ? parseInt(b.timestamp, 10) : b.timestamp;
        return tsA - tsB;
      });
      
      return {
        comments: pinnedComments,
        likeData: data.likeData // Include likeData if it exists
      };
    } catch (error) {
      console.error('Error getting pinned comments:', error);
      return { comments: [] };
    }
  }

  // Get comments from a specific user
  getUserComments(uniqueId) {
    try {
      const data = this.getAllComments();
      return {
        commenter: data.commenters[uniqueId] || null,
        comments: data.comments.filter(c => c.uniqueId === uniqueId),
        likeData: data.likeData // Include likeData if it exists
      };
    } catch (error) {
      console.error('Error getting user comments:', error);
      return { commenter: null, comments: [] };
    }
  }

  // Check if a message has been processed (public method)
  hasProcessedMessage(msgId) {
    try {
      if (!msgId) return false;
      
      const data = ContentSanitizer.safeReadJSON(this.commentsPath, { 
        commentsById: {} 
      });
      
      // Check if using new structure
      if (data.commentsById) {
        return !!data.commentsById[msgId];
      }
      // Backward compatibility with processedMsgs
      else if (data.processedMsgs) {
        return data.processedMsgs[msgId] === true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking processed message:', error);
      return false;
    }
  }
  
  // Perform final sync and cleanup before shutdown
  shutdown() {
    // Perform one final sync if enabled
    if (this.isOffsiteSyncEnabled()) {
      console.log('Performing final offsite sync before shutdown...');
      this.syncCommentsOffsite();
    }
    
    // Stop the sync interval
    this.stopOffsiteSync();
  }
}

module.exports = Comments;