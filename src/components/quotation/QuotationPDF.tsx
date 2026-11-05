// src/app/components/quotation/QuotationPDF.tsx
"use client";

import {
  Page,
  Text,
  View,
  Document,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import { SelectedService } from "@/types/Quotation";
import { pgcLogo, schoolLogo } from "@/assets/logosBase64";
import { signatureCarmel } from "@/assets/signatures";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", lineHeight: 1.4 },
  logoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  logo: { width: 45, height: 45 },
  pgcLogo: { width: 150, height: 45, objectFit: "contain" },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 4,
  },
  subtitle: { fontSize: 10, textAlign: "center", marginBottom: 16 },
  section: { marginBottom: 10 },
  label: { fontWeight: "bold" },
  table: {
    width: "100%",
    borderTop: "1pt solid black",
    borderLeft: "1pt solid black",
  },
  tableRow: { flexDirection: "row" },
  tableHeader: { fontWeight: "bold", backgroundColor: "#eee" },
  headerCell: {
    flex: 1,
    padding: 4,
    borderRight: "1pt solid black",
    borderBottom: "1pt solid black",
  },
  cell: {
    flex: 1,
    padding: 4,
    borderRight: "1pt solid black",
    borderBottom: "1pt solid black",
  },
  serviceCell: {
    flex: 3,
    padding: 4,
    borderRight: "1pt solid black",
    borderBottom: "1pt solid black",
  },
  unitCell: {
    flex: 1,
    padding: 4,
    borderRight: "1pt solid black",
    borderBottom: "1pt solid black",
  },
  priceCell: {
    flex: 1,
    padding: 4,
    borderRight: "1pt solid black",
    borderBottom: "1pt solid black",
  },
  qtyCell: {
    flex: 0.6,
    padding: 4,
    borderRight: "1pt solid black",
    borderBottom: "1pt solid black",
  },
  amountCell: {
    flex: 1.2,
    padding: 4,
    borderRight: "1pt solid black",
    borderBottom: "1pt solid black",
  },
  categoryHeader: {
    padding: 4,
    fontWeight: "bold",
    backgroundColor: "#f0f0f0",
    borderBottom: "1pt solid black",
    fontSize: 10,
  },
  summary: {
    marginTop: 12,
    alignItems: "flex-end",
    textAlign: "right",
    gap: 2,
  },
  italicNote: { fontStyle: "italic", fontSize: 9, marginTop: 2 },
  signature: { marginTop: 20, fontSize: 10, marginBottom: 40 },
  footerSection: { marginTop: 16, marginBottom: 40 },
  pageNumber: {
    position: "absolute",
    fontSize: 10,
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#333",
  },
});

function formatMoney(num: number) {
  const fixed = Math.round(num * 100) / 100;
  const parts = fixed.toString().split(".");
  let integer = parts[0];
  let decimal = parts[1] || "00";
  if (decimal.length === 1) decimal += "0";
  let result = "";
  while (integer.length > 3) {
    result = "," + integer.slice(-3) + result;
    integer = integer.slice(0, -3);
  }
  result = integer + result;
  return result + "." + decimal;
}

