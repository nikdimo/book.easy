import { z } from "zod";

export const emailSignInSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

export type EmailSignInInput = z.infer<typeof emailSignInSchema>;
