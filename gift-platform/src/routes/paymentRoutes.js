import express from 'express';
import { chargePayment } from '../controllers/paymentController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { chargeSchema } from '../validation/paymentSchemas.js';

const router = express.Router();

router.post('/charge', authenticate, validate(chargeSchema), chargePayment);

export default router;
