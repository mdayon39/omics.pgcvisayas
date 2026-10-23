const PORTAL_URL = "https://omics.pgcvisayas.upv.edu.ph/portal";
const SUBJECT = "Chat Message Update: PGC Visayas";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function createChatMessageEmail(clientName: string, adminName: string) {
  const safeClientName = escapeHtml(clientName);
  const safeAdminName = escapeHtml(adminName);

  return {
    subject: SUBJECT,
    text: `Dear ${clientName},

You have received a new message from an Admin (${adminName}) in the chatbox. To view the message, please log in to your Client Portal:
${PORTAL_URL}

Yours in utilizing OMICS for a better Philippines,
Philippine Genome Center Visayas`,
    html: `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
  <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px;">
    <h2 style="margin-top: 0; color: #1e40af;">${SUBJECT}</h2>
    <p>Dear <strong>${safeClientName}</strong>,</p>
    <p>You have received a new message from an Admin (${safeAdminName}) in the chatbox. To view the message, please log in to your Client Portal.</p>
    <p style="margin: 16px 0;"><a href="${PORTAL_URL}" style="background-color: #1e40af; color: #ffffff; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Open Client Portal</a></p>
    <p style="margin-top: 24px;">Yours in utilizing OMICS for a better Philippines,<br/>Philippine Genome Center Visayas</p>
  </div>
  <div style="margin-top: 12px; font-size: 12px; color: #94a3b8; text-align: center;">This is an automated message. Please do not reply directly to this email.</div>
</div>`,
  };
}
