import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { corsOptions } from './config/cors.js';
import authRoutes from './routes/auth.js';
import characterRoutes from './routes/character.js';
import workoutRoutes from './routes/workout.js';
import leaderboardRoutes from './routes/leaderboard.js';
import chatRoutes from './routes/chat.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '20kb' }));

  // Rate limit chung cho toàn bộ API
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { message: 'Quá nhiều yêu cầu, vui lòng chậm lại' } },
    })
  );

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/character', characterRoutes);
  app.use('/api/workouts', workoutRoutes);
  app.use('/api/leaderboard', leaderboardRoutes);
  app.use('/api/chat', chatRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
