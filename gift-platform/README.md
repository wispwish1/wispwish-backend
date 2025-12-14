# Wispwish Gift Platform API

Modern Express backend that powers the subscription logic, payment logging, and gift generation rules described in the requirements.

## Features
- JWT authentication with signup/login flows.
- Subscription engine with monthly and weekly plans (4 free weekly gifts).
- Gift sending workflow guarded by dedicated middlewares (`checkSubscription`, `calculateWeekNumber`, `checkGiftEligibility`).
- Dummy Stripe integration that falls back to mock charges when no test key is present.
- Detailed payment + gift usage logging for auditing and analytics.
- Joi validation on every route and expressive API docs inside `docs/API.md`.

## Installation & Running Guide

1. **Install dependencies**
   ```bash
   cd backend/gift-platform
   npm install
   ```
2. **Create your `.env`**
   ```bash
   cp .env.example .env
   ```
   Update the values:
   - `MONGO_URI` - MongoDB connection string.
   - `JWT_SECRET` - random, long string.
   - `STRIPE_SECRET_KEY` *(optional)* - Stripe test secret. Leave blank to use the mock payment driver.
3. **Start MongoDB** locally or provide a remote connection string.
4. **Run the API**
   ```bash
   npm run dev    # hot reload with nodemon
   # or
   npm start
   ```
5. The server listens on `http://localhost:5050`. Hit `/health` to confirm readiness.

## Frontend Integration Notes

- **Authentication**: After calling `POST /auth/login`, store the returned JWT (e.g., in HTTP-only cookies or secure storage). Send it as `Authorization: Bearer <token>` for all other requests.
- **Plan purchase flow**: call `POST /plans/buy` with the plan type. The response includes both the subscription record and the persisted payment entry so you can show invoices in the UI.
- **Plan badge / state**: use `GET /plans/active` on dashboard load to show how many free gifts remain. Weekly data (`weeklyUsage`) already contains one entry per week.
- **Gift creation**: build a form that collects `title`, `message`, and `price`. Submit via `POST /gifts/send`. The API automatically decides whether to waive the fee, and the response describes what happened (`eligibility` block) so you can show confirmations.
- **Gift history**: call `GET /gifts/history` to display a timeline containing whether each gift was free or paid and which plan covered it.
- **Payments**: if you need to trigger an out-of-band charge from the UI (e.g., buy more credits), post to `/payment/charge`. When a real Stripe secret key is provided, transactions run against Stripe's test mode; otherwise the API emits deterministic mock data.

## Project Structure

```
src/
  config/        # Database + plan configuration
  controllers/   # Route handlers
  middleware/    # Auth, subscription, validation, eligibility
  models/        # User, Subscription, Gift, GiftUsageLog, Payment
  routes/        # Express routers for auth, plans, gifts, payments
  services/      # Payment integration helpers
  utils/         # JWT helpers
  validation/    # Joi schemas
docs/API.md      # Detailed endpoint documentation
```

## Testing Ideas
- Hit `/auth/signup` & `/auth/login` to provision a token.
- Run `POST /plans/buy` for a `weekly` plan and call `POST /gifts/send` five times in a row to see the first four freebies and the fifth being charged.
- Remove the plan, send a gift, and ensure the API charges the listed price.

Feel free to connect this backend to the existing frontend by pointing the AJAX form submissions to the routes described here. The middlewares already enforce the plan logic, so the frontend's job is simply to surface the responses in a friendly UI.
