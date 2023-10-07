import express, { Router, Response } from 'express';
import { pool } from '../dbConfig';  // Import the pool object
import { verifyToken } from '../lib/authMiddleware';
import { AuthenticatedRequest } from '../lib/types';

const router: Router = express.Router();

router.get('/daily', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const userId = req.user.userId;

        // Check if the user is in an active group
        const { rows: activeGroup } = await pool.query(`
            SELECT * FROM user_groups
            JOIN groups ON user_groups.group_id = groups.group_id
            WHERE user_id = $1 AND start_date > CURRENT_DATE - INTERVAL '7 days'
        `, [userId]);

        let groupId;
        if (activeGroup.length === 0) {
            // Find a group with less than 10 users
            const { rows: availableGroup } = await pool.query(`
                SELECT group_id FROM groups
                WHERE group_id NOT IN (
                    SELECT group_id FROM user_groups
                    GROUP BY group_id
                    HAVING COUNT(user_id) >= 10
                )
                LIMIT 1
                `);


            if (availableGroup.length === 0) {
                // If no available group, create a new group
                const { rows: newGroup } = await pool.query(`
                    INSERT INTO groups (start_date, current_book_id, current_day)
                    VALUES (CURRENT_DATE, 1, 1)
                    RETURNING group_id
                    `);
                groupId = newGroup[0].group_id;

                // Assign 10 random books to the new group
                await pool.query(`
                    INSERT INTO group_books (group_id, book_id, day)
                    SELECT $1, book_id, row_number() OVER ()
                    FROM books
                    ORDER BY RANDOM()
                    LIMIT 10
                    `, [groupId]);

            } else {
                groupId = availableGroup[0].group_id;
            }

            // Associate the user with the group
            await pool.query(`
                INSERT INTO user_groups (user_id, group_id)
                VALUES ($1, $2)
            `, [userId, groupId]);
        } else {
            groupId = activeGroup[0].group_id;
        }

        // Fetch a random book_id from the assigned 10 books for the group
        const { rows: randomBook } = await pool.query(`
            SELECT book_id FROM group_books
            WHERE group_id = $1
            ORDER BY RANDOM()
            LIMIT 1
        `, [groupId]);

        const selectedBookId = randomBook[0].book_id;

        // Fetch the pages for the current day from the randomly selected book, along with comment count
        const { rows: pages } = await pool.query(`
            SELECT pages.*, COUNT(comments.comment_id) AS comment_count
            FROM pages
            LEFT JOIN comments ON pages.page_id = comments.page_id
            WHERE pages.book_id = $1 AND pages.page_number BETWEEN (
                SELECT current_day FROM groups WHERE group_id = $2
            ) * 10 - 9 AND (
                SELECT current_day FROM groups WHERE group_id = $2
            ) * 10
            GROUP BY pages.page_id
`, [selectedBookId, groupId]);

        res.status(200).json(pages);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch daily pages' });
    }
});



export default router;
