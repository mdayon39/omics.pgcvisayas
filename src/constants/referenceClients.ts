const EXCLUDED_CLIENT_EMAIL = "dayonmerlitojr@gmail.com";

export function isReferenceClient(email?: string | null): boolean {
  const normalizedEmail = email?.trim().toLowerCase();
  return Boolean(normalizedEmail && normalizedEmail !== EXCLUDED_CLIENT_EMAIL);
}
