import express, { Router, Request, Response } from 'express';
import { pool } from '../dbConfig';  // Import the pool object
import { verifyToken } from '../lib/authMiddleware';

interface SubscriptionRequest {
    user_id: number;
}

const router: Router = express.Router();

router.post('/subscribe', verifyToken, async (req: Request<{}, {}, SubscriptionRequest>, res: Response) => {
    const { user_id } = req.body;
    try {
        await pool.query('UPDATE users SET subscription_status = true WHERE id = $1', [user_id]);
        res.status(200).json({ message: 'Subscribed successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Subscription failed' });
    }
});

router.get('/status/:user_id', verifyToken, async (req: Request, res: Response) => {
    const { user_id } = req.params;
    try {
        const { rows } = await pool.query('SELECT subscription_status FROM users WHERE id = $1', [user_id]);
        res.status(200).json({ subscription_status: rows[0].subscription_status });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch subscription status' });
    }
});

export default router;
