const MODE_OF_PAYMENT_SOURCE_URL =
  "https://firebasestorage.googleapis.com/v0/b/pgc-genomebase.firebasestorage.app/o/documents%2Fmode_of_payment.pdf?alt=media&token=279c10a9-ce74-40ef-8e7d-80a86820a8e0";

export async function GET(): Promise<Response> {
  let fileResponse: Response;
  try {
    fileResponse = await fetch(MODE_OF_PAYMENT_SOURCE_URL, {
      cache: "no-store",
    });
  } catch (error) {
    console.error("Failed to retrieve the Mode of Payment PDF:", error);
    return Response.json(
      { error: "Could not retrieve the Mode of Payment PDF" },
      { status: 502 },
    );
  }

  if (!fileResponse.ok || !fileResponse.body) {
    console.error(
      "Mode of Payment PDF request failed:",
      fileResponse.status,
      fileResponse.statusText,
    );
    return Response.json(
      { error: "Could not retrieve the Mode of Payment PDF" },
      { status: 502 },
    );
  }

  return new Response(fileResponse.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="Mode-of-Payment.pdf"',
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
