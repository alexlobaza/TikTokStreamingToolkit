document.addEventListener('DOMContentLoaded', function() {
    // Connect to socket
    const socket = io.connect('/', {
        query: { route: '/comments' },
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
    });

    // DOM elements
    const allCommentsContainer = document.getElementById('allComments');
    const pinnedCommentsContainer = document.getElementById('pinnedComments');
    const highlightedCommentsContainer = document.getElementById('highlightedComments');
    const giftsCommentsContainer = document.getElementById('giftsComments');
    const followsCommentsContainer = document.getElementById('followsComments');
    const subscribesCommentsContainer = document.getElementById('subscribesComments');
    const sharesCommentsContainer = document.getElementById('sharesComments');
    const superFansCommentsContainer = document.getElementById('superFansComments');
    const commentTemplate = document.getElementById('commentTemplate');
    const searchInput = document.getElementById('searchInput');
    const totalCommentsElement = document.getElementById('totalComments');
    const uniqueCommentersElement = document.getElementById('uniqueCommenters');
    const pinnedCountElement = document.getElementById('pinnedCount');
    const topCommentersElement = document.getElementById('topCommenters');
    const giftsCountElement = document.getElementById('giftsCount');
    const followsCountElement = document.getElementById('followsCount');
    const subscribesCountElement = document.getElementById('subscribesCount');
    const sharesCountElement = document.getElementById('sharesCount');
    const superFansCountElement = document.getElementById('superFansCount');
    const newCommentsAlert = document.getElementById('newCommentsAlert');
    const toggleThemeBtn = document.getElementById('toggleThemeBtn');
    const increaseFontBtn = document.getElementById('increaseFontBtn');
    const decreaseFontBtn = document.getElementById('decreaseFontBtn');

    // State
    let allComments = [];
    let commenters = {};
    let userScrolled = false;
    let newCommentsCount = 0;
    let currentFontSize = 1; // Base font size multiplier
    const fontSizeStep = 0.1; // Step to increase/decrease font size

    // Format timestamp
    function formatTimestamp(timestamp) {
        // Convert string timestamp to number if needed 
        const timestampNum = parseInt(timestamp, 10);
        // Check if timestamp is valid
        if (isNaN(timestampNum)) return "Invalid date";
        
        const date = new Date(timestampNum);
        // Verify date is valid
        if (isNaN(date.getTime())) return "Invalid date";
        
        return date.toLocaleString();
    }

    // Create comment element
    function createCommentElement(comment) {
        const template = commentTemplate.content.cloneNode(true);
        const commentCard = template.querySelector('.comment-card');
        
        if (comment.isPinned) {
            commentCard.classList.add('pinned');
        }
        
        if (comment.isHighlighted) {
            commentCard.classList.add('highlighted');
        }
        
        // Add event-specific class if it's a special event
        if (comment.isSpecialEvent && comment.additionalClasses) {
            commentCard.classList.add(comment.additionalClasses);
        }
        
        commentCard.id = `comment-${comment.id}`;
        
        // Set comment data
        template.querySelector('.profile-img').src = comment.profilePictureUrl || '';
        template.querySelector('.username').textContent = comment.nickname;
        
        // Add badges
        if (comment.isModerator) {
            const badge = document.createElement('span');
            badge.classList.add('user-badge', 'badge-mod');
            badge.textContent = 'MOD';
            template.querySelector('.username').appendChild(badge);
        }
        
        if (comment.isSubscriber) {
            const badge = document.createElement('span');
            badge.classList.add('user-badge', 'badge-sub');
            badge.textContent = 'SUB';
            template.querySelector('.username').appendChild(badge);
        }

        // Add team badge based on teamMemberLevel
        if (comment.teamMemberLevel && comment.teamMemberLevel >= 1) {
            const teamBadge = document.createElement('span');
            teamBadge.classList.add('user-badge', 'badge-team');
            
            // Always use light red with heart icon for team members
            teamBadge.innerHTML = `❤️ ${comment.teamMemberLevel}`;
            teamBadge.style.backgroundColor = '#8B0000'; // Light red color
            
            template.querySelector('.username').appendChild(teamBadge);
        }
        
        // Add event badge if it's a special event
        if (comment.isSpecialEvent) {
            const eventBadge = document.createElement('span');
            eventBadge.classList.add('user-badge', `badge-${comment.eventType}`);
            
            switch(comment.eventType) {
                case 'gift':
                    eventBadge.textContent = 'GIFT';
                    eventBadge.style.backgroundColor = '#f6b26b';
                    break;
                case 'share':
                    eventBadge.textContent = 'SHARE';
                    eventBadge.style.backgroundColor = '#6fa8dc';
                    break;
                case 'subscribe':
                    eventBadge.textContent = 'SUB';
                    eventBadge.style.backgroundColor = '#8e7cc3';
                    break;
                case 'superFan':
                    eventBadge.textContent = 'SF';
                    eventBadge.style.backgroundColor = '#e74c3c';
                    break;
                case 'follow':
                    eventBadge.textContent = 'FOLLOW';
                    eventBadge.style.backgroundColor = '#93c47d';
                    break;
            }
            
            template.querySelector('.username').appendChild(eventBadge);
        }
        
        template.querySelector('.timestamp').textContent = formatTimestamp(comment.timestamp);
        template.querySelector('.comment-text').textContent = comment.comment;
        
        // Setup button actions
        const pinBtn = template.querySelector('.pin-btn');
        pinBtn.textContent = comment.isPinned ? 'Unpin' : 'Pin';
        pinBtn.addEventListener('click', () => togglePinComment(comment.id, !comment.isPinned));
        
        const highlightBtn = template.querySelector('.highlight-btn');
        highlightBtn.textContent = comment.isHighlighted ? 'Unhighlight' : 'Highlight';
        highlightBtn.addEventListener('click', () => toggleHighlightComment(comment.id, !comment.isHighlighted));
        
        return template;
    }

    function capitalize(str) {
        if (!str) return str;
        return str.toUpperCase();
    }

    // Convert number to words (helper function)
    function numberToWords(num) {
        const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
                        'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 
                        'seventeen', 'eighteen', 'nineteen'];
        const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
        
        // For numbers 1-19
        if (num < 20) {
            return ones[num];
        }
        
        // For numbers 20-99
        if (num < 100) {
            return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? '-' + ones[num % 10] : '');
        }
        
        // For numbers 100-999
        if (num < 1000) {
            return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 !== 0 ? ' ' + numberToWords(num % 100) : '');
        }
        
        // For numbers 1000+
        if (num < 1000000) {
            return numberToWords(Math.floor(num / 1000)) + ' thousand' + (num % 1000 !== 0 ? ' ' + numberToWords(num % 1000) : '');
        }
        
        // Fallback for larger numbers or zero
        return num.toString();
    }

    // Load comments
    async function loadComments() {
        try {
            const response = await fetch('/api/comments');
            const data = await response.json();
            
            // Check for and remove duplicates before assigning
            allComments = removeDuplicateComments(data.comments);
            totalCommentsElement.textContent = allComments.length;
            console.log(totalCommentsElement.textContent)
            
            // Count unique commenters
            const uniqueIds = new Set();
            allComments.forEach(comment => uniqueIds.add(comment.uniqueId));
            uniqueCommentersElement.textContent = uniqueIds.size;
            
            // Update counts for each event type
            updateEventCounts();
            
            // Render the main tabs
            renderComments();
            loadPinnedComments();
            loadTopCommenters();
            
            // Scroll to bottom on initial load only if user hasn't scrolled
            if (!userScrolled) {
                scrollToBottom();
            }
        } catch (error) {
            console.error('Error loading comments:', error);
            allCommentsContainer.innerHTML = '<div class="no-comments">Failed to load comments.</div>';
        }
    }

    // Function to remove duplicate comments
    function removeDuplicateComments(comments) {
        const uniqueComments = [];
        const seenCombinations = new Set();
        
        for (const comment of comments) {
            // Create a unique key combining user ID, timestamp (to nearest second), and comment text
            const timestamp = typeof comment.timestamp === 'string' ? 
                parseInt(comment.timestamp, 10) : comment.timestamp;
            const roundedTimestamp = Math.floor(timestamp / 1000); // Round to nearest second
            const key = `${comment.uniqueId}_${roundedTimestamp}_${comment.comment}`;
            
            if (!seenCombinations.has(key)) {
                seenCombinations.add(key);
                uniqueComments.push(comment);
            } else {
                console.log('Removed duplicate comment:', comment.comment);
            }
        }
        
        return uniqueComments;
    }

    // Load pinned comments
    async function loadPinnedComments() {
        try {
            const response = await fetch('/api/comments/pinned');
            const data = await response.json();
            
            const pinnedComments = data.comments;
            pinnedCountElement.textContent = pinnedComments.length;
            
            if (pinnedComments.length === 0) {
                pinnedCommentsContainer.innerHTML = '<div class="no-comments">No pinned comments yet.</div>';
                return;
            }
            
            pinnedCommentsContainer.innerHTML = '';
            
            // Sort pinned comments by timestamp (oldest first)
            const sortedPinned = [...pinnedComments].sort((a, b) => {
                const tsA = typeof a.timestamp === 'string' ? parseInt(a.timestamp, 10) : a.timestamp;
                const tsB = typeof b.timestamp === 'string' ? parseInt(b.timestamp, 10) : b.timestamp;
                return tsA - tsB;
            });
            
            sortedPinned.forEach(comment => {
                pinnedCommentsContainer.appendChild(createCommentElement(comment));
            });
            
            // Scroll to bottom for newest pinned comments if active tab
            if (document.querySelector('#pinned-tab').classList.contains('active') && !userScrolled) {
                pinnedCommentsContainer.scrollTop = pinnedCommentsContainer.scrollHeight;
            }
        } catch (error) {
            console.error('Error loading pinned comments:', error);
            pinnedCommentsContainer.innerHTML = '<div class="no-comments">Failed to load pinned comments.</div>';
        }
    }

    // Update event counts
    function updateEventCounts() {
        const giftCount = allComments.filter(c => c.eventType === 'gift').length;
        const followCount = allComments.filter(c => c.eventType === 'follow').length;
        const subscribeCount = allComments.filter(c => c.eventType === 'subscribe').length;
        const shareCount = allComments.filter(c => c.eventType === 'share').length;
        const superFanCount = allComments.filter(c => c.eventType === 'superFan').length;
        
        giftsCountElement.textContent = giftCount;
        followsCountElement.textContent = followCount;
        subscribesCountElement.textContent = subscribeCount;
        sharesCountElement.textContent = shareCount;
        superFansCountElement.textContent = superFanCount;
        
        // Also render each category
        renderEventComments('gift', 'giftsComments');
        renderEventComments('follow', 'followsComments');
        renderEventComments('subscribe', 'subscribesComments');
        renderEventComments('share', 'sharesComments');
        renderEventComments('superFan', 'superFansComments');
    }

    // Render event-specific tabs
    function renderEventComments(eventType, containerId) {
        const container = document.getElementById(containerId);
        const eventComments = allComments.filter(c => c.eventType === eventType);
        
        container.innerHTML = '';
        
        if (eventComments.length === 0) {
            container.innerHTML = `<div class="no-comments">No ${eventType}s yet.</div>`;
            return;
        }
        
        // Sort by timestamp (oldest first)
        const sortedComments = [...eventComments].sort((a, b) => {
            const tsA = typeof a.timestamp === 'string' ? parseInt(a.timestamp, 10) : a.timestamp;
            const tsB = typeof b.timestamp === 'string' ? parseInt(b.timestamp, 10) : b.timestamp;
            return tsA - tsB;
        });
        
        sortedComments.forEach(comment => {
            container.appendChild(createCommentElement(comment));
        });
        
        // Scroll to bottom if this tab is active and user hasn't scrolled
        if (document.querySelector(`#${eventType}s-tab`).classList.contains('active') && !userScrolled) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // Load top commenters
    async function loadTopCommenters() {
        try {
            const response = await fetch('/api/comments');
            const data = await response.json();
            
            // Process commenters from the actual data structure
            if (!data.commenters && data.comments) {
                // Build commenters object from comments if not available directly
                const commentersMap = {};
                data.comments.forEach(comment => {
                    if (!commentersMap[comment.uniqueId]) {
                        commentersMap[comment.uniqueId] = {
                            uniqueId: comment.uniqueId,
                            nickname: comment.nickname,
                            profilePictureUrl: comment.profilePictureUrl,
                            commentCount: 1
                        };
                    } else {
                        commentersMap[comment.uniqueId].commentCount++;
                    }
                });
                commenters = commentersMap;
            } else {
                commenters = data.commenters || {};
            }
            
            // Sort commenters by comment count
            const sortedCommenters = Object.values(commenters)
                .sort((a, b) => b.commentCount - a.commentCount)
                .slice(0, 5);
            
            topCommentersElement.innerHTML = '';
            
            if (sortedCommenters.length === 0) {
                topCommentersElement.innerHTML = '<li class="list-group-item">No commenters yet.</li>';
                return;
            }
            
            sortedCommenters.forEach(commenter => {
                const item = document.createElement('li');
                item.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
                
                const nameSpan = document.createElement('span');
                nameSpan.classList.add('d-flex', 'align-items-center');
                
                const img = document.createElement('img');
                img.src = commenter.profilePictureUrl || '';
                img.alt = 'Profile';
                img.style.width = '24px';
                img.style.height = '24px';
                img.style.borderRadius = '50%';
                img.style.marginRight = '8px';
                
                nameSpan.appendChild(img);
                nameSpan.appendChild(document.createTextNode(commenter.nickname));
                
                const badge = document.createElement('span');
                badge.classList.add('badge', 'bg-primary', 'rounded-pill');
                badge.textContent = commenter.commentCount;
                
                item.appendChild(nameSpan);
                item.appendChild(badge);
                
                item.addEventListener('click', () => {
                    searchInput.value = commenter.nickname;
                    searchComments();
                });
                
                topCommentersElement.appendChild(item);
            });
        } catch (error) {
            console.error('Error loading top commenters:', error);
            topCommentersElement.innerHTML = '<li class="list-group-item">Failed to load commenters.</li>';
        }
    }

    // Filter and render comments
    function renderComments() {
        const searchTerm = searchInput.value.toLowerCase();
        
        // Get sorted filtered comments
        const filteredComments = searchTerm 
            ? allComments.filter(comment => 
                comment.comment.toLowerCase().includes(searchTerm) || 
                comment.nickname.toLowerCase().includes(searchTerm) ||
                comment.uniqueId.toLowerCase().includes(searchTerm)
            )
            : allComments;
        
        allCommentsContainer.innerHTML = '';
        
        if (filteredComments.length === 0) {
            allCommentsContainer.innerHTML = '<div class="no-comments">No comments found.</div>';
            return;
        }
        
        // Sort comments by timestamp (oldest first)
        const sortedComments = [...filteredComments].sort((a, b) => {
            // Convert timestamps to numbers to ensure correct sorting
            const tsA = typeof a.timestamp === 'string' ? parseInt(a.timestamp, 10) : a.timestamp;
            const tsB = typeof b.timestamp === 'string' ? parseInt(b.timestamp, 10) : b.timestamp;
            return tsA - tsB;
        });
        
        sortedComments.forEach(comment => {
            allCommentsContainer.appendChild(createCommentElement(comment));
        });
        
        // Scroll to bottom to show newest comments if user hasn't scrolled
        if (!userScrolled && document.querySelector('#all-tab').classList.contains('active')) {
            scrollToBottom();
        }
        
        // Also update highlighted comments
        renderHighlightedComments();
    }

    // Update highlighted comments
    function renderHighlightedComments() {
        const highlightedComments = allComments.filter(comment => comment.isHighlighted);
        
        highlightedCommentsContainer.innerHTML = '';
        
        if (highlightedComments.length === 0) {
            highlightedCommentsContainer.innerHTML = '<div class="no-comments">No highlighted comments yet.</div>';
            return;
        }
        
        // Sort by timestamp (oldest first)
        const sortedHighlighted = [...highlightedComments].sort((a, b) => {
            const tsA = typeof a.timestamp === 'string' ? parseInt(a.timestamp, 10) : a.timestamp;
            const tsB = typeof b.timestamp === 'string' ? parseInt(b.timestamp, 10) : b.timestamp;
            return tsA - tsB;
        });
        
        sortedHighlighted.forEach(comment => {
            highlightedCommentsContainer.appendChild(createCommentElement(comment));
        });
        
        // Scroll to the bottom to show the newest highlighted comments if active tab
        if (document.querySelector('#highlighted-tab').classList.contains('active') && !userScrolled) {
            highlightedCommentsContainer.scrollTop = highlightedCommentsContainer.scrollHeight;
        }
    }

    // Toggle pin status
    async function togglePinComment(commentId, isPinned) {
        try {
            const response = await fetch(`/api/comments/pin/${commentId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isPinned })
            });
            
            if (response.ok) {
                // Update comment in array
                const commentIndex = allComments.findIndex(c => c.id === commentId);
                if (commentIndex !== -1) {
                    allComments[commentIndex].isPinned = isPinned;
                }
                
                // Reload pinned comments
                loadPinnedComments();
                
                // Update current view
                renderComments();
            }
        } catch (error) {
            console.error('Error toggling pin status:', error);
        }
    }

    // Toggle highlight status
    async function toggleHighlightComment(commentId, isHighlighted) {
        try {
            const response = await fetch(`/api/comments/highlight/${commentId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isHighlighted })
            });
            
            if (response.ok) {
                // Update comment in array
                const commentIndex = allComments.findIndex(c => c.id === commentId);
                if (commentIndex !== -1) {
                    allComments[commentIndex].isHighlighted = isHighlighted;
                }
                
                // Update current view
                renderComments();
            }
        } catch (error) {
            console.error('Error toggling highlight status:', error);
        }
    }

    // Search comments
    function searchComments() {
        renderComments();
    }

    // Scroll to bottom of comments container
    function scrollToBottom() {
        if (document.querySelector('#all-tab').classList.contains('active')) {
            allCommentsContainer.scrollTop = allCommentsContainer.scrollHeight;
        } else if (document.querySelector('#pinned-tab').classList.contains('active')) {
            pinnedCommentsContainer.scrollTop = pinnedCommentsContainer.scrollHeight;
        } else if (document.querySelector('#highlighted-tab').classList.contains('active')) {
            highlightedCommentsContainer.scrollTop = highlightedCommentsContainer.scrollHeight;
        } else if (document.querySelector('#gifts-tab').classList.contains('active')) {
            giftsCommentsContainer.scrollTop = giftsCommentsContainer.scrollHeight;
        } else if (document.querySelector('#follows-tab').classList.contains('active')) {
            followsCommentsContainer.scrollTop = followsCommentsContainer.scrollHeight;
        } else if (document.querySelector('#subscribes-tab').classList.contains('active')) {
            subscribesCommentsContainer.scrollTop = subscribesCommentsContainer.scrollHeight;
        } else if (document.querySelector('#shares-tab').classList.contains('active')) {
            sharesCommentsContainer.scrollTop = sharesCommentsContainer.scrollHeight;
        } else if (document.querySelector('#superFans-tab').classList.contains('active')) {
            superFansCommentsContainer.scrollTop = superFansCommentsContainer.scrollHeight;
        }
    }

    // Auto-scroll when new comments come in (only if already at bottom)
    function autoScrollOnNewComment() {
        let activeContainer;
        
        if (document.querySelector('#all-tab').classList.contains('active')) {
            activeContainer = allCommentsContainer;
        } else if (document.querySelector('#pinned-tab').classList.contains('active')) {
            activeContainer = pinnedCommentsContainer;
        } else if (document.querySelector('#highlighted-tab').classList.contains('active')) {
            activeContainer = highlightedCommentsContainer;
        } else if (document.querySelector('#gifts-tab').classList.contains('active')) {
            activeContainer = giftsCommentsContainer;
        } else if (document.querySelector('#follows-tab').classList.contains('active')) {
            activeContainer = followsCommentsContainer;
        } else if (document.querySelector('#subscribes-tab').classList.contains('active')) {
            activeContainer = subscribesCommentsContainer;
        } else if (document.querySelector('#shares-tab').classList.contains('active')) {
            activeContainer = sharesCommentsContainer;
        } else if (document.querySelector('#superFans-tab').classList.contains('active')) {
            activeContainer = superFansCommentsContainer;
        } else {
            return; // No active container
        }
        
        const isAtBottom = activeContainer.scrollHeight - activeContainer.clientHeight <= 
                        activeContainer.scrollTop + 50; // Within 50px of bottom
        
        if (isAtBottom && !userScrolled) {
            activeContainer.scrollTop = activeContainer.scrollHeight;
            hideNewCommentsAlert();
        } else if (userScrolled) {
            // Show new comments alert
            newCommentsCount++;
            showNewCommentsAlert();
        }
    }

    // Show new comments alert
    function showNewCommentsAlert() {
        newCommentsAlert.style.display = 'block';
        newCommentsAlert.textContent = `${newCommentsCount} new comment${newCommentsCount > 1 ? 's' : ''} available`;
    }

    // Hide new comments alert
    function hideNewCommentsAlert() {
        newCommentsAlert.style.display = 'none';
        newCommentsCount = 0;
    }

    // Toggle dark mode
    function toggleTheme() {
        const html = document.documentElement;
        const isDarkMode = html.getAttribute('data-theme') === 'dark';
        
        if (isDarkMode) {
            html.setAttribute('data-theme', 'light');
            toggleThemeBtn.innerHTML = '<i class="bi bi-moon"></i> Dark Mode';
        } else {
            html.setAttribute('data-theme', 'dark');
            toggleThemeBtn.innerHTML = '<i class="bi bi-sun"></i> Light Mode';
        }
    }

    // Update font size
    function updateFontSize(increase) {
        if (increase) {
            currentFontSize += fontSizeStep;
        } else {
            currentFontSize = Math.max(0.7, currentFontSize - fontSizeStep);
        }
        
        document.documentElement.style.setProperty('--comment-font-size', `${currentFontSize}rem`);
        document.documentElement.style.setProperty('--username-font-size', `${currentFontSize * 1.25}rem`);
        document.documentElement.style.setProperty('--timestamp-font-size', `${currentFontSize * 0.8}rem`);
    }

    // Event listeners
    searchInput.addEventListener('input', () => {
        searchComments();
    });

    // Detect user scroll for each container
    allCommentsContainer.addEventListener('scroll', () => {
        const isAtBottom = allCommentsContainer.scrollHeight - allCommentsContainer.clientHeight <= 
                           allCommentsContainer.scrollTop + 50;
        if (!isAtBottom) {
            userScrolled = true;
        } else {
            userScrolled = false;
            hideNewCommentsAlert();
        }
    });

    pinnedCommentsContainer.addEventListener('scroll', () => {
        const isAtBottom = pinnedCommentsContainer.scrollHeight - pinnedCommentsContainer.clientHeight <= 
                           pinnedCommentsContainer.scrollTop + 50;
        if (!isAtBottom) {
            userScrolled = true;
        } else {
            userScrolled = false;
        }
    });

    highlightedCommentsContainer.addEventListener('scroll', () => {
        const isAtBottom = highlightedCommentsContainer.scrollHeight - highlightedCommentsContainer.clientHeight <= 
                           highlightedCommentsContainer.scrollTop + 50;
        if (!isAtBottom) {
            userScrolled = true;
        } else {
            userScrolled = false;
        }
    });

    giftsCommentsContainer.addEventListener('scroll', () => {
        const isAtBottom = giftsCommentsContainer.scrollHeight - giftsCommentsContainer.clientHeight <= 
                           giftsCommentsContainer.scrollTop + 50;
        if (!isAtBottom) {
            userScrolled = true;
        } else {
            userScrolled = false;
        }
    });

    followsCommentsContainer.addEventListener('scroll', () => {
        const isAtBottom = followsCommentsContainer.scrollHeight - followsCommentsContainer.clientHeight <= 
                           followsCommentsContainer.scrollTop + 50;
        if (!isAtBottom) {
            userScrolled = true;
        } else {
            userScrolled = false;
        }
    });

    subscribesCommentsContainer.addEventListener('scroll', () => {
        const isAtBottom = subscribesCommentsContainer.scrollHeight - subscribesCommentsContainer.clientHeight <= 
                           subscribesCommentsContainer.scrollTop + 50;
        if (!isAtBottom) {
            userScrolled = true;
        } else {
            userScrolled = false;
        }
    });

    sharesCommentsContainer.addEventListener('scroll', () => {
        const isAtBottom = sharesCommentsContainer.scrollHeight - sharesCommentsContainer.clientHeight <= 
                           sharesCommentsContainer.scrollTop + 50;
        if (!isAtBottom) {
            userScrolled = true;
        } else {
            userScrolled = false;
        }
    });

    superFansCommentsContainer.addEventListener('scroll', () => {
        const isAtBottom = superFansCommentsContainer.scrollHeight - superFansCommentsContainer.clientHeight <= 
                           superFansCommentsContainer.scrollTop + 50;
        if (!isAtBottom) {
            userScrolled = true;
        } else {
            userScrolled = false;
        }
    });

    // New comments alert click handler
    newCommentsAlert.addEventListener('click', () => {
        userScrolled = false;
        scrollToBottom();
        hideNewCommentsAlert();
    });

    // Theme toggle
    toggleThemeBtn.addEventListener('click', toggleTheme);

    // Font size controls
    increaseFontBtn.addEventListener('click', () => updateFontSize(true));
    decreaseFontBtn.addEventListener('click', () => updateFontSize(false));

    // Tab click handlers
    document.getElementById('all-tab').addEventListener('click', () => {
        setTimeout(() => {
            if (!userScrolled) {
                allCommentsContainer.scrollTop = allCommentsContainer.scrollHeight;
            }
        }, 100);
    });

    document.getElementById('pinned-tab').addEventListener('click', () => {
        setTimeout(() => {
            if (!userScrolled) {
                pinnedCommentsContainer.scrollTop = pinnedCommentsContainer.scrollHeight;
            }
        }, 100);
    });

    document.getElementById('highlighted-tab').addEventListener('click', () => {
        setTimeout(() => {
            if (!userScrolled) {
                highlightedCommentsContainer.scrollTop = highlightedCommentsContainer.scrollHeight;
            }
        }, 100);
    });

    document.getElementById('gifts-tab').addEventListener('click', () => {
        setTimeout(() => {
            if (!userScrolled) {
                giftsCommentsContainer.scrollTop = giftsCommentsContainer.scrollHeight;
            }
        }, 100);
    });

    document.getElementById('follows-tab').addEventListener('click', () => {
        setTimeout(() => {
            if (!userScrolled) {
                followsCommentsContainer.scrollTop = followsCommentsContainer.scrollHeight;
            }
        }, 100);
    });

    document.getElementById('subscribes-tab').addEventListener('click', () => {
        setTimeout(() => {
            if (!userScrolled) {
                subscribesCommentsContainer.scrollTop = subscribesCommentsContainer.scrollHeight;
            }
        }, 100);
    });

    document.getElementById('shares-tab').addEventListener('click', () => {
        setTimeout(() => {
            if (!userScrolled) {
                sharesCommentsContainer.scrollTop = sharesCommentsContainer.scrollHeight;
            }
        }, 100);
    });

    document.getElementById('superFans-tab').addEventListener('click', () => {
        setTimeout(() => {
            if (!userScrolled) {
                superFansCommentsContainer.scrollTop = superFansCommentsContainer.scrollHeight;
            }
        }, 100);
    });

    // Add connection event handlers
    socket.on('connect', () => {
        console.log('Socket connected');
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Reconnected after', attemptNumber, 'attempts');
    });

    // Live updates from socket
    socket.on('chat', (msg) => {
        // Generate a unique ID for the new comment
        const commentId = `${msg.uniqueId}_${msg.createTime}_${Math.floor(Math.random() * 10000)}`;
        
        // Check if a comment with the same ID or very similar content already exists
        const isDuplicate = allComments.some(existingComment => {
            // Check if the commenter, timestamp and text match
            if (existingComment.uniqueId === msg.uniqueId && 
                existingComment.comment === msg.comment &&
                Math.abs(parseInt(existingComment.timestamp) - parseInt(msg.createTime)) < 5000) {
                return true;
            }
            return false;
        });

        // Only add the comment if it's not a duplicate
        if (!isDuplicate) {
            // Create the new comment object
            const newComment = {
                id: commentId,
                uniqueId: msg.uniqueId,
                nickname: msg.nickname,
                profilePictureUrl: msg.profilePictureUrl,
                comment: msg.comment,
                timestamp: msg.createTime,
                isPinned: false,
                isHighlighted: false,
                isModerator: !!msg.isModerator,
                isSubscriber: !!msg.isSubscriber,
                userRole: msg.followRole || 'none',
                teamMemberLevel: msg.teamMemberLevel || 0,
                eventType: msg.eventType || 'chat'
            };
            
            // New comment gets added to the end (for oldest to newest display)
            allComments.push(newComment);
            
            // Update the comment count
            const count = parseInt(totalCommentsElement.textContent) || 0;
            totalCommentsElement.textContent = count + 1;
            
            // Check if we need to update the unique commenter count
            const uniqueCommentersCount = parseInt(uniqueCommentersElement.textContent) || 0;
            let foundInCommenters = false;
            
            for (const comment of allComments) {
                if (comment.uniqueId === msg.uniqueId && comment.id !== newComment.id) {
                    foundInCommenters = true;
                    break;
                }
            }
            
            if (!foundInCommenters) {
                uniqueCommentersElement.textContent = uniqueCommentersCount + 1;
            }
            
            // Update event counts if this is a special event
            if (newComment.eventType && newComment.eventType !== 'chat') {
                updateEventCounts();
            }
            
            // Re-render comments if on all comments tab
            if (document.querySelector('#all-tab').classList.contains('active')) {
                renderComments();
                autoScrollOnNewComment();
            } else if (
                (newComment.eventType === 'gift' && document.querySelector('#gifts-tab').classList.contains('active')) ||
                (newComment.eventType === 'follow' && document.querySelector('#follows-tab').classList.contains('active')) ||
                (newComment.eventType === 'subscribe' && document.querySelector('#subscribes-tab').classList.contains('active')) ||
                (newComment.eventType === 'share' && document.querySelector('#shares-tab').classList.contains('active')) ||
                (newComment.eventType === 'superFan' && document.querySelector('#superFans-tab').classList.contains('active'))
            ) {
                // Re-render the specific event tab if it's active
                renderEventComments(newComment.eventType, `${newComment.eventType}sComments`);
                autoScrollOnNewComment();
            }
        } else {
            console.log('Duplicate comment detected and ignored:', msg.comment);
        }
    });
    
    // For other event types (gift, share, subscribe, follow)
    socket.on('gift', (msg) => {
        // The server will also send this as a chat message with eventType='gift'
        console.log('Gift received:', msg);
    });
    
    socket.on('social', (msg) => {
        // The server will also send this as a chat message with eventType='share'
        console.log('Social event received:', msg);
    });
    
    socket.on('subscribe', (msg) => {
        // The server will also send this as a chat message with eventType='subscribe'
        console.log('Subscribe received:', msg);
    });
    
    // Initial load
    loadComments();
    
    // Refresh data every few seconds
    setInterval(() => {
        loadComments();
    }, 1500);
});