// api/routes/comments.js - Comments API routes
const express = require('express');
const router = express.Router();
const services = require('../../src/services');

// Get recent comments
router.get('/', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const recentComments = services.comments.getRecentComments(limit);
        res.json(recentComments);
    } catch (error) {
        console.error('Error reading comments API:', error);
        res.status(500).json({ error: 'Failed to read comments data' });
    }
});

// Get pinned comments
router.get('/pinned', (req, res) => {
    try {
        const pinnedComments = services.comments.getPinnedComments();
        res.json(pinnedComments);
    } catch (error) {
        console.error('Error reading pinned comments API:', error);
        res.status(500).json({ error: 'Failed to read pinned comments data' });
    }
});

// Pin/unpin a comment
router.post('/pin/:commentId', express.json(), (req, res) => {
    try {
        const { commentId } = req.params;
        const { isPinned } = req.body;
        const success = services.comments.togglePinComment(commentId, isPinned);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Comment not found' });
        }
    } catch (error) {
        console.error('Error updating comment pin status:', error);
        res.status(500).json({ error: 'Failed to update comment' });
    }
});

// Highlight a comment
router.post('/highlight/:commentId', express.json(), (req, res) => {
    try {
        const { commentId } = req.params;
        const { isHighlighted } = req.body;
        const success = services.comments.toggleHighlightComment(commentId, isHighlighted);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Comment not found' });
        }
    } catch (error) {
        console.error('Error updating comment highlight status:', error);
        res.status(500).json({ error: 'Failed to update comment' });
    }
});

// Get comments from a specific user
router.get('/user/:uniqueId', (req, res) => {
    try {
        const { uniqueId } = req.params;
        const userComments = services.comments.getUserComments(uniqueId);
        res.json(userComments);
    } catch (error) {
        console.error('Error getting user comments API:', error);
        res.status(500).json({ error: 'Failed to get user comments' });
    }
});

module.exports = router;