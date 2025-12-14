# Gift Platform API

Base URL: `http://localhost:5050`

All endpoints speak JSON and expect a `Bearer` token except signup/login.

---

## Authentication

### POST /auth/signup
- **Body**
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "superstrongpass"
  }
  ```
- **Response** - `201 Created`
  ```json
  {
    "token": "jwt-token",
    "user": { "id": "...", "name": "Jane Doe", "email": "jane@example.com" }
  }
  ```

### POST /auth/login
- **Body**
  ```json
  {
    "email": "jane@example.com",
    "password": "superstrongpass"
  }
  ```
- **Response** - `200 OK`
  ```json
  {
    "token": "jwt-token",
    "user": { "id": "...", "name": "Jane Doe", "email": "jane@example.com" }
  }
  ```

---

## Plans

### POST /plans/buy
- Requires auth + JWT header.
- **Body**
  ```json
  { "planType": "monthly" } // or "weekly"
  ```
- Applies validation, triggers a dummy Stripe charge, stores `Subscription` + `Payment`.

### GET /plans/active
- Requires auth.
- Returns active subscription (if any).
  ```json
  {
    "active": true,
    "plan": {
      "id": "...",
      "planType": "weekly",
      "startDate": "2025-11-16T00:00:00.000Z",
      "endDate": "2025-12-16T00:00:00.000Z",
      "freeGiftsUsed": 0,
      "weeklyUsage": [{ "weekNumber": 1, "used": false }, ...]
    }
  }
  ```

---

## Gifts

### POST /gifts/send
- Requires auth.
- Middlewares: `checkSubscription` -> `calculateWeekNumber` -> `checkGiftEligibility`.
- **Body**
  ```json
  {
    "title": "Anniversary Poem",
    "message": "Happy anniversary!",
    "price": 19.99
  }
  ```
- **Behaviour**
  - No plan: pay listed price.
  - Monthly plan: waive 1 gift per 30-day cycle.
  - Weekly plan: waive 1 per week (up to 4).
- **Response**
  ```json
  {
    "message": "Gift sent for free",
    "data": { "id": "...", "isFree": true, "chargedAmount": 0 },
    "eligibility": {
      "isFree": true,
      "planType": "weekly",
      "weekNumber": 2,
      "reason": "Weekly free gift available"
    }
  }
  ```

### GET /gifts/history
- Requires auth.
- Optional query: `?limit=25`.
- Returns paged `GiftUsageLog` documents (with populated `gift` and `subscription`).

---

## Payments

### POST /payment/charge
- Requires auth.
- **Body**
  ```json
  {
    "amount": 9.99,
    "currency": "usd",
    "planType": "pay_per_gift",
    "giftUsageCount": 1,
    "description": "One-off bouquet gift",
    "metadata": { "giftId": "..." }
  }
  ```
- **Response**
  ```json
  {
    "message": "Payment recorded",
    "payment": {
      "id": "...",
      "providerPaymentId": "dummy_12345",
      "status": "succeeded"
    }
  }
  ```

---

## Middlewares

| Middleware | Purpose |
| ---------- | ------- |
| `authenticate` | Validates JWT and loads the user. |
| `checkSubscription` | Loads/refreshes the current subscription before handling requests. |
| `calculateWeekNumber` | Derives the 1-4 week index inside a weekly plan. |
| `checkGiftEligibility` | Figures out whether the request is eligible for a free gift. |
| `validate(schema)` | Applies Joi validation to body/query payloads. |

Keep using the `Authorization` header and consider mirroring the validation logic on the client to improve UX.
