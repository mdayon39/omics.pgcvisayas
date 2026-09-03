// API Route: POST /api/portal/forgot-password
// Looks up inquiries by the client's Google-authenticated email and
// sends a single password recovery email — either their custom password
// (if they changed it) or their earliest inquiry ID.

import { NextRequest, NextResponse } from "next/server";
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const PORTAL_URL = "https://omics.pgcvisayas.upv.edu.ph/portal";

const ALLOWED_STATUSES = [
  "Pending",
  "Approved Client",
  "Quotation Only",
  "Ongoing Quotation",
  "In Progress",
  "Service Not Offered",
];

// Simple in-memory rate limiter: max 3 requests per email per 15 min window.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(email);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(email, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count += 1;
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email: string = (body?.email || "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email is required." },
        { status: 400 },
      );
    }

    if (isRateLimited(email)) {
      return NextResponse.json(
        {
          error:
            "Too many requests. Please wait 15 minutes before trying again.",
        },
        { status: 429 },
      );
    }

    const snapshot = await getDocs(
      query(collection(db, "inquiries"), where("email", "==", email)),
    );

    if (snapshot.empty) {
      return NextResponse.json(
        {
          error:
            "No account was found linked to this email address. Please make sure you're signed in with the same Google account you used when submitting your inquiry.",
        },
        { status: 404 },
      );
    }

    // Filter to portal-eligible inquiries only
    const eligible = snapshot.docs.filter((d) =>
      ALLOWED_STATUSES.includes(d.data().status || ""),
    );

    if (eligible.length === 0) {
      return NextResponse.json(
        {
          error:
            "Your account is not currently eligible for portal access. Please contact PGC Visayas for assistance.",
        },
        { status: 403 },
      );
    }

    // Determine the single active password:
    // 1. If any inquiry has a customPassword set, use that (client changed their password).
    // 2. Otherwise use the ID of the earliest-created eligible inquiry.
    const withCustomPw = eligible.find((d) => !!d.data().customPassword);

    let activePassword: string;
    let clientName: string;

    if (withCustomPw) {
      activePassword = withCustomPw.data().customPassword as string;
      clientName =
        withCustomPw.data().name || withCustomPw.data().fullName || "Client";
    } else {
      // Sort ascending by createdAt to find the first inquiry
      const sorted = [...eligible].sort((a, b) => {
        const tsA = a.data().createdAt;
        const tsB = b.data().createdAt;
        const msA =
          tsA instanceof Timestamp ? tsA.toMillis() : tsA ? Number(tsA) : 0;
        const msB =
          tsB instanceof Timestamp ? tsB.toMillis() : tsB ? Number(tsB) : 0;
        return msA - msB;
      });
      const first = sorted[0];
      activePassword = first.id;
      clientName = first.data().name || first.data().fullName || "Client";
    }

    const emailText = `Dear ${clientName},

Your current password is:

  Password: ${activePassword}

To log in, visit: ${PORTAL_URL}

Sign in with your Google account, then enter the password above.

If you did not request this, please ignore this email — no changes have been made to your account.

Yours in utilizing OMICS for a better Philippines,
Philippine Genome Center Visayas`;

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; color: #334155; line-height: 1.6;">
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 32px;">
          <h2 style="margin-top: 0; color: #1e40af; font-size: 18px;">Client Portal — Password Recovery</h2>
          <p>Dear <strong>${clientName}</strong>,</p>
          <p>Your current password is:</p>

          <div style="margin: 20px 0; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px 20px; text-align: center;">
            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em;">Password</p>
            <p style="margin: 0; font-family: monospace; font-size: 16px; font-weight: 700; color: #1e40af; word-break: break-all;">${activePassword}</p>
          </div>

          <p style="margin: 20px 0 8px;">To access your portal, click the button below and sign in with your Google account, then enter the password above.</p>
          <p style="margin: 16px 0;">
            <a href="${PORTAL_URL}" style="background-color: #1e40af; color: #ffffff; padding: 10px 22px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 14px;">Open Client Portal</a>
          </p>

          <p style="font-size: 12px; color: #64748b; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
            If you did not request this email, you can safely ignore it. No changes have been made to your account.
          </p>

          <p style="margin-top: 20px; margin-bottom: 0;">Yours in utilizing OMICS for a better Philippines,<br/><strong>Philippine Genome Center Visayas</strong></p>
        </div>
        <div style="margin-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
          This is an automated message. Please do not reply directly to this email.
        </div>
      </div>
    `;

    await addDoc(collection(db, "mail"), {
      to: [email],
      message: {
        subject: "Client Portal — Password Recovery",
        text: emailText,
        html: emailHtml,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("forgot-password route error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 },
    );
  }
}
