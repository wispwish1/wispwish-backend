import express from 'express';
import { sendGift, getGiftHistory } from '../controllers/giftController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validationMiddleware.js';
import { checkSubscription } from '../middleware/checkSubscription.js';
import { calculateWeekNumber } from '../middleware/calculateWeekNumber.js';
import { checkGiftEligibility } from '../middleware/checkGiftEligibility.js';
import { sendGiftSchema, giftHistorySchema } from '../validation/giftSchemas.js';

const router = express.Router();

router.post(
  '/send',
  authenticate,
  validate(sendGiftSchema),
  checkSubscription,
  calculateWeekNumber,
  checkGiftEligibility,
  sendGift
);

router.get('/history', authenticate, validate(giftHistorySchema), checkSubscription, getGiftHistory);

export default router;
