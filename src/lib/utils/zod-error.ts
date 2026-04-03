import type { ZodError } from "zod";

export function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? "Invalid input";
}
