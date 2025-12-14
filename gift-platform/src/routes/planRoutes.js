import express from 'express';
import { buyPlan, getActivePlan } from '../controllers/planController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { checkSubscription } from '../middleware/checkSubscription.js';
import { validate } from '../middleware/validationMiddleware.js';
import { buyPlanSchema } from '../validation/planSchemas.js';
import { emptySchema } from '../validation/commonSchemas.js';

const router = express.Router();

router.post('/buy', authenticate, validate(buyPlanSchema), buyPlan);
router.get('/active', authenticate, validate(emptySchema), checkSubscription, getActivePlan);

export default router;
