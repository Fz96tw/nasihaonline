import type { ZodTypeAny } from "zod";

export type WizardIssue = { path: string; message: string };

/** A base field that, while empty, makes Zod skip every cross-field rule. */
export type WizardPlaceholder<Values> = {
  field: keyof Values & string;
  isEmpty: (values: Values) => boolean;
  /** Stand-in value used for the second pass only — its own issues are discarded. */
  value: unknown;
};

/**
 * Every issue the schema reports for the current values, flattened to
 * `{ path, message }`.
 *
 * Zod skips a schema's superRefine rules (cross-field requirements like "pick a
 * community" or "invite someone") while a base field such as an enum is still
 * invalid, so a bare safeParse on a half-empty form hides most of what is left
 * to do. This runs it a second time with placeholders in the empty base fields
 * so the cross-field rules also report, then keeps the real base-field issues
 * from the first pass and everything else from the second.
 */
export function collectWizardIssues<Values extends object>(
  schema: ZodTypeAny,
  values: Values,
  placeholders: WizardPlaceholder<Values>[],
): WizardIssue[] {
  const toIssues = (result: ReturnType<ZodTypeAny["safeParse"]>): WizardIssue[] =>
    result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));

  const real = toIssues(schema.safeParse(values));
  const placeholdered: Record<string, unknown> = { ...(values as Record<string, unknown>) };
  const filled = new Set<string>();
  for (const placeholder of placeholders) {
    if (placeholder.isEmpty(values)) {
      placeholdered[placeholder.field] = placeholder.value;
      filled.add(placeholder.field);
    }
  }
  if (filled.size === 0) return real;

  const merged = [...real];
  for (const issue of toIssues(schema.safeParse(placeholdered))) {
    const field = issue.path.split(".")[0];
    const seen = merged.some((m) => m.path === issue.path && m.message === issue.message);
    if (!filled.has(field) && !seen) merged.push(issue);
  }
  return merged;
}
