# MiniLedger

A personal lending ledger to track money lent to friends, due dates, and repayments.

Built with React, TypeScript, Node.js, and PostgreSQL.

---

## Features

- **Phone & OTP Login**: Phone number sign-in with mock OTP printed in the backend terminal.
- **Loan Tracking**: Add loan records with friend's name, amount, and due date.
- **Repayment Status**: Mark loans as repaid with a single click.
- **Summary Metrics**: Real-time totals for total lent, total repaid, and overdue amounts.
- **Overdue Highlighting**: Automatic detection and badge highlighting for overdue loans.
- **Search & Filters**: Search loans by friend name; filter by All, Pending, Overdue, or Repaid.
- **Receipt Uploads**: Attach an image or PDF receipt to any loan entry.
- **User Menu & Logout**: Account popover with explicit sign-out option.
- **Automated Tests**: Unit tests covering validation schemas, overdue logic, and summary calculations.

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Vanilla CSS
- **Backend**: Node.js, Express, TypeScript, Multer, Zod
- **Database**: PostgreSQL (includes automatic embedded PostgreSQL engine for zero-configuration local runs)
- **Testing**: Vitest

---

## Project Structure

```
MiniLedger-Web/
├── backend/
│   ├── src/
│   │   ├── server.ts         # Express server & API routes
│   │   ├── db.ts             # Adaptive database client (Postgres / PGlite)
│   │   ├── initDb.ts         # Table schema initialization script
│   │   ├── validation.ts     # Zod input schemas and summary logic
│   │   └── validation.test.ts # Unit tests
│   ├── uploads/              # Stored receipt uploads
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Main application view (login + dashboard)
│   │   ├── styles.css        # Application styles
│   │   ├── config.ts         # API base URL configuration
│   │   └── main.tsx          # React entry point
│   └── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm

### 1. Backend Setup

```bash
cd backend
npm install
npm run dev
```

The API will start on **http://localhost:4000**.

> **Database Note**: The backend is configured with an adaptive database layer. If you have a local PostgreSQL server running with the default credentials (`DATABASE_URL` in `.env`), it connects directly. If PostgreSQL is not installed or not running, it automatically initializes local persistent storage (`backend/data/pgdata/`) so the app works immediately without manual database setup.

To manually re-initialize tables:
```bash
npm run db:init
```

### 2. Frontend Setup

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## How to Test Sign-In

1. Enter any 10-digit mobile number (e.g. `9876543210`) or international format (`+919876543210`).
2. Click **Continue with phone**.
3. The mock OTP will appear in the backend terminal log (and in local development it is also prefilled in the input for quick testing).
4. Click **Verify & continue** to open your dashboard.
5. To sign out, click the user avatar in the top-right corner and select **Sign out**, or click **Sign out** at the bottom of the sidebar.

---

## API Endpoints

All `/loans` and `/summary` endpoints require the header `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/request-otp` | Request a mock 6-digit OTP for a phone number |
| `POST` | `/auth/verify-otp` | Verify OTP and receive session bearer token |
| `GET` | `/loans` | List all loans for the authenticated user |
| `POST` | `/loans` | Create a new loan (`friendName`, `amount`, `dueDate`) |
| `PATCH` | `/loans/:id/repay` | Mark a loan as repaid |
| `POST` | `/loans/:id/receipt` | Upload a receipt file (`multipart/form-data`) |
| `GET` | `/summary` | Get summary totals (`totalLent`, `totalRepaid`, `overdueAmount`) |
| `GET` | `/health` | Health check endpoint |

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_name VARCHAR(80) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  repaid BOOLEAN NOT NULL DEFAULT FALSE,
  repaid_at TIMESTAMPTZ,
  receipt_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loans_user_created_idx ON loans(user_id, created_at DESC);
```

---

## Running Tests

Run the test suite using Vitest:

```bash
cd backend
npm test
```
