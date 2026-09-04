// Admin Client Modal Form
// Modal form for adding a new client in the admin panel, with project linking and validation.

"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { UserPlus, FolderOpen, User, Briefcase, Save } from "lucide-react";
import { Client } from "@/types/Client";
import { clientSchema as baseClientSchema } from "@/schemas/clientSchema";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import {
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
} from "firebase/firestore";
import { getNextCid, checkCidExists } from "@/services/clientService";
import { getProjects } from "@/services/projectsService";
import { getInquiries } from "@/services/inquiryService";
import { Inquiry } from "@/types/Inquiry";
import { DialogFooter } from "@/components/ui/dialog";
import { logActivity } from "@/services/activityLogService";
import useAuth from "@/hooks/useAuth";
import { resolveClientUuid } from "@/services/clientUuidService";

// Extended client schema for admin modal validation
const clientSchema = baseClientSchema
  .extend({
    affiliation: z.string().min(1, "Affiliation is required"),
    year: z.coerce.number().int().min(2000),
    name: z.string().min(1, "Name is required"),
    sex: z.enum(["F", "M", "Other"], { required_error: "Sex is required" }),
    phoneNumber: z
      .string()
      .min(1, "Mobile number is required")
      .refine(
        (val) => /^\d{11}$/.test(val) || val === "N/A",
        "Enter a valid 11-digit mobile number or 'N/A'",
      ),
    designation: z.string().min(1, "Designation is required"),
    email: z.string().email("Invalid email"),
    affiliationAddress: z.string().optional(),
  })
  .omit({ createdAt: true });

type ClientFormData = Omit<z.infer<typeof clientSchema>, "sex"> & {
  sex: "F" | "M" | "Other" | "";
};

