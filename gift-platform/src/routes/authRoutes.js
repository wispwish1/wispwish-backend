import express from 'express';
import { signup, login } from '../controllers/authController.js';
import { validate } from '../middleware/validationMiddleware.js';
import { signupSchema, loginSchema } from '../validation/authSchemas.js';

const router = express.Router();

router.post('/signup', validate(signupSchema), signup);
router.post('/login', validate(loginSchema), login);

export default router;
