import { z } from "zod";
export function dateNumber(date = new Date()) {
  return Number(date.toISOString().slice(0, 10).replaceAll("-", ""));
}
export function validDob(dob: string) {
  const d = new Date(dob + "T00:00:00Z");
  return (
    !Number.isNaN(+d) &&
    d.toISOString().slice(0, 10) === dob &&
    dob >= "1900-01-01" &&
    Number(dob.replaceAll("-", "")) <= dateNumber()
  );
}
export function calculateAge(dob: string, asOf = new Date()) {
  const [y, m, d] = dob.split("-").map(Number);
  return (
    asOf.getUTCFullYear() -
    y -
    (asOf.getUTCMonth() + 1 < m ||
    (asOf.getUTCMonth() + 1 === m && asOf.getUTCDate() < d)
      ? 1
      : 0)
  );
}
const name = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{M} .'-]+$/u);
export const identitySchema = z
  .object({
    firstName: name,
    middleName: z.union([name, z.literal("")]).optional(),
    lastName: name,
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(validDob, "Enter a valid past date from 1900 onward"),
    gender: z
      .enum(["", "female", "male", "nonbinary", "prefer-not-to-say"])
      .optional(),
    email: z
      .email()
      .max(254)
      .transform((x) => x.toLowerCase()),
    phone: z.string().regex(/^\+?[0-9 ()-]{7,20}$/),
  })
  .strict();
export const authSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((x) => x.trim().toLowerCase()),
  password: z.string().min(12).max(128),
});
export const claimsSchema = z
  .array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("age_over"), value: z.literal(18) }).strict(),
      z.object({ type: z.literal("email_disclosure") }).strict(),
      z
        .object({ type: z.literal("qualification"), value: z.literal("btech") })
        .strict(),
    ]),
  )
  .length(1);
export type Profile = z.infer<typeof identitySchema>;
