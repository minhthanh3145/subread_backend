import express, { Router, Response } from 'express';
import { pool } from '../dbConfig';  // Import the pool object
import { verifyToken } from '../lib/authMiddleware';
import { AuthenticatedRequest } from '../lib/types';
import { start } from 'repl';

const router: Router = express.Router();

router.get('/daily', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
        console.log("Hello");
        const userId = req.user.userId;

        // Update current_day for all groups
        await pool.query(`
        UPDATE groups
        SET current_day = (CURRENT_DATE - start_date) + 1
        `);

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
                    INSERT INTO groups (start_date, current_day)
                    VALUES (CURRENT_DATE, 1)
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

        const { rows: totalBooksForGroup } = await pool.query(`
            SELECT COUNT(book_id) as book_count 
            FROM group_books
            WHERE group_id = $1
        `, [groupId]);

        const numberOfBooks = totalBooksForGroup[0].book_count;

        // Determine the book for the day using the current_day value
        const { rows: bookForTheDay } = await pool.query(`
            SELECT book_id FROM group_books
            WHERE group_id = $1 AND day = (
                SELECT MOD(current_day, $2) + 1 FROM groups WHERE group_id = $1
            )
            LIMIT 1
        `, [groupId, numberOfBooks]);

        if (bookForTheDay.length === 0) {
            // Handle the error, e.g., send an appropriate response or throw an error
            return res.status(400).json({ error: 'No book assigned for today.' });
        }
        const selectedBookId = bookForTheDay[0].book_id;

        // First, get the total number of pages for the book
        const { rows: totalPagesRow } = await pool.query(`
            SELECT MAX(page_number) as max_page_number FROM pages WHERE book_id = $1
            `, [selectedBookId]);

        const totalBookPages = totalPagesRow[0].max_page_number;

        // Get the current day of the group
        const { rows: groupInfo } = await pool.query(`
            SELECT current_day FROM groups WHERE group_id = $1
            `, [groupId]);

        const currentDay = groupInfo[0].current_day;

        const maxStartPage = totalBookPages - 9;  // Ensuring there's always a range of 10 pages.
        let startPage = (((currentDay - 1) * 10 % maxStartPage) + 1)
        if (startPage < 20) {
            startPage = 30;
        }
        let endPage = startPage + 9;

        let pagesCount = 0;

        while (pagesCount < 10 && startPage >= 0) {
            const { rows: countPages } = await pool.query(`
            SELECT COUNT(*) as count 
            FROM pages 
            WHERE book_id = $1 AND page_number BETWEEN $2 AND $3
        `, [selectedBookId, startPage, endPage]);

            pagesCount = parseInt(countPages[0].count, 10);
            // If not enough pages, backtrack by 10 pages
            if (pagesCount < 10) {
                startPage -= 10;
            }
        }

        // Check if we've found a valid range
        if (pagesCount >= 10) {
            const { rows: pages } = await pool.query(`
            SELECT 
                pages.*, 
                books.title AS book_title, 
                books.author AS book_author,
                COUNT(comments.comment_id) AS comment_count
            FROM pages
            INNER JOIN books ON pages.book_id = books.book_id
            LEFT JOIN comments ON pages.page_id = comments.page_id
            WHERE pages.book_id = $1 AND pages.page_number BETWEEN $2 AND $3
            GROUP BY pages.page_id, books.title, books.author
            ORDER BY pages.page_number ASC
        `, [selectedBookId, startPage, endPage]);

            res.status(200).json(pages);
        } else {
            res.status(404).json({ error: "Couldn't find a suitable range of 10 pages." });
        }

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch daily pages' });
    }
});



export default router;
