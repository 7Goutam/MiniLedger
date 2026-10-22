import { z } from "zod";
export const phoneSchema = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Use international format, e.g. +919876543210");
export const loanSchema = z.object({
  friendName: z.string().trim().min(1).max(80),
  amount: z.number().positive().max(100000000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Invalid date")
});
export function isOverdue(dueDate: string, repaid: boolean, today = new Date().toISOString().slice(0, 10)) {
  return !repaid && dueDate < today;
}
export function calculateSummary(loans: Array<{amount:number; dueDate:string; repaid:boolean}>, today = new Date().toISOString().slice(0, 10)) {
  return {
    totalLent: loans.reduce((s, l) => s + l.amount, 0),
    totalRepaid: loans.filter(l => l.repaid).reduce((s, l) => s + l.amount, 0),
    overdueAmount: loans.filter(l => !l.repaid && l.dueDate < today).reduce((s, l) => s + l.amount, 0)
  };
}
