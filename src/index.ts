import express, { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
import usersRoutes from './routes/users';
import pagesRoutes from './routes/pages';
import commentsRoutes from './routes/comments';
import subscriptionRoutes from './routes/subscription';
import cors from 'cors';

const app: Express = express();
const PORT: number = 3000;

app.use(bodyParser.json());
// Enable CORS for all routes
app.use(cors());

// Routes
app.use('/api/users', usersRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/subscription', subscriptionRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
