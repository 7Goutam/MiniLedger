import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, Bell, Check, ChevronDown, CircleAlert,
  Clock3, FileImage, HandCoins, ImagePlus, LayoutDashboard, LogOut,
  Plus, Search, ShieldCheck, Wallet, X
} from "lucide-react";
import { API_URL } from "./config";

type Loan = {
  id: string;
  friendName: string;
  amount: number;
  dueDate: string;
  repaid: boolean;
  overdue?: boolean;
  createdAt?: string;
  receiptPath?: string | null;
};
type Summary = { totalLent: number; totalRepaid: number; overdueAmount: number };
const emptySummary: Summary = { totalLent: 0, totalRepaid: 0, overdueAmount: 0 };
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));
const today = new Date().toISOString().slice(0, 10);

async function api(path: string, token?: string, init: RequestInit = {}) {
  const r = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || "Something went wrong");
  return body;
}

export default function App() {
  const [token, setToken] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [showAdd, setShowAdd] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "pending" | "overdue" | "repaid">("all");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showUserMenu]);

  const refresh = useCallback(async (t: string) => {
    const [ls, s] = await Promise.all([api("/loans", t), api("/summary", t)]);
    setLoans(ls);
    setSummary(s);
  }, []);

  useEffect(() => {
    if (token) refresh(token).catch(e => setError(e.message));
  }, [token, refresh]);

  // Auto-dismiss toast notification
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const visibleLoans = useMemo(
    () =>
      loans.filter(l => {
        const matchesFilter =
          filter === "all" ||
          (filter === "repaid" ? l.repaid : filter === "overdue" ? l.overdue : !l.repaid && !l.overdue);
        return matchesFilter && l.friendName.toLowerCase().includes(search.toLowerCase());
      }),
    [loans, filter, search]
  );

  function formatPhoneNumber(raw: string) {
    const trimmed = raw.trim();
    const digits = trimmed.replace(/\D/g, "");
    if (trimmed.startsWith("+")) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return trimmed;
  }

  async function sendOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    const formatted = formatPhoneNumber(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(formatted)) {
      setError("Please enter a valid 10-digit mobile number or international format (e.g. 9876543210 or +919876543210).");
      return;
    }
    setPhone(formatted);
    setBusy(true);
    try {
      const res = await api("/auth/request-otp", undefined, { method: "POST", body: JSON.stringify({ phone: formatted }) });
      setRequested(true);
      if (res.otp) {
        setOtp(res.otp);
        setToast(`OTP generated: ${res.otp} (also logged in backend)`);
      } else {
        setToast("OTP generated — check the backend terminal.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    const formatted = formatPhoneNumber(phone);
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit OTP from the server terminal.");
      return;
    }
    setBusy(true);
    try {
      const r = await api("/auth/verify-otp", undefined, {
        method: "POST",
        body: JSON.stringify({ phone: formatted, otp }),
      });
      setToken(r.token);
      setPhone(r.phone || formatted);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleReceiptChange(file: File | null) {
    setReceiptFile(file);
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setReceiptPreview(url);
    } else {
      setReceiptPreview("");
    }
  }

  async function addLoan(e: FormEvent) {
    e.preventDefault();
    setError("");
    const n = Number(amount);
    if (!friendName.trim()) { setError("Enter your friend's name."); return; }
    if (!Number.isFinite(n) || n <= 0) { setError("Amount must be greater than zero."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) {
      setError("Enter a valid due date.");
      return;
    }
    setBusy(true);
    try {
      const loan: Loan = await api("/loans", token, {
        method: "POST",
        body: JSON.stringify({ friendName: friendName.trim(), amount: n, dueDate }),
      });
      // Upload receipt if provided
      if (receiptFile) {
        const fd = new FormData();
        fd.append("receipt", receiptFile);
        await fetch(`${API_URL}/loans/${loan.id}/receipt`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      }
      setFriendName("");
      setAmount("");
      setDueDate(today);
      handleReceiptChange(null);
      setShowAdd(false);
      await refresh(token);
      setToast("Loan entry added.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function markRepaid(loan: Loan) {
    setError("");
    try {
      await api(`/loans/${loan.id}/repay`, token, { method: "PATCH" });
      await refresh(token);
      setToast(`${loan.friendName}'s loan marked as repaid.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function uploadReceipt(loan: Loan, file: File) {
    setUploadingFor(loan.id);
    try {
      const fd = new FormData();
      fd.append("receipt", file);
      await fetch(`${API_URL}/loans/${loan.id}/receipt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      await refresh(token);
      setToast(`Receipt uploaded for ${loan.friendName}.`);
    } catch {
      setError("Could not upload receipt.");
    } finally {
      setUploadingFor(null);
    }
  }

  function logout() {
    setToken("");
    setOtp("");
    setRequested(false);
    setShowUserMenu(false);
    setLoans([]);
    setSummary(emptySummary);
  }

  function closeAdd() {
    setShowAdd(false);
    setError("");
    handleReceiptChange(null);
  }

  // Login view
  if (!token)
    return (
      <div className="login-shell">
        <div className="login-art">
          <div className="art-top">
            <span className="brand-mark"><HandCoins size={21} /></span>
            <span className="brand-name">mini<span>ledger</span></span>
          </div>
          <div className="art-copy">
            <span className="eyebrow light">MONEY, MADE CLEAR</span>
            <h1>Good friendships.<br /><em>Clear accounts.</em></h1>
            <p>A calm little place to remember who owes you what — without making things awkward.</p>
            <div className="art-stat">
              <span className="art-stat-icon"><ShieldCheck size={19} /></span>
              <div>
                <strong>Your money, in view.</strong>
                <small>Simple, private personal tracking.</small>
              </div>
            </div>
          </div>
          <div className="art-bottom">
            <span>LESS AWKWARD. MORE ORGANIZED.</span>
            <span>01 — YOUR PERSONAL LEDGER</span>
          </div>
        </div>

        <div className="login-side">
          <div className="mobile-brand">
            <span className="brand-mark"><HandCoins size={20} /></span>
            <span className="brand-name">mini<span>ledger</span></span>
          </div>
          <form className="login-form" onSubmit={requested ? verifyOtp : sendOtp}>
            <span className="eyebrow">WELCOME TO MINILEDGER</span>
            <h2>{requested ? "Check your messages." : "Let's get you in."}</h2>
            <p className="muted">
              {requested
                ? "Enter the six-digit code shown in the backend terminal."
                : "Sign in with your phone number to see your lending overview."}
            </p>
            <label htmlFor="phone">PHONE NUMBER</label>
            <input id="phone" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 9876543210 or +91 98765 43210" autoComplete="tel" disabled={requested} />
            {requested && (
              <>
                <label htmlFor="otp">ONE-TIME PASSWORD</label>
                <input id="otp" value={otp} onChange={e => setOtp(e.target.value)}
                  placeholder="6-digit code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
              </>
            )}
            <button className="btn-primary full" disabled={busy}>
              {busy ? "Please wait…" : requested ? "Verify & continue" : "Continue with phone"}
              {" "}<ArrowUpRight size={17} />
            </button>
            {requested && (
              <button type="button" className="text-button"
                onClick={() => { setRequested(false); setOtp(""); setError(""); }}>
                Change phone number
              </button>
            )}
            {error && <div className="error-msg"><CircleAlert size={15} />{error}</div>}
            {toast && <div className="info-msg">{toast}</div>}
            <div className="login-note">
              <ShieldCheck size={15} />
              <span>Demo sign-in · OTP is printed in the backend terminal</span>
            </div>
          </form>
          <footer className="login-footer">
            A little clarity goes a long way. <span>© MiniLedger</span>
          </footer>
        </div>
      </div>
    );

  // Main Dashboard
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="side-brand">
          <span className="brand-mark"><HandCoins size={20} /></span>
          <span className="brand-name">mini<span>ledger</span></span>
        </div>
        <div
          className="workspace clickable"
          onClick={() => setShowUserMenu(prev => !prev)}
          title="Click to view account details"
        >
          <span className="workspace-avatar">{phone.slice(-2) || "ML"}</span>
          <div>
            <strong>My personal ledger</strong>
            <small>{phone}</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <button className="nav-item active"><LayoutDashboard size={17} /> Overview</button>
        <div className="side-bottom">
          <div className="help-card">
            <span className="help-icon"><ShieldCheck size={18} /></span>
            <strong>Keep it friendly.</strong>
            <p>Clear records make money conversations easier.</p>
          </div>
          <button className="nav-item logout" onClick={logout}><LogOut size={17} /> Sign out</button>
          <div className="side-legal">MINILEDGER · PERSONAL FINANCE</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <div className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div>
            <div className="mobile-heading">Your money, in view.</div>
          </div>
          <div className="top-actions">
            <span className="today-label">
              <Clock3 size={15} />
              {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
            <button className="icon-button" title="Notifications"><Bell size={17} /><i /></button>
            <div className="profile-menu-container" ref={userMenuRef}>
              <button
                type="button"
                className="profile-button"
                onClick={() => setShowUserMenu(prev => !prev)}
                title="Account menu"
              >
                {phone.slice(-2) || "ML"}
              </button>
              {showUserMenu && (
                <div className="user-menu-popover">
                  <div className="user-menu-header">
                    <span className="user-menu-avatar">{phone.slice(-2) || "ML"}</span>
                    <div className="user-menu-info">
                      <strong>{phone}</strong>
                      <small><i /> Signed in</small>
                    </div>
                  </div>
                  <div className="user-menu-actions">
                    <button
                      type="button"
                      className="user-menu-logout"
                      onClick={() => {
                        setShowUserMenu(false);
                        logout();
                      }}
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div>
              <span className="eyebrow">YOUR FINANCIAL SNAPSHOT</span>
              <h1>Your money, <em>in view.</em></h1>
              <p className="muted">A clear picture of what you've lent, what's returned, and what needs a nudge.</p>
            </div>
            <button className="btn-primary" onClick={() => { setShowAdd(true); setError(""); }}>
              <Plus size={17} /> Add a loan
            </button>
          </div>

          {error && (
            <div className="error-banner">
              <CircleAlert size={16} />{error}
              <button onClick={() => setError("")}><X size={15} /></button>
            </div>
          )}
          {toast && (
            <div className="toast">
              <Check size={15} />{toast}
              <button onClick={() => setToast("")}><X size={14} /></button>
            </div>
          )}

          {/* Summary cards */}
          <section className="stats-grid">
            <article className="stat-card total-card">
              <div className="stat-top"><span>Total lent</span><span className="stat-icon dark"><Wallet size={17} /></span></div>
              <div className="stat-amount">{money(summary.totalLent)}</div>
              <div className="stat-foot">
                <span className="tiny-dot cream" />
                <span>Across {loans.length} {loans.length === 1 ? "entry" : "entries"}</span>
              </div>
              <div className="card-watermark"><Wallet size={86} /></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Total repaid</span><span className="stat-icon green"><ArrowDownLeft size={17} /></span></div>
              <div className="stat-amount">{money(summary.totalRepaid)}</div>
              <div className="stat-foot"><span className="tiny-dot green-dot" /><span>Money back in your hands</span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Overdue amount</span><span className="stat-icon red"><Clock3 size={17} /></span></div>
              <div className="stat-amount">{money(summary.overdueAmount)}</div>
              <div className="stat-foot"><span className="tiny-dot red-dot" /><span>Past due, not yet repaid</span></div>
            </article>
          </section>

          {/* Loans table */}
          <section className="records-panel">
            <div className="records-heading">
              <div>
                <span className="eyebrow">YOUR RECORDS</span>
                <h2>Loans &amp; repayments <span className="count-badge">{loans.length}</span></h2>
              </div>
              <div className="searchbox">
                <Search size={16} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search a friend…" />
              </div>
            </div>
            <div className="filter-row">
              {(["all", "pending", "overdue", "repaid"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`filter-chip ${filter === f ? "selected" : ""}`}>
                  {f === "all" ? "All entries" : f === "pending" ? "Pending" : f === "overdue" ? "Overdue" : "Repaid"}
                  {f === "overdue" && loans.some(l => l.overdue) && <span className="filter-dot" />}
                </button>
              ))}
            </div>

            {visibleLoans.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon"><HandCoins size={25} /></div>
                <h3>{loans.length === 0 ? "Your ledger starts here." : "No matching entries."}</h3>
                <p>
                  {loans.length === 0
                    ? "Add a loan to keep track of money you've lent to friends."
                    : "Try another filter or search for a different name."}
                </p>
                {loans.length === 0 && (
                  <button className="btn-primary" onClick={() => setShowAdd(true)}>
                    <Plus size={16} /> Add your first loan
                  </button>
                )}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>FRIEND</th>
                      <th>AMOUNT</th>
                      <th>DUE DATE</th>
                      <th>STATUS</th>
                      <th>RECEIPT</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLoans.map(l => (
                      <tr key={l.id} className={l.overdue ? "overdue-row" : ""}>
                        <td>
                          <div className="friend-cell">
                            <span className={`friend-avatar ${l.overdue ? "avatar-overdue" : ""}`}>
                              {l.friendName.slice(0, 1).toUpperCase()}
                            </span>
                            <span>
                              <strong>{l.friendName}</strong>
                              <small>Personal loan</small>
                            </span>
                          </div>
                        </td>
                        <td className="amount-cell">{money(l.amount)}</td>
                        <td><span className="date-cell">{l.dueDate}</span></td>
                        <td>
                          <span className={`status ${l.repaid ? "status-repaid" : l.overdue ? "status-overdue" : "status-pending"}`}>
                            <i />{l.repaid ? "Repaid" : l.overdue ? "Overdue" : "Pending"}
                          </span>
                        </td>
                        <td className="receipt-cell">
                          {l.receiptPath ? (
                            <a
                              href={`${API_URL}${l.receiptPath}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="receipt-thumb-link"
                              title="View receipt"
                            >
                              {l.receiptPath.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                                <img
                                  src={`${API_URL}${l.receiptPath}`}
                                  alt="Receipt"
                                  className="receipt-thumb"
                                />
                              ) : (
                                <span className="receipt-icon"><FileImage size={15} /></span>
                              )}
                            </a>
                          ) : (
                            <label className="upload-receipt-btn" title="Upload receipt">
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                style={{ display: "none" }}
                                disabled={uploadingFor === l.id}
                                onChange={e => {
                                  const f = e.target.files?.[0];
                                  if (f) uploadReceipt(l, f);
                                  e.target.value = "";
                                }}
                              />
                              {uploadingFor === l.id ? "…" : <><ImagePlus size={13} /> Add</>}
                            </label>
                          )}
                        </td>
                        <td className="action-cell">
                          {!l.repaid && (
                            <button className="repay-button" onClick={() => markRepaid(l)}>
                              <Check size={14} /> Mark repaid
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="panel-footer">
              <span>Showing {visibleLoans.length} of {loans.length} entries</span>
              <span><span className="footer-dot" /> Up to date with your ledger</span>
            </div>
          </section>

          <div className="page-end">
            <span>Small details. Better friendships.</span>
            <span>MINILEDGER <b>·</b> MADE FOR REAL LIFE</span>
          </div>
        </div>
      </main>

      {/* Add Loan Modal */}
      {showAdd && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) closeAdd(); }}>
          <form className="modal" onSubmit={addLoan}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">NEW RECORD</span>
                <h2>Add a loan</h2>
                <p>Keep the details handy. You can update repayment status later.</p>
              </div>
              <button type="button" className="close-button" onClick={closeAdd}><X size={19} /></button>
            </div>

            <label htmlFor="friend">FRIEND'S NAME</label>
            <input id="friend" value={friendName} onChange={e => setFriendName(e.target.value)}
              placeholder="e.g. Aditi Sharma" autoFocus />

            <label htmlFor="amount">AMOUNT (₹)</label>
            <div className="amount-input">
              <span>₹</span>
              <input id="amount" type="number" min="0.01" step="0.01"
                value={amount} onChange={e => setAmount(e.target.value)} placeholder="1,500.00" />
            </div>

            <label htmlFor="due">DUE DATE</label>
            <input id="due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />

            {/* Receipt upload */}
            <label>RECEIPT (OPTIONAL)</label>
            <div className="receipt-upload-area" onClick={() => fileInputRef.current?.click()}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                style={{ display: "none" }}
                onChange={e => handleReceiptChange(e.target.files?.[0] ?? null)}
              />
              {receiptPreview ? (
                <div className="receipt-preview-wrap">
                  <img src={receiptPreview} alt="Receipt preview" className="receipt-preview-img" />
                  <button
                    type="button"
                    className="receipt-remove"
                    onClick={e => { e.stopPropagation(); handleReceiptChange(null); }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : receiptFile ? (
                <div className="receipt-file-selected">
                  <FileImage size={18} />
                  <span>{receiptFile.name}</span>
                  <button type="button" className="receipt-remove-inline"
                    onClick={e => { e.stopPropagation(); handleReceiptChange(null); }}>
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="receipt-placeholder">
                  <ImagePlus size={20} />
                  <span>Click to attach a photo or PDF of the receipt</span>
                  <small>JPEG, PNG, WebP, GIF or PDF · max 5 MB</small>
                </div>
              )}
            </div>

            {error && <div className="error-msg"><CircleAlert size={15} />{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={closeAdd}>Cancel</button>
              <button className="btn-primary" disabled={busy}>
                {busy ? "Saving…" : <><Plus size={16} /> Save loan</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
