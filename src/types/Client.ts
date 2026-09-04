export interface Client {
  cid?: string;
  inquiryId?: string;
  name?: string;
  email?: string;
  affiliation?: string;
  designation?: string;
  sex?: "M" | "F" | "Other" | "";
  phoneNumber?: string;
  affiliationAddress?: string;
  pid?: string[];
  createdAt?: string | Date;
  uuid?: string | null;
  haveSubmitted?: boolean;
  isContactPerson?: boolean;
  year?: number;
  status?: "Approved" | "Cancelled";
}
