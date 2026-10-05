"use client";

import { auth } from "@/lib/firebase";

export async function openServiceReport(
  projectId: string,
  reportId: string,
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to access this service report.");

  const reportWindow = window.open("about:blank", "_blank");
  if (!reportWindow) throw new Error("Allow pop-ups to open the service report.");

  try {
    const idToken = await user.getIdToken();
    const response = await fetch(
      `/api/service-reports/${encodeURIComponent(projectId)}/${encodeURIComponent(reportId)}`,
      { headers: { Authorization: `Bearer ${idToken}` } },
    );

    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? "You do not have access to this service report."
          : "Unable to open the service report.",
      );
    }

    const fileUrl = URL.createObjectURL(await response.blob());
    reportWindow.location.replace(fileUrl);
    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 10 * 60 * 1000);
  } catch (error) {
    reportWindow.close();
    throw error;
  }
}
