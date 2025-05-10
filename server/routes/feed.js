import express from 'express';
import feedService from '../services/feed-service.js';
import rankingScheduler from '../services/ranking-scheduler.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/feed
 * Get the current user's feed with ranked posts
 */
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const username = req.session.user.username;
    
    const posts = await feedService.getFeedForUser(
      username, 
      parseInt(page, 10), 
      parseInt(limit, 10)
    );
    
    res.json({ 
      success: true, 
      posts,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch feed' });
  }
});

/**
 * GET /api/feed/hashtag/:hashtag
 * Get posts for a specific hashtag
 */
router.get('/hashtag/:hashtag', isAuthenticated, async (req, res) => {
  try {
    const { hashtag } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const posts = await feedService.getPostsByHashtag(
      hashtag,
      parseInt(page, 10),
      parseInt(limit, 10)
    );
    
    res.json({ 
      success: true, 
      posts,
      hashtag,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (error) {
    console.error('Error fetching hashtag posts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch posts' });
  }
});

/**
 * GET /api/feed/user/:username
 * Get posts for a specific user
 */
router.get('/user/:username', isAuthenticated, async (req, res) => {
  try {
    const { username } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const posts = await feedService.getUserPosts(
      username,
      parseInt(page, 10),
      parseInt(limit, 10)
    );
    
    res.json({ 
      success: true, 
      posts,
      username,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      }
    });
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch posts' });
  }
});

/**
 * POST /api/feed/rerank
 * Trigger a re-ranking of posts (admin only)
 */
router.post('/rerank', isAuthenticated, async (req, res) => {
  try {
    // Check if user is an admin (you'll need to implement this check)
    if (!req.session.user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    
    const success = rankingScheduler.runNow();
    
    if (success) {
      res.json({ success: true, message: 'Ranking job started' });
    } else {
      res.json({ success: false, message: 'Ranking job is already running' });
    }
  } catch (error) {
    console.error('Error triggering rerank:', error);
    res.status(500).json({ success: false, message: 'Failed to trigger rerank' });
  }
});

export default router; 