import { auth } from "@/lib/firebase";

export async function openServiceReport(
  projectId: string,
  reportId: string,
  targetWindow?: Window | null,
): Promise<void> {
  const reportWindow =
    targetWindow === undefined ? window.open("about:blank", "_blank") : targetWindow;
  if (!reportWindow) {
    throw new Error("Allow pop-ups to open the service report.");
  }
  reportWindow.opener = null;

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Sign in again to open this service report.");

    const idToken = await user.getIdToken();
    const response = await fetch(
      `/api/service-reports/${encodeURIComponent(projectId)}/${encodeURIComponent(reportId)}`,
      { method: "POST", headers: { Authorization: `Bearer ${idToken}` } },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Could not open service report.");
    }

    const result = await response.json();
    if (typeof result.url !== "string") {
      throw new Error("Could not open service report.");
    }

    reportWindow.location.replace(result.url);
  } catch (error) {
    reportWindow.close();
    throw error;
  }
}