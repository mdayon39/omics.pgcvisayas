import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ConfigurationSettings,
  InquiryNotificationGroup,
  PortalFeatureVisibility,
} from "@/types/ConfigurationSettings";

const CONFIG_DOC_ID = "appConfig";
const SETTINGS_COLLECTION = "settings";

export const DEFAULT_PORTAL_FEATURES: PortalFeatureVisibility = {
  sampleForms: true,
  serviceReports: true,
  officialReceipts: true,
  requestProgressTimeline: true,
  clientMenuSettings: true,
  clientMenuChangePassword: true,
  clientMenuAbout: true,
  chatAutoReply: true,
  chatHeaderStatus: true,
  teamMemberSaveDraftButton: true,
  hideQuotationRequestDetails: false,
  hidePersonalInformation: false,
};

export const DEFAULT_INQUIRY_NOTIFICATION_GROUPS: InquiryNotificationGroup[] = [
  {
    id: "general",
    label: "General Inquiries",
    description: "All inquiry submissions, regardless of service type.",
    serviceFilters: ["all"],
    recipients: [
      "sequencing.pgc.upvisayas@up.edu.ph",
      "mdayon1@up.edu.ph",
      "madayon1@up.edu.ph",
    ],
    enabled: true,
  },
  {
    id: "bioinformatics",
    label: "Bioinformatics Inquiries",
    description: "Only inquiries tagged as Bioinformatics.",
    serviceFilters: ["bioinformatics"],
    recipients: ["bioinfo.pgc.upvisayas@up.edu.ph"],
    enabled: true,
  },
  {
    id: "training",
    label: "Training Inquiries",
    description: "Only inquiries tagged as Training.",
    serviceFilters: ["training"],
    recipients: ["bioinfo.pgc.upvisayas@up.edu.ph"],
    enabled: true,
  },
];

export const DEFAULT_RECEIPT_NOTIFICATION_EMAILS: string[] = [
  "madayon1@up.edu.ph",
];

export const getDefaultConfigurationSettings = (): ConfigurationSettings => ({
  portalFeatures: { ...DEFAULT_PORTAL_FEATURES },
  inquiryNotifications: DEFAULT_INQUIRY_NOTIFICATION_GROUPS.map((group) => ({
    ...group,
    serviceFilters: [...group.serviceFilters],
    recipients: [...group.recipients],
  })),
  receiptNotifications: [...DEFAULT_RECEIPT_NOTIFICATION_EMAILS],
  bioinformaticsWorkflowNotifications: [],
});

export async function getConfigurationSettings(): Promise<ConfigurationSettings> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, CONFIG_DOC_ID);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      const defaults = getDefaultConfigurationSettings();
      await setDoc(docRef, {
        ...defaults,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return defaults;
    }

    const data = snap.data() as Partial<ConfigurationSettings>;
    const defaults = getDefaultConfigurationSettings();

    return {
      portalFeatures: {
        ...defaults.portalFeatures,
        ...(data.portalFeatures || {}),
      },
      inquiryNotifications:
        data.inquiryNotifications && data.inquiryNotifications.length > 0
          ? data.inquiryNotifications
          : defaults.inquiryNotifications,
      receiptNotifications: Array.isArray(data.receiptNotifications)
        ? data.receiptNotifications
        : defaults.receiptNotifications,
      bioinformaticsWorkflowNotifications: Array.isArray(
        data.bioinformaticsWorkflowNotifications,
      )
        ? data.bioinformaticsWorkflowNotifications
        : [],
    };
  } catch (error) {
    console.error("Error fetching configuration settings:", error);
    return getDefaultConfigurationSettings();
  }
}

export async function updateConfigurationSettings(
  updates: Partial<ConfigurationSettings>,
): Promise<void> {
  const docRef = doc(db, SETTINGS_COLLECTION, CONFIG_DOC_ID);
  await setDoc(
    docRef,
    {
      ...updates,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function getInquiryNotificationRecipients(
  groups: InquiryNotificationGroup[],
  serviceType: string,
): string[] {
  const service = serviceType?.toLowerCase?.() ?? "";
  const recipients = groups
    .filter((group) => group.enabled !== false)
    .filter((group) =>
      group.serviceFilters.some((filter) => {
        const normalized = filter.toLowerCase();
        return normalized === "all" || normalized === service;
      }),
    )
    .flatMap((group) => group.recipients || []);

  const normalized = recipients
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}
