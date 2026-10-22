import { pool } from "./db";

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone VARCHAR(20) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  `);
  console.log("MiniLedger database tables are ready.");
  await pool.end();
}

main().catch(async e => {
  console.error("Database initialization error:", e);
  await pool.end();
  process.exit(1);
});
