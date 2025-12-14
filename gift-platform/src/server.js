import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import planRoutes from './routes/planRoutes.js';
import giftRoutes from './routes/giftRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';

dotenv.config();

const app = express();

app.use(
  cors({
    origin: ['http://localhost:3000', process.env.FRONTEND_URL].filter(Boolean),
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.use('/auth', authRoutes);
app.use('/plans', planRoutes);
app.use('/gifts', giftRoutes);
app.use('/payment', paymentRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  return res.status(500).json({ message: 'Internal server error', detail: err.message });
});

const port = process.env.PORT || 5050;

const start = async () => {
  try {
    await connectDB();
    app.listen(port, () => console.log(`Gift platform API listening on ${port}`));
  } catch (error) {
    console.error('Failed to start server', error);
    process.exit(1);
  }
};

start();
