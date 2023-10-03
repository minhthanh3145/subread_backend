import express, { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../dbConfig';  // Import the pool object

interface RegisterRequest {
    username: string;
    email: string;
    password: string;
}

interface LoginRequest {
    email: string;
    password: string;
}

const router: Router = express.Router();

router.post('/register', async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (username, email, password) VALUES ($1, $2, $3)', [username, email, hashedPassword]);
        res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

router.post('/login', async (req: Request<{}, {}, LoginRequest>, res: Response) => {
    const { email, password } = req.body;
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const token = jwt.sign({ userId: user.id }, 'THOMAS_SECRET_KEY_THIS_WILL_CHANGE_THE_WORLD', { expiresIn: '30d' });
        res.status(200).json({ token, userId: user.id });
    } catch (err) {
        res.status(500).json({ error: 'Login failed' });
    }
});

export default router;
