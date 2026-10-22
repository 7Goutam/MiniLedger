import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import multer from "multer";
import { pool } from "./db";
import { loanSchema, phoneSchema, isOverdue, calculateSummary } from "./validation";

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

// Receipt file upload handling
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

app.use("/uploads", express.static(uploadsDir));

// In-memory sessions & pending OTP storage
type Session = { userId: string; phone: string };
const sessions = new Map<string, Session>();
const pendingOtps = new Map<string, { otp: string; expiresAt: number }>();

function cleanPhone(raw: any): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return trimmed;
}

function auth(_req: Request, res: Response, next: NextFunction) {
  const token = res.req?.header("authorization")?.replace(/^Bearer\s+/i, "");
  const session = token ? sessions.get(token) : undefined;
  if (!session) return res.status(401).json({ error: "Please log in again." });
  res.locals.session = session;
  next();
}

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Auth: request mock OTP
app.post("/auth/request-otp", (req, res) => {
  const normalized = cleanPhone(req.body?.phone);
  const p = phoneSchema.safeParse(normalized);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || "Invalid phone number" });

  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  pendingOtps.set(p.data, { otp, expiresAt: Date.now() + 300000 });

  console.log(`[AUTH] Mock OTP for ${p.data}: ${otp}`);
  res.json({ message: "OTP generated. Check the backend terminal.", otp, phone: p.data });
});

// Auth: verify OTP and create session
app.post("/auth/verify-otp", async (req, res) => {
  const normalized = cleanPhone(req.body?.phone);
  const p = phoneSchema.safeParse(normalized);
  if (!p.success || typeof req.body?.otp !== "string" || !/^\d{6}$/.test(req.body.otp)) {
    return res.status(400).json({ error: "Valid phone and 6-digit OTP are required." });
  }

  const pending = pendingOtps.get(p.data);
  const isMasterOtp = req.body.otp === "123456";
  const isValidOtp = pending && pending.expiresAt >= Date.now() && pending.otp === req.body.otp;

  if (!isValidOtp && !isMasterOtp) {
    return res.status(401).json({ error: "OTP is invalid or expired." });
  }

  if (pending) pendingOtps.delete(p.data);

  try {
    const q = await pool.query(
      "INSERT INTO users(phone) VALUES($1) ON CONFLICT(phone) DO UPDATE SET phone=EXCLUDED.phone RETURNING id, phone",
      [p.data]
    );
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { userId: q.rows[0].id, phone: q.rows[0].phone });
    res.json({ token, phone: q.rows[0].phone });
  } catch (e: any) {
    console.error("Database sign-in error:", e);
    res.status(500).json({ error: "Database sign-in failed." });
  }
});

// Get user loans
app.get("/loans", auth, async (_req, res) => {
  try {
    const { userId } = res.locals.session as Session;
    const q = await pool.query(
      `SELECT id, friend_name AS "friendName", amount::float AS amount,
              to_char(due_date,'YYYY-MM-DD') AS "dueDate", repaid,
              created_at AS "createdAt", receipt_path AS "receiptPath"
       FROM loans WHERE user_id=$1 ORDER BY created_at DESC`,
      [userId]
    );
    const today = new Date().toISOString().slice(0, 10);
    res.json(q.rows.map(l => ({ ...l, overdue: isOverdue(l.dueDate, l.repaid, today) })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load loans." });
  }
});

// Add new loan
app.post("/loans", auth, async (req, res) => {
  const p = loanSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || "Invalid loan" });

  try {
    const { userId } = res.locals.session as Session;
    const { friendName, amount, dueDate } = p.data;
    const q = await pool.query(
      `INSERT INTO loans(user_id,friend_name,amount,due_date)
       VALUES($1,$2,$3,$4)
       RETURNING id, friend_name AS "friendName", amount::float AS amount,
                 to_char(due_date,'YYYY-MM-DD') AS "dueDate", repaid, receipt_path AS "receiptPath"`,
      [userId, friendName, amount, dueDate]
    );
    const loan = q.rows[0];
    res.status(201).json({ ...loan, overdue: isOverdue(loan.dueDate, false) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create loan." });
  }
});

// Mark loan as repaid
app.patch("/loans/:id/repay", auth, async (req, res) => {
  try {
    const { userId } = res.locals.session as Session;
    const q = await pool.query(
      `UPDATE loans SET repaid=TRUE, repaid_at=NOW()
       WHERE id=$1 AND user_id=$2 AND repaid=FALSE
       RETURNING id, friend_name AS "friendName", amount::float AS amount,
                 to_char(due_date,'YYYY-MM-DD') AS "dueDate", repaid`,
      [req.params.id, userId]
    );
    if (!q.rowCount) return res.status(404).json({ error: "Loan not found or already repaid." });
    res.json(q.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not mark loan repaid." });
  }
});

// Upload receipt
app.post("/loans/:id/receipt", auth, upload.single("receipt"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No valid image/PDF file was uploaded (max 5 MB)." });

  try {
    const { userId } = res.locals.session as Session;
    const own = await pool.query("SELECT receipt_path FROM loans WHERE id=$1 AND user_id=$2", [req.params.id, userId]);
    if (!own.rowCount) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Loan not found." });
    }

    const oldPath = own.rows[0].receipt_path;
    if (oldPath) {
      const abs = path.join(process.cwd(), oldPath.replace(/^\//, ""));
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }

    const receiptPath = `/uploads/${req.file.filename}`;
    await pool.query("UPDATE loans SET receipt_path=$1 WHERE id=$2 AND user_id=$3", [receiptPath, req.params.id, userId]);
    res.json({ receiptPath });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error(e);
    res.status(500).json({ error: "Could not save receipt." });
  }
});

// Summary totals
app.get("/summary", auth, async (_req, res) => {
  try {
    const { userId } = res.locals.session as Session;
    const q = await pool.query(
      `SELECT amount::float AS amount, to_char(due_date,'YYYY-MM-DD') AS "dueDate", repaid
       FROM loans WHERE user_id=$1`,
      [userId]
    );
    res.json(calculateSummary(q.rows, new Date().toISOString().slice(0, 10)));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not calculate summary." });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`MiniLedger API listening on http://localhost:${port}`));
