import { z } from "zod";

/**
 * POST /api/admin/ledger/adjust body shape (§4.4/§4.11 "ledger auditing").
 * `hours` is signed — positive credits the member, negative debits them —
 * and can't be zero since that wouldn't be an adjustment. A reason is
 * always required for this path (unlike admin rejection, which only
 * requires one when the admin isn't also the named counterpart): an
 * `adjusted` row has no originating activity to point back to, so the
 * reason is the only audit trail it gets.
 */
export const adjustLedgerSchema = z.object({
  userId: z.string().trim().min(1, "Select a member"),
  hours: z
    .number()
    .refine((value) => value !== 0, "Hours can't be zero")
    .refine((value) => Math.abs(value) <= 1000, "Enter a value of 1000 hours or less"),
  reason: z.string().trim().min(1, "A reason is required for a manual adjustment").max(1000),
});

export type AdjustLedgerValues = z.infer<typeof adjustLedgerSchema>;
