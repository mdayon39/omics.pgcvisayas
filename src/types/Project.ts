export interface Project {
  pid?: string;
  iid?: string | string[];
  uuid?: string | null;
  year?: number;
  startDate?: string;
  createdAt?: Date;
  lead?: string;
  clientNames?: string[];
  title?: string;
  projectTag?: string;
  status?: "Pending" | "Ongoing" | "Cancelled" | "Completed";
  sendingInstitution?:
    | "UP System"
    | "SUC/HEI"
    | "Government"
    | "Private/Local"
    | "International"
    | "N/A";
  fundingCategory?: "External" | "In-House";
  fundingInstitution?: string;
  serviceRequested?: string[];
  personnelAssigned?: string;
  notes?: string;
  allowServiceReportWithoutQuotation?: boolean;
  allowServiceReportWithoutChargeSlip?: boolean;
  serviceReportDocumentationRemark?: string;
  serviceReportToggleEnabledBy?: string | null;
  serviceReportToggleEnabledByEmail?: string | null;
  serviceReportUploaderName?: string | null;
  serviceReportUploaderEmail?: string | null;
}
