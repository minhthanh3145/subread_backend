import express, { Router, Request, Response } from 'express';
import { pool } from '../dbConfig';  // Import the pool object
import { verifyToken } from '../lib/authMiddleware';


const router: Router = express.Router();


router.get('/daily', verifyToken, async (req: Request, res: Response) => {
    try {
        const { rows } = await pool.query('SELECT * FROM pages ORDER BY RANDOM() LIMIT 10');
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch daily pages' });
    }
});

export default router;
