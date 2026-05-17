# Local Setup for AbacusPro Backend

## 1. Prerequisites
- Node.js (v16+ recommended)
- PostgreSQL (running locally)

## 2. Configure Environment
- Copy `.env.example` to `.env`:
  ```sh
  cp .env.example .env
  ```
- Edit `.env` and set your local DB credentials (DB_USER, DB_PASSWORD, etc).

## 3. Install Dependencies
```sh
npm install
```

## 4. Run Database Migrations
This will auto-create any missing columns (like `num_questions`, `is_live`) in your `tests` table:
```sh
npm run migrate
```

## 5. Start the Backend
```sh
npm run dev
```

---

**If you see a DB error:**
- Double-check your `.env` DB credentials.
- Make sure PostgreSQL is running and the database exists.

---

**You can re-run migrations anytime with:**
```sh
npm run migrate
```

---

For frontend setup, see the `frontend/` folder.