function normalizeSignatureName(name: string) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function getSignatureAssetByName(name: string): string | null {
  const normalized = normalizeSignatureName(name);
  const exactMatches: Record<string, string> = {
    CARMEL: "/assets/signature_carmel.png",
    "ALBERT NOBLEZADA": "/assets/signature_noblezada.png",
    "CRISTINE FLORECE": "/assets/signature_florece.png",
    "CHRISTINE FLORECE": "/assets/signature_florece.png",
    "CAMILLE MUEDA": "/assets/signature_mueda.png",
    "MICAH LOJERA": "/assets/signature_lojera.png",
    "JASMINE VELO": "/assets/signature_velo.png",
    "KARL TENIZO": "/assets/signature_tenizo.png",
    "DIANNE FRANCES A PENUELA": "/assets/signature_penuela.png",
    "MERLITO DAYON": "/assets/signature_dayon.png",
    "MERLITO A DAYON": "/assets/signature_dayon.png",
    "MERLITO A DAYON JR": "/assets/signature_dayon.png",
    "MERLITO DAYON JR": "/assets/signature_dayon.png",
    "VICTOR FERRIOLS": "/assets/signature_ferriols.png",
  };

  if (exactMatches[normalized]) return exactMatches[normalized];

  if (normalized.includes("CARMEL")) return "/assets/signature_carmel.png";
  if (normalized.includes("ALBERT") && normalized.includes("NOBLEZADA"))
    return "/assets/signature_noblezada.png";
  if (
    (normalized.includes("CRISTINE") && normalized.includes("FLORECE")) ||
    (normalized.includes("CHRISTINE") && normalized.includes("FLORECE"))
  ) {
    return "/assets/signature_florece.png";
  }
  if (normalized.includes("CAMILLE") && normalized.includes("MUEDA"))
    return "/assets/signature_mueda.png";
  if (normalized.includes("MICAH") && normalized.includes("LOJERA"))
    return "/assets/signature_lojera.png";
  if (normalized.includes("JASMINE") && normalized.includes("VELO"))
    return "/assets/signature_velo.png";
  if (normalized.includes("KARL") && normalized.includes("TENIZO"))
    return "/assets/signature_tenizo.png";
  if (normalized.includes("DIANNE") && normalized.includes("PENUELA"))
    return "/assets/signature_penuela.png";
  if (
    (normalized.includes("MERLITO") && normalized.includes("DAYON")) ||
    (normalized.includes("MERLITO A") && normalized.includes("DAYON")) ||
    (normalized.includes("MERLITO A.") && normalized.includes("DAYON"))
  ) {
    return "/assets/signature_dayon.png";
  }
  if (normalized.includes("VICTOR") && normalized.includes("FERRIOLS"))
    return "/assets/signature_ferriols.png";

  return null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type ServiceLike = SelectedService & {
  id?: string | null;
  category?: string;
  unit: string;
  price: number;
  quantity: number;
  name: string;
};

type TotalsOverride = {
  subtotal?: number;
  discount?: number;
  total?: number;
};

export function QuotationPDF({
  services,
  clientInfo,
  referenceNumber,
  useInternalPrice,
  preparedBy,
  totalsOverride, // <-- NEW (optional)
  dateOfIssue, // <-- Date when quotation was generated
  useAffiliationAsClientName, // <-- NEW
}: {
  services: SelectedService[];
  clientInfo: {
    name: string;
    institution: string;
    designation: string;
    email: string;
  };
  referenceNumber: string;
  useInternalPrice: boolean;
  preparedBy: { name: string; position: string };
  totalsOverride?: TotalsOverride;
  dateOfIssue?: string; // ISO date string or formatted date
  useAffiliationAsClientName?: boolean;
}) {
  const safeServices: ServiceLike[] = (services ?? []).filter(
    (s): s is ServiceLike =>
      s != null &&
      typeof (s as any).price === "number" &&
      typeof (s as any).quantity === "number",
  );
  // Debug: Log services with descriptions
  /*console.log('PDF Services:', safeServices.map(s => ({
    name: s.name,
    description: s.description,
    hasDescription: !!(s as any).description
  })));*/
  // group by category (fallback to "Uncategorized")
  const groupedByCategory = safeServices.reduce<Record<string, ServiceLike[]>>(
    (acc, svc) => {
      const key =
        svc.category && svc.category.trim() ? svc.category : "Uncategorized";
      (acc[key] ||= []).push(svc);
      return acc;
    },
    {},
  );

  // Default math (new quotes): 12% of subtotal if internal
  const computedSubtotal = r2(
    safeServices.reduce((sum, s) => sum + s.price * s.quantity, 0),
  );
  const computedDiscount = useInternalPrice ? r2(computedSubtotal * 0.12) : 0;
  const computedTotal = r2(computedSubtotal - computedDiscount);

  // If overrides are provided (migrated quotes), use them
  const subtotal = totalsOverride?.subtotal ?? computedSubtotal;
  const discount = totalsOverride?.discount ?? computedDiscount;
  const total = totalsOverride?.total ?? computedTotal;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.logoRow}>
          <Image src={schoolLogo} style={styles.logo} />
          <Image src={pgcLogo} style={styles.pgcLogo} />
        </View>
        <Text style={styles.title}>QUOTATION FORM</Text>
        <Text style={styles.subtitle}>
          (Valid for 30 days from the date of issue)
        </Text>

        <View style={styles.section}>
          <Text>
            <Text style={styles.label}>Reference No:</Text> {referenceNumber}
          </Text>
          {dateOfIssue && (
            <Text>
              <Text style={styles.label}>Date Issued:</Text> {dateOfIssue}
            </Text>
          )}
          <Text>
            <Text style={styles.label}>Client Name:</Text>{" "}
            {useAffiliationAsClientName
              ? clientInfo.institution
              : clientInfo.name}
          </Text>
          {!useAffiliationAsClientName && (
            <Text>
              <Text style={styles.label}>Institution:</Text>{" "}
              {clientInfo.institution}
            </Text>
          )}
          <Text>
            <Text style={styles.label}>Designation:</Text>{" "}
            {clientInfo.designation}
          </Text>
          <Text>
            <Text style={styles.label}>Email:</Text> {clientInfo.email}
          </Text>
          <Text>
            <Text style={styles.label}>Applied 12% Discount:</Text>{" "}
            {useInternalPrice ? "Yes" : "No"}
          </Text>
        </View>

        <Text style={{ marginBottom: 10 }}>
          Dear Valued Client,{"\n"}
          Thank you for choosing the Philippine Genome Center Visayas for your
          research and training needs. We are pleased to quote you the
          following:
        </Text>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.headerCell, { flex: 3 }]}>Service</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Unit</Text>
            <Text style={[styles.headerCell, { flex: 1 }]}>Price</Text>
            <Text style={[styles.headerCell, { flex: 0.6 }]}>Qty</Text>
            <Text style={[styles.headerCell, { flex: 1.2 }]}>Amount</Text>
          </View>

          {Object.entries(groupedByCategory).map(([category, items]) => (
            <View key={category}>
              <Text style={styles.categoryHeader}>{category}</Text>
              {items.map((svc, idx) => {
                const amount = svc.price * svc.quantity;
                const key = `${svc.id ?? "custom"}-${svc.name}-${idx}`;
                const description = svc.description || (svc as any).description;
                return (
                  <View key={key}>
                    <View style={styles.tableRow}>
                      <Text style={styles.serviceCell}>{svc.name}</Text>
                      <Text style={styles.unitCell}>{svc.unit}</Text>
                      <Text style={styles.priceCell}>
                        {formatMoney(svc.price)}
                      </Text>
                      <Text style={styles.qtyCell}>{svc.quantity}</Text>
                      <Text style={styles.amountCell}>
                        {formatMoney(amount)}
                      </Text>
                    </View>
                    {description && (
                      <View style={styles.tableRow}>
                        <Text
                          style={[
                            styles.serviceCell,
                            {
                              flex: 5.8,
                              fontSize: 8,
                              fontStyle: "italic",
                              paddingLeft: 12,
                              color: "#666",
                              paddingTop: 2,
                              paddingBottom: 4,
                            },
                          ]}
                        >
                          {description}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.summary}>
          <Text>Subtotal: PHP {formatMoney(subtotal)}</Text>
          {useInternalPrice && discount > 0 ? (
            <Text>
              12% Discount (Internal Client): -PHP {formatMoney(discount)}
            </Text>
          ) : null}
          <Text style={{ fontWeight: "bold" }}>
            TOTAL: PHP {formatMoney(total)}
          </Text>
        </View>

        <View style={styles.footerSection} wrap={false}>
          <Text style={styles.italicNote}>Quote Validity: 30 days</Text>
          <Text style={styles.italicNote}>
            Total cost does not include re-runs (if applicable). Prices are
            subject to change without prior notice.
          </Text>
          <Text style={styles.italicNote}>
            *12% Discount is applicable only to the following: UP Constituents,
            Students, and Active PGC Visayas Consortium Members.
          </Text>

          <View style={styles.signature}>
            <Text>Sincerely,</Text>
            {(() => {
              const signatureSrc = getSignatureAssetByName(preparedBy.name);

              return (
                <View>
                  {signatureSrc ? (
                    <Image
                      src={signatureSrc}
                      style={{
                        width: 100,
                        height: 40,
                        marginTop: 5,
                        marginBottom: -15,
                      }}
                    />
                  ) : null}
                  <Text
                    style={{
                      fontWeight: "bold",
                      marginTop: signatureSrc ? 0 : 16,
                    }}
                  >
                    {preparedBy.name}
                  </Text>
                </View>
              );
            })()}
            <Text>
              <Text style={{ fontStyle: "italic" }}>{preparedBy.position}</Text>
            </Text>
          </View>
        </View>

        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
