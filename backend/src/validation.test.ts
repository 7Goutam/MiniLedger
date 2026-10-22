import { describe, it, expect } from "vitest";
import { calculateSummary, isOverdue, loanSchema, phoneSchema } from "./validation";

describe("phoneSchema", () => {
  it("accepts valid international numbers", () => {
    expect(phoneSchema.safeParse("+919876543210").success).toBe(true);
    expect(phoneSchema.safeParse("+14155552671").success).toBe(true);
    expect(phoneSchema.safeParse("+447700900000").success).toBe(true);
  });

  it("rejects numbers without + prefix", () => {
    expect(phoneSchema.safeParse("919876543210").success).toBe(false);
  });

  it("rejects numbers that are too short", () => {
    expect(phoneSchema.safeParse("+123").success).toBe(false);
  });

  it("rejects non-numeric characters", () => {
    expect(phoneSchema.safeParse("+91-9876-543210").success).toBe(false);
  });
});

describe("loanSchema", () => {
  const validLoan = { friendName: "Asha", amount: 500, dueDate: "2026-12-01" };

  it("accepts a valid loan", () => {
    expect(loanSchema.safeParse(validLoan).success).toBe(true);
  });

  it("rejects negative amounts", () => {
    expect(loanSchema.safeParse({ ...validLoan, amount: -1 }).success).toBe(false);
  });

  it("rejects zero amount", () => {
    expect(loanSchema.safeParse({ ...validLoan, amount: 0 }).success).toBe(false);
  });

  it("rejects empty friend name", () => {
    expect(loanSchema.safeParse({ ...validLoan, friendName: "" }).success).toBe(false);
    expect(loanSchema.safeParse({ ...validLoan, friendName: "  " }).success).toBe(false);
  });

  it("rejects invalid date format", () => {
    expect(loanSchema.safeParse({ ...validLoan, dueDate: "01-12-2026" }).success).toBe(false);
    expect(loanSchema.safeParse({ ...validLoan, dueDate: "not-a-date" }).success).toBe(false);
  });

  it("trims whitespace from friend name", () => {
    const result = loanSchema.safeParse({ ...validLoan, friendName: "  Asha  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.friendName).toBe("Asha");
  });
});

describe("isOverdue", () => {
  it("returns true when past due and not repaid", () => {
    expect(isOverdue("2026-09-01", false, "2026-10-22")).toBe(true);
  });

  it("returns false when repaid even if past due date", () => {
    expect(isOverdue("2026-09-01", true, "2026-10-22")).toBe(false);
  });

  it("returns false when due date is today", () => {
    expect(isOverdue("2026-10-22", false, "2026-10-22")).toBe(false);
  });

  it("returns false when due date is in the future", () => {
    expect(isOverdue("2026-12-01", false, "2026-10-22")).toBe(false);
  });
});

describe("calculateSummary", () => {
  it("calculates totals correctly", () => {
    const loans = [
      { amount: 100, dueDate: "2026-10-01", repaid: false },
      { amount: 50, dueDate: "2026-12-01", repaid: true },
    ];
    expect(calculateSummary(loans, "2026-10-22")).toEqual({
      totalLent: 150,
      totalRepaid: 50,
      overdueAmount: 100,
    });
  });

  it("returns zeros for empty loans array", () => {
    expect(calculateSummary([], "2026-10-22")).toEqual({
      totalLent: 0,
      totalRepaid: 0,
      overdueAmount: 0,
    });
  });

  it("does not count repaid loans as overdue", () => {
    const loans = [{ amount: 200, dueDate: "2026-01-01", repaid: true }];
    expect(calculateSummary(loans, "2026-10-22").overdueAmount).toBe(0);
  });

  it("handles all loans repaid", () => {
    const loans = [
      { amount: 100, dueDate: "2026-10-01", repaid: true },
      { amount: 200, dueDate: "2026-10-10", repaid: true },
    ];
    const s = calculateSummary(loans, "2026-10-22");
    expect(s.totalLent).toBe(300);
    expect(s.totalRepaid).toBe(300);
    expect(s.overdueAmount).toBe(0);
  });

  it("handles pending future loans", () => {
    const loans = [{ amount: 500, dueDate: "2026-12-31", repaid: false }];
    const s = calculateSummary(loans, "2026-10-22");
    expect(s.totalLent).toBe(500);
    expect(s.totalRepaid).toBe(0);
    expect(s.overdueAmount).toBe(0);
  });
});
