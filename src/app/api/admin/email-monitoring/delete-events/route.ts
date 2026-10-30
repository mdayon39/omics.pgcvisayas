import { NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";

const MAX_DELETE_COUNT = 300;

export async function POST(request: Request) {
  if (!adminDb) {
    return NextResponse.json(
      { error: "Firebase Admin is unavailable." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(tokenMatch[1]);
  } catch {
    return NextResponse.json(
      { error: "Invalid authentication token" },
      { status: 401 },
    );
  }

  const adminEmail =
    typeof decodedToken.email === "string"
      ? decodedToken.email.trim().toLowerCase()
      : "";
  if (!adminEmail) {
    return NextResponse.json(
      { error: "An authenticated superadmin account is required." },
      { status: 403 },
    );
  }

  try {
    const adminSnapshot = await adminDb
      .collection("admins")
      .doc(adminEmail)
      .get();
    const adminData = adminSnapshot.data();
    const role = String(adminData?.role || "")
      .toLowerCase()
      .replace(/[-_\s]/g, "");
    if (
      !adminSnapshot.exists ||
      adminData?.status === "deactivated" ||
      role !== "superadmin"
    ) {
      return NextResponse.json(
        { error: "Superadmin access required." },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 },
      );
    }

    const requestedIds =
      typeof body === "object" &&
      body !== null &&
      "eventIds" in body &&
      Array.isArray(body.eventIds)
        ? body.eventIds
        : [];
    const eventIds = [
      ...new Set(
        requestedIds.map((eventId) =>
          typeof eventId === "string" ? eventId.trim() : "",
        ),
      ),
    ];
    if (
      eventIds.length === 0 ||
      eventIds.length > MAX_DELETE_COUNT ||
      eventIds.some((eventId) => !eventId || eventId.includes("/"))
    ) {
      return NextResponse.json(
        {
          error: `Provide between 1 and ${MAX_DELETE_COUNT} valid event IDs.`,
        },
        { status: 400 },
      );
    }

    const batch = adminDb.batch();
    for (const eventId of eventIds) {
      batch.delete(adminDb.collection("emailMonitoringEvents").doc(eventId));
    }
    await batch.commit();

    return NextResponse.json({ deletedCount: eventIds.length });
  } catch (error) {
    console.error("Could not delete email monitoring events:", error);
    return NextResponse.json(
      { error: "Could not delete the selected notification events." },
      { status: 500 },
    );
  }
}
