class GiftGoal {
    constructor(goalCount, startingCount, offsetStart = null, offsetGoal = null) {
        this.goalCount = goalCount;
        this.currentCount = startingCount;
        
        // Set up offset functionality
        this.useOffset = offsetStart !== null && offsetGoal !== null;
        this.offsetStart = offsetStart || startingCount;
        this.offsetGoal = offsetGoal || goalCount;
        
        // Track if goal has been reached to handle one-time animations
        this.goalReached = false;
        
        // Calculate the displayed range if using offset
        if (this.useOffset) {
            this.displayMin = 0;
            this.displayMax = this.offsetGoal - this.offsetStart;
            this.displayCurrent = this.currentCount - this.offsetStart;
        } else {
            this.displayMin = 0;
            this.displayMax = this.goalCount;
            this.displayCurrent = this.currentCount;
        }
        
        this.initializeUI();
        this.startPolling();
        
        // Add milestone points for animation effects
        this.milestones = [25, 50, 75, 90, 100];
        this.reachedMilestones = new Set();
    }

    initializeUI() {
        this.progressBar = $('#progress-bar');
        this.progress = $('#progress');
        this.counter = $('#counter');
        this.remainingCount = $('#remaining-count');
        this.updateProgressBar(true); // Initial update without animation
    }

    updateProgressBar(initialUpdate = false) {
        // Calculate current display value
        if (this.useOffset) {
            this.displayCurrent = Math.max(0, this.currentCount - this.offsetStart);
            const totalNeeded = this.offsetGoal - this.offsetStart;
            this.percentage = Math.min(100, (this.displayCurrent / totalNeeded) * 100);
        } else {
            this.displayCurrent = this.currentCount;
            this.percentage = Math.min(100, (this.currentCount / this.goalCount) * 100);
        }

        // Ensure minimum visibility
        const visiblePercentage = Math.max(3, this.percentage);

        // Apply smooth transition for non-initial updates
        if (!initialUpdate) {
            this.progress.addClass('smooth-transition');
        } else {
            this.progress.removeClass('smooth-transition');
        }
        
        // Update the progress bar width
        this.progress.css('width', `${visiblePercentage}%`);
        
        // Update counter text
        if (this.useOffset) {
            const remaining = this.offsetGoal - this.currentCount;
            if (this.percentage >= 100) {
                // Check if we just reached the goal
                if (!this.goalReached) {
                    this.goalReached = true;
                    this.playGoalReachedAnimation();
                    
                    // Show "GOAL REACHED!" temporarily
                    this.counter.html(`<span class="glow">GOAL REACHED!</span>`);
                    this.remainingCount.text(`${this.displayCurrent}/${this.offsetGoal - this.offsetStart}`);
                    
                    // After 5 seconds, revert to showing the actual follower count
                    setTimeout(() => {
                        this.counter.removeClass('glow');
                        this.counter.text(`${this.displayCurrent}/${this.offsetGoal - this.offsetStart}`);
                        this.progress.removeClass('goal-complete');
                    }, 5000);
                } else {
                    // For subsequent updates after goal is reached
                    this.counter.text(`${this.displayCurrent}/${this.offsetGoal - this.offsetStart}`);
                    this.remainingCount.text(`${this.displayCurrent}/${this.offsetGoal - this.offsetStart}`);
                }
            } else {
                this.counter.text(`${this.displayCurrent}/${this.offsetGoal - this.offsetStart}`);
                this.remainingCount.text(`${remaining} to go`);
                // Reset goal reached flag if somehow count drops below goal
                this.goalReached = false;
            }
        } else {
            const remaining = this.goalCount - this.currentCount;
            if (this.percentage >= 100) {
                // Check if we just reached the goal
                if (!this.goalReached) {
                    this.goalReached = true;
                    this.playGoalReachedAnimation();
                    
                    // Show "GOAL REACHED!" temporarily
                    this.counter.html(`<span class="glow">GOAL REACHED!</span>`);
                    this.remainingCount.text(`${this.currentCount}/${this.goalCount}`);
                    
                    // After 5 seconds, revert to showing the actual follower count
                    setTimeout(() => {
                        this.counter.removeClass('glow');
                        this.counter.text(`${this.currentCount}/${this.goalCount}`);
                        this.progress.removeClass('goal-complete');
                    }, 5000);
                } else {
                    // For subsequent updates after goal is reached
                    this.counter.text(`${this.currentCount}/${this.goalCount}`);
                    this.remainingCount.text(`${this.currentCount}/${this.goalCount}`);
                }
            } else {
                this.counter.text(`${this.currentCount}/${this.goalCount}`);
                this.remainingCount.text(`${remaining} to go`);
                // Reset goal reached flag if somehow count drops below goal
                this.goalReached = false;
            }
        }
        
        // Check for milestone animations
        if (!initialUpdate) {
            this.checkMilestones();
        }
    }
    
    checkMilestones() {
        // Check if we've crossed any milestone percentages
        for (const milestone of this.milestones) {
            if (this.percentage >= milestone && !this.reachedMilestones.has(milestone)) {
                this.reachedMilestones.add(milestone);
                this.playMilestoneAnimation(milestone);
            }
        }
    }
    
    playMilestoneAnimation(milestone) {
        // Different animations based on milestone level
        if (milestone === 100) {
            // Goal reached animation
            this.playGoalReachedAnimation();
        } else if (milestone >= 90) {
            // Almost there animation
            this.playPulseAnimation();
        } else {
            // Standard milestone animation
            this.playPulseAnimation();
        }
    }
    
    playPulseAnimation() {
        this.progressBar.addClass('pulse');
        setTimeout(() => {
            this.progressBar.removeClass('pulse');
        }, 750);
    }
    
    playGoalReachedAnimation() {
        // Add the goal reached animation classes
        this.progressBar.addClass('pulse');
        
        // Apply celebration animation that sweeps from 0-100% repeatedly
        // This overrides the normal width to provide the sweeping animation
        this.progress.addClass('goal-complete');
        
        // Set to 100% first to ensure it's visible with the animation
        this.progress.css('width', '100%');
        
        // Remove the pulse animation after it completes
        setTimeout(() => {
            this.progressBar.removeClass('pulse');
        }, 750);
        
        // The sweep animation and checkered flag will continue until removed
        // in the updateProgressBar method after 5 seconds
    }

    async fetchGiftTotal() {
        try {
            const response = await fetch('/api/gift-count');
            const data = await response.json();
            
            // Only update if count has changed
            if (data.count !== this.currentCount) {
                const previousCount = this.currentCount;
                this.currentCount = data.count;
                this.updateProgressBar(false);
            }
        } catch (error) {
            console.error('Error fetching gift count:', error);
        }
    }

    startPolling() {
        // Poll less frequently to reduce resource usage
        setInterval(() => this.fetchGiftTotal(), 2000);
    }
}