import express, { Router, Request, Response } from 'express';
import { pool } from '../dbConfig';  // Import the pool object
import { verifyToken } from '../lib/authMiddleware';
import { AuthenticatedRequest } from '../lib/types';

interface CommentRequest {
    user_id: number;
    page_id: number;
    highlighted_text: string;
    comment_text: string;
}

const router: Router = express.Router();


router.post('/add', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    const { page_id, highlighted_text, comment_text } = req.body;
    const user_id = req.user.userId;

    try {
        await pool.query(
            'INSERT INTO comments (user_id, page_id, highlighted_text, comment_text) VALUES ($1, $2, $3, $4)',
            [user_id, page_id, highlighted_text, comment_text]
        );
        res.status(201).json({ message: 'Comment added successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

router.get('/page/:page_id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    const { page_id } = req.params;
    try {
        const { rows } = await pool.query('SELECT * FROM comments WHERE page_id = $1', [page_id]);
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

export default router;
