/**
 * Maps formal admin usernames to informal display names for the chat widget.
 */
const ADMIN_NAME_MAP: Record<string, string> = {
  acnoblezada: "Albert",
  apbernas: "Dan",
  ccflorece: "Tine",
  ctmueda: "Cams",
  kptenizo: "Karl",
  madayon1: "Merl",
  mdlojera: "Mics",
  mfjavier: "Carms",
  jcvelo: "Jaz",
};

/**
 * Maps formal admin usernames to friendly emoji icons.
 */
const ADMIN_ICON_MAP: Record<string, string> = {
  acnoblezada: "👨‍🔬", // Albert
  apbernas: "👩‍🎨",    // Dan
  ccflorece: "👩‍🎨",    // Tine
  ctmueda: "👩‍🎨",     // Cams
  kptenizo: "👨‍🏫",    // Karl
  madayon1: "👨‍🔬",    // Merl
  mdlojera: "👩‍🎨",    // Mics
  mfjavier: "👩‍🎨",    // Carms
  jcvelo: "👩‍🎨",    // Jaz
};

export const ADMIN_CHAT_ICON_OPTIONS = [
  { value: "👨‍🔬", label: "Man scientist" },
  { value: "👩‍🔬", label: "Woman scientist" },
  { value: "🧑‍🔬", label: "Scientist" },
  { value: "👨‍🎨", label: "Man artist" },
  { value: "👩‍🎨", label: "Woman artist" },
  { value: "👨‍💻", label: "Man technologist" },
  { value: "👩‍💻", label: "Woman technologist" },
  { value: "🧑‍💻", label: "Technologist" },
  { value: "👨‍🏫", label: "Man teacher" },
  { value: "👩‍🏫", label: "Woman teacher" },
  { value: "🧑‍🏫", label: "Teacher" },
  { value: "👋", label: "Waving hand" },
] as const;

const ADMIN_CHAT_PROFILE_MAP = new Map<
  string,
  { alias?: string; icon?: string }
>();

export function registerAdminChatProfiles(
  admins: { email: string; chatAlias?: string; chatIcon?: string }[],
) {
  for (const admin of admins) {
    ADMIN_CHAT_PROFILE_MAP.set(admin.email.toLowerCase(), {
      alias: admin.chatAlias?.trim() || undefined,
      icon: admin.chatIcon || undefined,
    });
  }
}

/**
 * Returns a formal or informal name for an admin based on their email or username.
 * If the username is found in the map, it returns the mapped name.
 * Otherwise, it returns the capitalized username or the original value.
 */
export function getAdminDisplayName(identifier: string | null | undefined): string {
  if (!identifier) return "Admin";

  const normalizedIdentifier = identifier.toLowerCase();
  const profile = ADMIN_CHAT_PROFILE_MAP.get(normalizedIdentifier);
  if (profile?.alias) return profile.alias;

  const username = identifier.includes("@")
    ? identifier.split("@")[0].toLowerCase()
    : identifier.toLowerCase();
  const displayName = ADMIN_NAME_MAP[username] || (username.charAt(0).toUpperCase() + username.slice(1));
  return displayName;
}

/**
 * Returns a formal or informal name for an admin with icon.
 */
export function getAdminDisplayNameWithIcon(identifier: string | null | undefined): string {
  if (!identifier) return "👋 Admin";

  const normalizedIdentifier = identifier.toLowerCase();
  const profile = ADMIN_CHAT_PROFILE_MAP.get(normalizedIdentifier);
  const username = identifier.includes("@")
    ? identifier.split("@")[0].toLowerCase()
    : identifier.toLowerCase();

  const displayName = getAdminDisplayName(identifier);
  const icon = profile?.icon || ADMIN_ICON_MAP[username] || "👋";

  return `${icon} ${displayName}`;
}

export function getClientInitials(name: string | null | undefined): string {
  const normalizedName = name?.trim();

  if (!normalizedName) return "CL";

  const parts = normalizedName.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}
