import type { ZodError } from "zod";

export function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}

/** Maps each invalid field's path to its first error message, for driving inline
 * per-field validation UI instead of a single top-of-form banner. */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fields)) {
      fields[key] = issue.message;
    }
  }
  return fields;
}
