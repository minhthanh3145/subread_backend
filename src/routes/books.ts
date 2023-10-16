import express, { Router, Request, Response } from 'express';
import multer from 'multer'
import EPub from 'epub';
import { pool } from '../dbConfig';  // Import the pool object
import { verifyToken } from '../lib/authMiddleware';
import { AuthenticatedRequest } from '../lib/types';
import fs from 'fs';
import path from 'path';
import cheerio from 'cheerio';


const router: Router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store the file in memory
const upload = multer({ storage: storage });

// Function to chunk text into pages
function chunkTextIntoPages(text: string, maxWords: number): string[] {
    const words = text.split(/\s+/);
    const pages: string[] = [];
    let currentPage: string[] = [];

    for (const word of words) {
        if (currentPage.length + 1 > maxWords) {
            pages.push(currentPage.join(' '));
            currentPage = [];
        }
        currentPage.push(word);
    }

    if (currentPage.length > 0) {
        pages.push(currentPage.join(' '));
    }

    return pages;
}

router.post('/upload', verifyToken, upload.single('epubFile'), async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    // Save the buffer to a temporary file
    const tempFilePath = path.join(__dirname, 'tempEpubFile.epub');
    fs.writeFileSync(tempFilePath, req.file.buffer);

    const epub = new EPub(tempFilePath);

    epub.on('end', async () => {
        // Extract book information
        const title = epub.metadata.title;
        const author = epub.metadata.creator;
        const total_pages = epub.spine.contents.length;

        try {
            // Insert book into the database
            const { rows } = await pool.query(
                'INSERT INTO books (title, author, total_pages) VALUES ($1, $2, $3) RETURNING *',
                [title, author, total_pages]
            );

            const book_id = rows[0].book_id;

            const unwantedSections = ['Appendix', 'Title Page', 'Table of Contents'];
            const unwantedItems = epub.toc.filter(item => unwantedSections.some(section => item.title.includes(section)));


            // Extract and insert pages into the database
            for (let [index, item] of epub.spine.contents.entries()) {
                // Skip unwanted sections
                if (unwantedItems.some(unwantedItem => unwantedItem.id === item.id)) {
                    continue;
                }
                epub.getChapter(item.id, async (err, htmlContent) => {
                    if (err) {
                        console.error(`Failed to get content for item ID ${item.id}:`, err);
                        return;
                    }

                    // Use cheerio to extract text from HTML
                    const $ = cheerio.load(htmlContent);
                    const textContent = $('body').text();



                    // Chunk text into pages
                    const pages = chunkTextIntoPages(textContent, 500);

                    // Insert each page into the database
                    for (let pageNumber = 0; pageNumber < pages.length; pageNumber++) {
                        try {
                            await pool.query(
                                'INSERT INTO pages (book_id, page_number, content) VALUES ($1, $2, $3)',
                                [book_id, index * pages.length + pageNumber + 1, pages[pageNumber]]
                            );
                        } catch (dbErr) {
                            console.error('Failed to insert page into the database:', dbErr);
                        }
                    }
                });
            }

            res.status(201).json({ message: 'EPUB processed and data inserted into the database' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to process EPUB and insert data' });
        }
    });
    epub.parse();
    // Optionally, delete the temporary file after processing
    fs.unlinkSync(tempFilePath);
});

router.get('/book/:book_id', verifyToken, async (req: AuthenticatedRequest, res: Response) => {
    const { book_id } = req.params;
    try {
        const { rows } = await pool.query('SELECT * FROM books WHERE book_id = $1', [book_id]);
        res.status(200).json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch book details' });
    }
});

export default router;
