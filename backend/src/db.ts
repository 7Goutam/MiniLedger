import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

dotenv.config();

const { Pool } = pg;

export interface QueryResult<T = any> {
  rows: T[];
  rowCount?: number;
}

export interface DbInterface {
  query: (text: string, params?: any[]) => Promise<QueryResult>;
  end: () => Promise<void>;
  isEmbedded?: boolean;
}

let activeDb: DbInterface | null = null;
let initPromise: Promise<DbInterface> | null = null;

async function getOrInitDb(): Promise<DbInterface> {
  if (activeDb) return activeDb;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Attempt connection to configured PostgreSQL instance
    if (process.env.DATABASE_URL) {
      try {
        const testPool = new Pool({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 1500,
        });
        await testPool.query("SELECT 1");
        console.log("Connected to PostgreSQL database.");
        activeDb = {
          query: (t, p) => testPool.query(t, p),
          end: () => testPool.end(),
          isEmbedded: false,
        };
        return activeDb;
      } catch (err: any) {
        console.warn(`External PostgreSQL unavailable (${err?.message || err}). Falling back to embedded storage.`);
      }
    }

    // Fallback to embedded PostgreSQL (PGlite) with persistence
    const { PGlite } = await import("@electric-sql/pglite");
    const dataDir = path.resolve(process.cwd(), "data", "pgdata");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const pglite = new PGlite(dataDir);
    console.log(`Using embedded database storage at ${dataDir}`);

    await pglite.exec(`
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
    `);

    activeDb = {
      query: async (text: string, params?: any[]) => {
        if (!params || params.length === 0) {
          const res = await pglite.exec(text);
          if (Array.isArray(res) && res.length > 0) {
            const last = res[res.length - 1];
            return {
              rows: last.rows || [],
              rowCount: last.rows?.length || 0,
            };
          }
          return {
            rows: (res as any)?.rows || [],
            rowCount: (res as any)?.rows?.length || 0,
          };
        }

        const res = await pglite.query(text, params);
        return {
          rows: res.rows || [],
          rowCount: res.rows?.length || 0,
        };
      },
      end: async () => {
        await pglite.close();
      },
      isEmbedded: true,
    };

    return activeDb;
  })();

  return initPromise;
}

export const pool: DbInterface = {
  query: async (text: string, params?: any[]) => {
    const db = await getOrInitDb();
    return db.query(text, params);
  },
  end: async () => {
    if (activeDb) {
      await activeDb.end();
      activeDb = null;
      initPromise = null;
    }
  },
};
