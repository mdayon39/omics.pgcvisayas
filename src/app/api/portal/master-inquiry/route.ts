import { NextResponse } from "next/server";
import admin, { adminDb } from "@/lib/firebase-admin";
import type { DecodedIdToken } from "firebase-admin/auth";
import {
  MASTER_PORTAL_EMAILS,
  PORTAL_ALLOWED_INQUIRY_STATUSES,
} from "@/constants/portalAccess";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!adminDb) {
      throw new Error("Firebase Admin is unavailable for portal inquiry lookup.");
    }

    const authorization = request.headers.get("authorization") || "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(tokenMatch[1]);
    } catch {
      return NextResponse.json(
        { error: "Your sign-in session is invalid. Please sign in again." },
        { status: 401 },
      );
    }

    const email = decodedToken.email?.trim().toLowerCase();
    if (
      !email ||
      decodedToken.email_verified !== true ||
      !MASTER_PORTAL_EMAILS.includes(
        email as (typeof MASTER_PORTAL_EMAILS)[number],
      )
    ) {
      return NextResponse.json(
        { error: "Master portal access is not available for this account." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const inquiryId =
      typeof body?.inquiryId === "string" ? body.inquiryId.trim() : "";
    if (!inquiryId) {
      return NextResponse.json(
        { error: "Enter the client's inquiry ID." },
        { status: 400 },
      );
    }

    const inquirySnapshot = await adminDb
      .collection("inquiries")
      .doc(inquiryId)
      .get();
    if (!inquirySnapshot.exists) {
      return NextResponse.json(
        { error: "No inquiry was found with that ID." },
        { status: 404 },
      );
    }

    const data = inquirySnapshot.data() ?? {};
    const status = typeof data.status === "string" ? data.status : "";
    if (
      data.isApproved !== true &&
      !PORTAL_ALLOWED_INQUIRY_STATUSES.includes(
        status as (typeof PORTAL_ALLOWED_INQUIRY_STATUSES)[number],
      )
    ) {
      return NextResponse.json(
        { error: "This inquiry is not currently eligible for portal access." },
        { status: 403 },
      );
    }

    return NextResponse.json({
      inquiry: {
        id: inquirySnapshot.id,
        email: typeof data.email === "string" ? data.email : "",
        name:
          typeof data.name === "string"
            ? data.name
            : typeof data.fullName === "string"
              ? data.fullName
              : "",
        status,
        isApproved: data.isApproved === true,
      },
    });
  } catch (error) {
    console.error("Master portal inquiry lookup failed:", error);
    return NextResponse.json(
      { error: "Could not verify the inquiry. Please try again." },
      { status: 500 },
    );
  }
}
