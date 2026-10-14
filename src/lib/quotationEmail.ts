export function createQuotationAvailabilityEmail(clientName: string) {
  const escapedClientName = clientName.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });

  return {
    subject: "Quotation Available: PGC Visayas",
    text: `
Quotation Available - PGC Visayas

Dear ${clientName},

Your quotation is now available in your client portal. Please note that the quotation does not include re-runs for unsuccessful samples. Make sure to read our FAQs (https://omics.pgcvisayas.upv.edu.ph/faqs) for details about turnaround time, sample submission, and payment details.

To view the quotation and progress of requested services, kindly log in to your Client Portal: https://omics.pgcvisayas.upv.edu.ph/portal

If you'd like to proceed with the service, please complete the client and project details in the portal and submit for admin review. Kindly wait for a confirmation if your project has been approved before scheduling any laboratory use or sending samples.

Yours in utilizing OMICS for a better Philippines,
Philippine Genome Center Visayas
    `.trim(),
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
        <div style="background-color: #f1f5f9; padding: 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <h2 style="color: #1e3a8a; margin-top: 0;">Quotation Available - PGC Visayas</h2>
          <p>Dear ${escapedClientName},</p>
          <p>Your quotation is now available in your client portal. <strong>Please note that the quotation does not include re-runs for unsuccessful samples.</strong> Make sure to read our <a href="https://omics.pgcvisayas.upv.edu.ph/faqs" style="color: #1e3a8a; font-weight: 600; text-decoration: underline;">FAQs</a> for details about turnaround time, sample submission, and payment details.</p>
          <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; border-left: 4px solid #1e3a8a; margin: 15px 0;">
            <h3 style="margin-top: 0; color: #1e3a8a; font-size: 14px; margin-bottom: 8px;">Next Steps</h3>
            <p style="margin-bottom: 12px; font-size: 14px;">View your quotation and monitor progress via the Client Portal.</p>
            <p style="margin: 0;"><a href="https://omics.pgcvisayas.upv.edu.ph/portal" style="background-color: #1e3a8a; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: 600; font-size: 13px;">Access Client Portal</a></p>
          </div>
          <p>If you'd like to proceed with the service, please complete the client and project details in the portal and submit for admin review. Kindly wait for a confirmation if your project has been approved before scheduling any laboratory use or sending samples.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="font-size: 13px; color: #64748b; margin-bottom: 0;">Yours in utilizing OMICS for a better Philippines,<br /><strong>Philippine Genome Center Visayas</strong></p>
        </div>
      </div>
    `,
  };
}
