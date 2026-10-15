export const ADMIN_EMAIL_OPERATIONS_EMAILS = [
  "mfjavier@up.edu.ph",
  "acnoblezada@up.edu.ph",
] as const;

export function hasAdminEmailOperationsAccess(
  email: string | null | undefined,
): boolean {
  const normalizedEmail = email?.trim().toLowerCase();
  return ADMIN_EMAIL_OPERATIONS_EMAILS.some(
    (allowedEmail) => allowedEmail === normalizedEmail,
  );
}
