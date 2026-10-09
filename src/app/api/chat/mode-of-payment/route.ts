import { getStorageBucket } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const bucket = getStorageBucket();
  if (!bucket) {
    console.error("Firebase Storage is unavailable for the Mode of Payment PDF");
    return Response.json(
      { error: "Payment instructions are temporarily unavailable" },
      { status: 503 },
    );
  }

  try {
    const file = bucket.file("documents/mode_of_payment.pdf");
    const [exists] = await file.exists();
    if (!exists) {
      console.error("Mode of Payment PDF is missing from Firebase Storage");
      return Response.json(
        { error: "Payment instructions are unavailable" },
        { status: 404 },
      );
    }

    const [contents] = await file.download();
    return new Response(new Uint8Array(contents), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Mode-of-Payment.pdf"',
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to retrieve the Mode of Payment PDF:", error);
    return Response.json(
      { error: "Payment instructions are temporarily unavailable" },
      { status: 502 },
    );
  }
}
