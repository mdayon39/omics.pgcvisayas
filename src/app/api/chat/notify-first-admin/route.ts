import { NextResponse } from "next/server";
import { addDoc, collection, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const PORTAL_URL = "https://omics.pgcvisayas.upv.edu.ph/portal";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const threadId = String(body?.threadId || "").trim();
    const adminName = String(body?.adminName || "Admin").trim() || "Admin";
    const emailType = String(body?.emailType || "first-admin").trim();

    if (!threadId) {
      return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
    }

    const threadRef = doc(db, "quotationThreads", threadId);
    const threadSnap = await getDoc(threadRef);
    if (!threadSnap.exists()) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const threadData = threadSnap.data() as {
      clientEmail?: string;
      clientName?: string;
    };

    const clientEmail = threadData.clientEmail || "";
    const clientName = threadData.clientName || "Client";

    if (!clientEmail) {
      return NextResponse.json(
        { error: "Client email not found" },
        { status: 400 },
      );
    }

    const isFollowUp = emailType === "follow-up";
    const subject = isFollowUp
      ? "Chat Message Update: PGC Visayas"
      : "Chat Message Received: PGC Visayas";

    const emailText = `Dear ${clientName},

You have received ${isFollowUp ? "a follow-up" : "a new"} message from an Admin (${adminName}) in the chatbox. To view the message, please log in to your Client Portal:
${PORTAL_URL}

Yours in utilizing OMICS for a better Philippines,
Philippine Genome Center Visayas`;

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px;">
          <h2 style="margin-top: 0; color: #1e40af;">${subject}</h2>
          <p>Dear <strong>${clientName}</strong>,</p>
          <p>You have received ${isFollowUp ? "a follow-up" : "a new"} message from an Admin (${adminName}) in the chatbox. To view the message, please log in to your Client Portal.</p>
          <p style="margin: 16px 0;">
            <a href="${PORTAL_URL}" style="background-color: #1e40af; color: #ffffff; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Open Client Portal</a>
          </p>
          <p style="margin-top: 24px;">Yours in utilizing OMICS for a better Philippines,<br/>Philippine Genome Center Visayas</p>
        </div>
        <div style="margin-top: 12px; font-size: 12px; color: #94a3b8; text-align: center;">
          This is an automated message. Please do not reply directly to this email.
        </div>
      </div>
    `;

    await addDoc(collection(db, "mail"), {
      to: [clientEmail],
      inquiryId: threadId,
      message: {
        subject,
        text: emailText,
        html: emailHtml,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to send chat notification email:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 },
    );
  }
}
