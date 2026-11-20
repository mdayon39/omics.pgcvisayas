export type PortalFeatureKey =
  | "sampleForms"
  | "serviceReports"
  | "officialReceipts"
  | "requestProgressTimeline"
  | "clientMenuSettings"
  | "clientMenuChangePassword"
  | "clientMenuAbout"
  | "chatAutoReply"
  | "chatHeaderStatus"
  | "teamMemberSaveDraftButton";

export interface PortalFeatureVisibility {
  sampleForms: boolean;
  serviceReports: boolean;
  officialReceipts: boolean;
  requestProgressTimeline: boolean;
  clientMenuSettings: boolean;
  clientMenuChangePassword: boolean;
  clientMenuAbout: boolean;
  chatAutoReply: boolean;
  chatHeaderStatus: boolean;
  teamMemberSaveDraftButton: boolean;
}

export interface InquiryNotificationGroup {
  id: string;
  label: string;
  description?: string;
  serviceFilters: string[];
  recipients: string[];
  enabled?: boolean;
}

export interface ConfigurationSettings {
  portalFeatures: PortalFeatureVisibility;
  inquiryNotifications: InquiryNotificationGroup[];
  receiptNotifications?: string[];
  bioinformaticsWorkflowNotifications?: string[];
}