// Modal form component for adding a client
export function ClientFormModal({
  onSubmit,
  onClose,
}: {
  onSubmit?: (data: Client) => void;
  onClose?: () => void;
}) {
  const { adminInfo } = useAuth();
  const cidInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState<ClientFormData>({
    year: new Date().getFullYear(),
    name: "",
    affiliation: "",
    affiliationAddress: "",
    designation: "",
    email: "",
    sex: "",
    phoneNumber: "",
  });

  const [cid, setCid] = useState<string>("");
  const [isCidChecking, setIsCidChecking] = useState(false);
  const [cidError, setCidError] = useState<string>("");

  const [errors, setErrors] = useState<
    Partial<Record<keyof ClientFormData, string>>
  >({});
  const [projectOptions, setProjectOptions] = useState<
    { pid: string; title?: string }[]
  >([]);
  const [selectedPid, setSelectedPid] = useState<string>("");
  const [projectSearch, setProjectSearch] = useState("");
  const [inquiryOptions, setInquiryOptions] = useState<Inquiry[]>([]);
  const [selectedInquiry, setSelectedInquiry] = useState<string>("");
  const [inquirySearch, setInquirySearch] = useState("");

  // Mutation for saving client to Firestore
  const mutation = useMutation({
    mutationFn: async (data: Client) => {
      if (!data.cid) throw new Error("Client ID is required");
      const docRef = doc(db, "clients", data.cid);
      const clientUuid = await resolveClientUuid(data.inquiryId, data.email);
      const clientData = {
        ...data,
        ...(clientUuid ? { uuid: clientUuid } : {}),
        createdAt: serverTimestamp(),
      };
      await setDoc(docRef, clientData);

      // Log the activity
      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "CREATE",
        entityType: "client",
        entityId: data.cid,
        entityName: data.name || data.cid,
        description: `Created client: ${data.name || data.cid}`,
        changesAfter: clientData,
      });

      return data;
    },
    onSuccess: (data) => {
      toast.success("Client added successfully!");
      setTimeout(() => {
        onSubmit?.(data);
        onClose?.();
      }, 200);
    },
    onError: (error) => {
      toast.error("Failed to add client.");
      console.error("Firestore insert failed:", error);
    },
  });

  // Auto-generate CID when year changes
  useEffect(() => {
    const generateCid = async () => {
      if (formData.year) {
        try {
          const nextCid = await getNextCid(formData.year);
          setCid(nextCid);
          setCidError("");
        } catch (err) {
          console.error("Failed to generate CID:", err);
        }
      }
    };
    generateCid();
  }, [formData.year]);

  // Fetch project and inquiry options for dropdowns
  useEffect(() => {
    getProjects().then((projects) => {
      setProjectOptions(projects.map((p) => ({ pid: p.pid!, title: p.title })));
    });
    getInquiries().then((inquiries) => {
      setInquiryOptions(inquiries);
    });
  }, []);

  // Handle inquiry selection - auto-populate form fields
  const handleInquirySelect = (inquiryId: string) => {
    setSelectedInquiry(inquiryId);
    const inquiry = inquiryOptions.find((inq) => inq.id === inquiryId);
    if (inquiry) {
      setFormData((prev) => ({
        ...prev,
        name: inquiry.name || "",
        email: inquiry.email || "",
        affiliation: inquiry.affiliation || "",
        designation: inquiry.designation || "",
      }));
    }
  };

  // Handle form submit: validate, save client, update project
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate CID
    if (!cid) {
      setCidError("Client ID is required");
      return;
    }

    // Check if CID already exists
    setIsCidChecking(true);
    const cidExists = await checkCidExists(cid);
    setIsCidChecking(false);

    if (cidExists) {
      setCidError(
        "This Client ID already exists. Please choose a different ID.",
      );
      // Scroll to the CID field and focus it
      cidInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      cidInputRef.current?.focus();
      return;
    }

    // Validate that Project ID is selected
    if (!selectedPid) {
      toast.error("Please select a Project ID");
      return;
    }

    // Validate sex is not empty
    if (!formData.sex) {
      setErrors({ ...errors, sex: "Sex is required" });
      return;
    }

    const result = clientSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ClientFormData, string>> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof ClientFormData;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
    } else {
      setErrors({});
      try {
        const clientData: Client = {
          ...result.data,
          cid: cid,
          inquiryId: result.data.inquiryId || undefined,
          year: result.data.year,
          pid: selectedPid ? [selectedPid] : [],
          // normalize fields that must be boolean | undefined on the Client type
          haveSubmitted:
            typeof (result.data as any).haveSubmitted === "boolean"
              ? (result.data as any).haveSubmitted
              : false,
          isContactPerson:
            typeof (result.data as any).isContactPerson === "boolean"
              ? (result.data as any).isContactPerson
              : false,
          status: "Approved",
        };
        await mutation.mutateAsync(clientData);
        // Update project clientNames array
        if (selectedPid && clientData.name) {
          const projectRef = doc(db, "projects", selectedPid);
          await updateDoc(projectRef, {
            clientNames: arrayUnion(clientData.name),
          });
        }
      } catch (err) {
        toast.error("Failed to generate client ID or update project.");
        console.error("CID generation or project update failed:", err);
      }
    }
  };

  // Handle form field changes
  const handleChange = (name: keyof ClientFormData, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Filter project options by search
  const filteredProjectOptions = projectOptions.filter(
    (proj) =>
      proj.pid.toLowerCase().includes(projectSearch.toLowerCase()) ||
      (proj.title?.toLowerCase().includes(projectSearch.toLowerCase()) ??
        false),
  );

  // Filter inquiry options by search
  const filteredInquiryOptions = inquiryOptions.filter(
    (inq) =>
      inq.name?.toLowerCase().includes(inquirySearch.toLowerCase()) ||
      inq.affiliation?.toLowerCase().includes(inquirySearch.toLowerCase()),
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Quick Fill Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-50 rounded-md">
            <UserPlus className="h-4 w-4 text-amber-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-700">
            Quick Fill from Inquiry
          </h3>
        </div>
        <Separator />
      </div>

      {/* Inquiry Dropdown */}
      <div>
        <Label className="text-xs">Select Inquiry (Optional)</Label>
        <Select value={selectedInquiry} onValueChange={handleInquirySelect}>
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Select inquiry to auto-fill">
              {selectedInquiry ? (
                <div
                  className="flex flex-col items-start"
                  title={
                    inquiryOptions.find((i) => i.id === selectedInquiry)
                      ?.affiliation
                  }
                >
                  <span className="font-medium text-sm">
                    {inquiryOptions.find((i) => i.id === selectedInquiry)?.name}
                  </span>
                  {inquiryOptions.find((i) => i.id === selectedInquiry)
                    ?.affiliation && (
                    <span className="text-xs text-gray-500 truncate max-w-[250px]">
                      {
                        inquiryOptions.find((i) => i.id === selectedInquiry)
                          ?.affiliation
                      }
                    </span>
                  )}
                </div>
              ) : (
                "Select inquiry to auto-fill"
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[300px] w-[400px]">
            <div className="sticky top-0 bg-white z-10 p-2 border-b">
              <Input
                placeholder="Search by Name or Affiliation..."
                value={inquirySearch}
                onChange={(e) => setInquirySearch(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              {filteredInquiryOptions.length > 0 ? (
                filteredInquiryOptions.map((inq) => (
                  <SelectItem
                    key={inq.id}
                    value={inq.id || ""}
                    className="text-sm"
                  >
                    <div className="flex flex-col py-1">
                      <span className="font-medium text-gray-900">
                        {inq.name}
                      </span>
                      {inq.affiliation && (
                        <span
                          className="text-xs text-gray-500 truncate max-w-[350px]"
                          title={inq.affiliation}
                        >
                          {inq.affiliation}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))
              ) : (
                <div className="p-3 text-sm text-center text-gray-500">
                  No inquiries found
                </div>
              )}
            </div>
          </SelectContent>
        </Select>
      </div>

      {/* Client ID - Editable */}
      <div>
        <Label className="text-xs">Client ID</Label>
        <Input
          ref={cidInputRef}
          name="cid"
          value={cid}
          onChange={(e) => {
            setCid(e.target.value);
            setCidError("");
          }}
          className="h-9 font-mono bg-green-50"
          placeholder="CL-2026-001"
        />
        {cidError && <p className="text-red-500 text-xs mt-1">{cidError}</p>}
        <p className="text-xs text-gray-500 mt-1">
          Auto-generated, but can be edited
        </p>
      </div>

      {/* Project Information Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 rounded-md">
            <FolderOpen className="h-4 w-4 text-blue-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-700">
            Project Information
          </h3>
        </div>
        <Separator />
      </div>

      {/* Project ID Dropdown with search */}
      <div>
        <Label className="text-xs">
          Project ID <span className="text-red-500">*</span>
        </Label>
        <Select value={selectedPid} onValueChange={setSelectedPid}>
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Select or search project">
              {selectedPid ? (
                <div
                  className="flex flex-col items-start"
                  title={
                    projectOptions.find((p) => p.pid === selectedPid)?.title
                  }
                >
                  <span className="font-medium text-sm">{selectedPid}</span>
                  {projectOptions.find((p) => p.pid === selectedPid)?.title && (
                    <span className="text-xs text-gray-500 truncate max-w-[250px]">
                      {projectOptions.find((p) => p.pid === selectedPid)?.title}
                    </span>
                  )}
                </div>
              ) : (
                "Select or search project"
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[300px] w-[400px]">
            <div className="sticky top-0 bg-white z-10 p-2 border-b">
              <Input
                placeholder="Search by Project ID or Title..."
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              {filteredProjectOptions.length > 0 ? (
                filteredProjectOptions.map((proj) => (
                  <SelectItem
                    key={proj.pid}
                    value={proj.pid}
                    className="text-sm"
                  >
                    <div className="flex flex-col py-1">
                      <span className="font-medium text-gray-900">
                        {proj.pid}
                      </span>
                      {proj.title && (
                        <span
                          className="text-xs text-gray-500 truncate max-w-[350px]"
                          title={proj.title}
                        >
                          {proj.title}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))
              ) : (
                <div className="p-3 text-sm text-center text-gray-500">
                  No projects found
                </div>
              )}
            </div>
          </SelectContent>
        </Select>
      </div>

      {/* Personal Information Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-50 rounded-md">
            <User className="h-4 w-4 text-green-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-700">
            Personal Information
          </h3>
        </div>
        <Separator />
      </div>

      {/* Name Field */}
      <div>
        <Label className="text-xs">
          Full Name <span className="text-red-500">*</span>
        </Label>
        <Input
          value={formData.name}
          onChange={(e) => handleChange("name", e.target.value)}
          placeholder="Enter full name"
          className="h-9"
        />
        {errors.name && (
          <p className="text-red-500 text-xs mt-1">{errors.name}</p>
        )}
      </div>

      {/* Email Field */}
      <div>
        <Label className="text-xs">Email Address</Label>
        <Input
          type="email"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          placeholder="Enter email address"
          className="h-9"
        />
        {errors.email && (
          <p className="text-red-500 text-xs mt-1">{errors.email}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Sex Field */}
        <div>
          <Label className="text-xs">
            Sex <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.sex}
            onValueChange={(val) =>
              handleChange("sex", val as ClientFormData["sex"])
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="F">Female</SelectItem>
              <SelectItem value="M">Male</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
          {errors.sex && (
            <p className="text-red-500 text-xs mt-1">{errors.sex}</p>
          )}
        </div>

        {/* Mobile Number Field */}
        <div>
          <Label className="text-xs">
            Mobile Number <span className="text-red-500">*</span>
          </Label>
          <Input
            value={formData.phoneNumber}
            onChange={(e) => handleChange("phoneNumber", e.target.value)}
            placeholder="09191234567 or N/A"
            className="h-9"
          />
          {errors.phoneNumber && (
            <p className="text-red-500 text-xs mt-1">{errors.phoneNumber}</p>
          )}
        </div>
      </div>

      {/* Professional Information Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-50 rounded-md">
            <Briefcase className="h-4 w-4 text-purple-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-700">
            Professional Information
          </h3>
        </div>
        <Separator />
      </div>

      {/* Affiliation Field */}
      <div>
        <Label className="text-xs">
          Affiliation (Department & Institution){" "}
          <span className="text-red-500">*</span>
        </Label>
        <Input
          value={formData.affiliation}
          onChange={(e) => handleChange("affiliation", e.target.value)}
          placeholder="e.g. Division of Biological Sciences - UPV CAS"
          className="h-9"
        />
        {errors.affiliation && (
          <p className="text-red-500 text-xs mt-1">{errors.affiliation}</p>
        )}
      </div>

      {/* Affiliation Address Field */}
      <div>
        <Label className="text-xs">Affiliation Address</Label>
        <Input
          value={formData.affiliationAddress || ""}
          onChange={(e) => handleChange("affiliationAddress", e.target.value)}
          placeholder="Enter complete address"
          className="h-9"
        />
        {errors.affiliationAddress && (
          <p className="text-red-500 text-xs mt-1">
            {errors.affiliationAddress}
          </p>
        )}
      </div>

      {/* Designation Field */}
      <div>
        <Label className="text-xs">
          Designation <span className="text-red-500">*</span>
        </Label>
        <Input
          value={formData.designation}
          onChange={(e) => handleChange("designation", e.target.value)}
          placeholder="Enter job title or position"
          className="h-9"
        />
        {errors.designation && (
          <p className="text-red-500 text-xs mt-1">{errors.designation}</p>
        )}
      </div>

      {/* Save Button */}
      <DialogFooter className="pt-3 mt-3">
        <Separator className="mb-4" />
        <div className="flex gap-3 justify-end w-full">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={mutation.isPending}
            className="min-w-[100px]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="min-w-[120px] bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-md"
          >
            {mutation.isPending ? (
              <>
                <span className="mr-2">Saving...</span>
                <span className="animate-spin">⏳</span>
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Client
              </>
            )}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
