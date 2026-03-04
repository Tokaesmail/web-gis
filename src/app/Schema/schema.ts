import { z } from "zod";

export const schema = z
  .object({
    username: z
      .string()
      .min(1, "Username is required")
      .min(3, "At least 3 characters")
      .max(30, "Max 30 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers and underscores"),
    email: z.string().min(1, "Email is required").email("Enter a valid email"),
    password: z
      .string()
      .min(1, "Password is required")
      .min(8, "At least 8 characters")
      .regex(/[A-Z]/, "Include at least one uppercase letter")
      .regex(/[0-9]/, "Include at least one number"),
  })

    export type RegisterValues = z.infer<typeof schema>;
