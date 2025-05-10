import express from 'express';
const router = express.Router();
import { get_db_connection } from '../models/rdbms.js';

// Import the adsorption scheduler
const adsorptionScheduler = require('../services/adsorptionScheduler');

/**
 * @route GET /api/ranking/recommendations
 * @desc Get recommended posts for a user based on adsorption ranking
 */
router.get('/recommendations', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const dbaccess = get_db_connection();
    await dbaccess.connect();

    // Get posts recommended for this user
    const [recommendations] = await dbaccess.send_sql(`
      SELECT p.*, u.username as author_username, pr.weight
      FROM post_recommendations pr
      JOIN posts p ON pr.post_id = p.post_id
      JOIN users u ON p.author_id = u.user_id
      WHERE pr.user_id = ?
      ORDER BY pr.weight DESC
      LIMIT 20
    `, [userId]);

    return res.json({ recommendations });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route POST /api/ranking/run-adsorption
 * @desc Manually trigger the adsorption ranking job
 * @access Admin only (should be protected in production)
 */
router.post('/run-adsorption', async (req, res) => {
  try {
    // In production, add authorization check here
    
    // Trigger the adsorption job
    adsorptionScheduler.runAdsorptionJob();
    
    return res.json({ message: 'Adsorption job triggered' });
  } catch (error) {
    console.error('Error triggering adsorption job:', error);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router; 