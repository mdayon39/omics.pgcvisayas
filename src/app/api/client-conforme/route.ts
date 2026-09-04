// API route to create Client Conforme with proper IP capture and Admin permissions
// Explicitly use Node.js runtime (required for firebase-admin and fs)
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import admin from "firebase-admin";

export async function POST(request: NextRequest) {
  console.log("📋 Client Conforme API called (Admin Mode)");

  if (!adminDb) {
    console.warn(
      "⚠️ adminDb not initialized. Please configure your service account.",
    );
    return NextResponse.json(
      {
        error:
          "Firebase Admin SDK not initialized. Please check your environment variables.",
      },
      { status: 500 },
    );
  }

  try {
    const body = await request.json();
    console.log("📄 Request body:", {
      clientName: body.clientName,
      inquiryId: body.inquiryId,
      clientEmail: body.clientEmail,
    });

    const {
      documentVersion = "PGCV-LF-CC-v005",
      clientName,
      designation,
      affiliation,
      projectTitle,
      fundingAgency,
      inquiryId,
      clientEmail,
      clientUid,
      projectPid,
      projectRequestId,
    } = body;

    // Validate required fields
    if (!clientName || !inquiryId || !clientEmail) {
      console.error("❌ Missing required fields:", {
        clientName: !!clientName,
        inquiryId: !!inquiryId,
        clientEmail: !!clientEmail,
      });
      return NextResponse.json(
        {
          error:
            "Missing required information: client name, inquiry ID, or email",
        },
        { status: 400 },
      );
    }

    // Get client IP address
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const cfConnectingIp = request.headers.get("cf-connecting-ip");

    const clientIp =
      forwardedFor?.split(",")[0].trim() ||
      realIp ||
      cfConnectingIp ||
      "unknown";

    const timestamp = new Date();
    const conformeId = `${inquiryId}_${timestamp.getTime()}`;
    const COLLECTION = "clientConformes";

    // Create conforme record using Admin SDK
    console.log("💾 Creating conforme record with Admin SDK...", conformeId);

    const conformeData = {
      documentVersion,
      clientName: clientName.trim() || "N/A",
      designation: designation?.trim() || "N/A",
      affiliation: affiliation?.trim() || "N/A",
      projectTitle: projectTitle?.trim() || "N/A",
      fundingAgency: fundingAgency?.trim() || "N/A",
      inquiryId,
      projectPid: projectPid || null,
      projectRequestId: projectRequestId || null,
      createdBy: clientEmail,
      ...(clientUid ? { createdByUid: clientUid } : {}),
      ...(clientUid ? { uuid: clientUid } : {}),
      clientIpAddress: clientIp,
      userAgent: request.headers.get("user-agent") || "unknown",
      browserFingerprint: "server_captured",
      agreementDate: admin.firestore.Timestamp.fromDate(timestamp),
      createdAt: admin.firestore.Timestamp.fromDate(timestamp),
      status: "completed",
      clientSignature: {
        method: "typed_name",
        data: clientName,
        timestamp: admin.firestore.Timestamp.fromDate(timestamp),
      },
      programDirectorSignature: {
        method: "auto_approved",
        data: "VICTOR MARCO EMMANUEL N. FERRIOLS, Ph.D.",
        signedBy: "vnferriols@up.edu.ph",
        timestamp: admin.firestore.Timestamp.fromDate(timestamp),
      },
    };

    // Save to Firestore using Admin SDK (bypasses security rules!)
    // If the collection doesn't exist, Firestore creates it automatically
    await adminDb.collection(COLLECTION).doc(conformeId).set({
      data: conformeData,
    });

    console.log("✅ Conforme created successfully with Admin SDK:", conformeId);

    return NextResponse.json({
      success: true,
      conformeId,
      message: "Client Conforme agreement recorded successfully",
    });
  } catch (error) {
    console.error("❌ API Error creating Client Conforme (Admin):", error);

    return NextResponse.json(
      {
        error:
          "Failed to record Client Conforme agreement. Server permissions error.",
      },
      { status: 500 },
    );
  }
}
