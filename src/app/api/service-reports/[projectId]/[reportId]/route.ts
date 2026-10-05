import { NextRequest, NextResponse } from "next/server";
import admin, { getFirestoreDb, getStorageBucket } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function normalizeEmail(value?: string | null): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function clientHasProject(data: Record<string, unknown>, projectId: string) {
  const projectIds = Array.isArray(data.pid)
    ? data.pid
    : typeof data.pid === "string"
      ? [data.pid]
      : [];
  return projectIds.includes(projectId);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  const database = getFirestoreDb();
  if (!database) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!token) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const email = normalizeEmail(decodedToken.email);
  if (!email) {
    return NextResponse.json({ error: "Account email is unavailable." }, { status: 403 });
  }

  const { projectId, reportId } = await params;
  if (!projectId || !reportId || projectId.includes("/") || reportId.includes("/")) {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }

  try {
    const reportRef = database
      .collection("projects")
      .doc(projectId)
      .collection("serviceReports")
      .doc(reportId);
    const reportSnapshot = await reportRef.get();
    if (!reportSnapshot.exists) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const report = reportSnapshot.data() || {};
    const adminById = await database.collection("admins").doc(email).get();
    const adminByEmail = adminById.exists
      ? adminById
      : (await database
          .collection("admins")
          .where("email", "==", email)
          .limit(1)
          .get()).docs[0];
    const isAdmin = Boolean(adminByEmail && ("exists" in adminByEmail ? adminByEmail.exists : true));

    if (!isAdmin) {
      if (report.clientAccessEnabled === false) {
        return NextResponse.json({ error: "Client access to this report is disabled." }, { status: 403 });
      }

      const [emailClients, uidClients] = await Promise.all([
        database.collection("clients").where("email", "==", email).limit(20).get(),
        database.collection("clients").where("uuid", "==", decodedToken.uid).limit(20).get(),
      ]);
      const linkedClientDocs = new Map([
        ...emailClients.docs.map((clientDoc) => [clientDoc.id, clientDoc] as const),
        ...uidClients.docs.map((clientDoc) => [clientDoc.id, clientDoc] as const),
      ]);
      const hasProjectAccess = Array.from(linkedClientDocs.values()).some((clientDoc) =>
        clientHasProject(clientDoc.data(), projectId),
      );

      if (!hasProjectAccess) {
        return NextResponse.json({ error: "You do not have access to this report." }, { status: 403 });
      }
    }

    const storagePath = report.storagePath;
    if (
      typeof storagePath !== "string" ||
      !storagePath.startsWith(`serviceReports/${projectId}/`) ||
      storagePath.split("/").includes("..")
    ) {
      return NextResponse.json({ error: "Report file path is invalid." }, { status: 404 });
    }

    const bucket = getStorageBucket();
    if (!bucket) {
      return NextResponse.json({ error: "File storage is unavailable." }, { status: 503 });
    }

    const file = bucket.file(storagePath);
    const [fileExists] = await file.exists();
    if (!fileExists) {
      return NextResponse.json({ error: "Report file not found." }, { status: 404 });
    }

    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
    });
    return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to authorize service report access:", error);
    return NextResponse.json({ error: "Could not open service report." }, { status: 500 });
  }
}