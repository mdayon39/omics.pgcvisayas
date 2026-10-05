import { NextRequest, NextResponse } from "next/server";
import admin, { adminDb, getStorageBucket } from "@/lib/firebase-admin";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ projectId: string; reportId: string }>;
}

function clientHasProject(clientData: Record<string, any>, projectId: string) {
  const projectIds = Array.isArray(clientData.pid)
    ? clientData.pid
    : clientData.pid
      ? [clientData.pid]
      : [];
  return projectIds.includes(projectId);
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authorization = request.headers.get("authorization") || "";
  const idToken = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  if (!idToken) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email?.trim().toLowerCase();
    if (!email || !adminDb) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { projectId, reportId } = await params;
    const reportSnapshot = await adminDb
      .collection("projects")
      .doc(projectId)
      .collection("serviceReports")
      .doc(reportId)
      .get();

    if (!reportSnapshot.exists) {
      return NextResponse.json({ error: "Service report not found." }, { status: 404 });
    }

    const report = reportSnapshot.data() || {};
    const storagePath = report.storagePath;
    if (
      typeof storagePath !== "string" ||
      !storagePath.startsWith(`serviceReports/${projectId}/`) ||
      storagePath.includes("..")
    ) {
      return NextResponse.json({ error: "Invalid service report path." }, { status: 400 });
    }

    const adminSnapshot = await adminDb.collection("admins").doc(email).get();
    const isAdmin = adminSnapshot.exists;

    if (!isAdmin) {
      const clientsSnapshot = await adminDb
        .collection("clients")
        .where("email", "==", email)
        .get();
      const hasProjectAccess = clientsSnapshot.docs.some((clientSnapshot) =>
        clientHasProject(clientSnapshot.data(), projectId),
      );

      if (!hasProjectAccess) {
        return NextResponse.json({ error: "You do not have access to this service report." }, { status: 403 });
      }

      if (
        String(report.status || "").toLowerCase() !== "received" ||
        report.clientAccessEnabled === false
      ) {
        return NextResponse.json({ error: "This service report is not available yet." }, { status: 403 });
      }
    }

    const bucket = getStorageBucket();
    if (!bucket) {
      return NextResponse.json({ error: "File storage is unavailable." }, { status: 503 });
    }

    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json({ error: "Service report file not found." }, { status: 404 });
    }

    const [[fileBuffer], [metadata]] = await Promise.all([
      file.download(),
      file.getMetadata(),
    ]);
    const fileName = String(report.fileName || "service-report.pdf").replace(/[\r\n"]/g, "_");

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": metadata.contentType || report.contentType || "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Service report access failed:", error);
    return NextResponse.json({ error: "Unable to access service report." }, { status: 500 });
  }
}
