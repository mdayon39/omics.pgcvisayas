const REFERENCE_CLIENT_EMAILS = [
  "ping.biason@gmail.com",
  "carmjavier@gmail.com",
] as const;

export function isReferenceClient(email?: string | null): boolean {
  const normalizedEmail = email?.trim().toLowerCase();
  return REFERENCE_CLIENT_EMAILS.some(
    (referenceEmail) => referenceEmail === normalizedEmail,
  );
}
