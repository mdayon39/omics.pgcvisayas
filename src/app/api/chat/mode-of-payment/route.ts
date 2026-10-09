const MODE_OF_PAYMENT_URL =
  "https://firebasestorage.googleapis.com/v0/b/pgc-genomebase.firebasestorage.app/o/documents%2FMode%20of%20Payment_PGCV-MP-v005.pdf?alt=media&token=bb3d7fdf-77db-430c-9b3a-6b56724bca84";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let pdfResponse: Response;
  try {
    pdfResponse = await fetch(MODE_OF_PAYMENT_URL, { cache: "no-store" });
  } catch (error) {
    console.error("Failed to retrieve the Mode of Payment PDF:", error);
    return Response.json(
      { error: "Payment instructions are temporarily unavailable" },
      { status: 502 },
    );
  }

  if (!pdfResponse.ok || !pdfResponse.body) {
    console.error(
      "Mode of Payment PDF request failed:",
      pdfResponse.status,
      pdfResponse.statusText,
    );
    return Response.json(
      { error: "Payment instructions are temporarily unavailable" },
      { status: 502 },
    );
  }

  return new Response(pdfResponse.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Mode-of-Payment.pdf"',
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
