"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { adminProjectSchema, AdminProjectData } from "@/schemas/adminProjectSchema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Pencil, Trash2, FileEdit, FileText, Banknote, Briefcase, Save } from "lucide-react";
import { Project } from "@/types/Project";
import { db, storage } from "@/lib/firebase";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { ref, listAll, deleteObject } from "firebase/storage";
import { toast } from "sonner";
import { deleteProjectRequest } from "@/services/projectRequestService";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { editProject } from "@/services/editProject";
import { logActivity } from "@/services/activityLogService";
import { getInquiries } from "@/services/inquiryService";
import { Inquiry } from "@/types/Inquiry";
import useAuth from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { getActiveCatalogItems } from "@/services/catalogSettingsService";
import { CatalogItem } from "@/types/CatalogSettings";
import { X, Search, ChevronDown, Plus } from "lucide-react";

interface EditProjectModalProps {
  project: Project;
  onSuccess?: () => void;
}

export function EditProjectModal({ project, onSuccess }: EditProjectModalProps) {
  const { adminInfo } = useAuth();
  const { canDelete } = usePermissions(adminInfo?.role);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serviceRequestedInput, setServiceRequestedInput] = useState(
    Array.isArray(project.serviceRequested)
      ? project.serviceRequested.join(", ")
      : project.serviceRequested || ""
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [personnelOptions, setPersonnelOptions] = useState<CatalogItem[]>([]);
  const [inquiryOptions, setInquiryOptions] = useState<Inquiry[]>([]);
  const [inquirySearch, setInquirySearch] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    getInquiries().then((inquiries) => {
      setInquiryOptions(inquiries);
    }).catch((error) => {
      console.error("Error fetching inquiries:", error);
    });

    getActiveCatalogItems("personnelAssigned").then((personnel) => {
      let options = personnel as CatalogItem[];
      // If current assigned personnel isn't in the active options, add it
      if (project.personnelAssigned && !options.some(opt => opt.value === project.personnelAssigned)) {
        options = [{
          id: "current-personnel",
          value: project.personnelAssigned,
          isActive: true,
          order: -1,
          position: "Currently Assigned"
        }, ...options];
      }
      setPersonnelOptions(options);
    }).catch((error) => {
      console.error("Error fetching personnel options:", error);
      setPersonnelOptions([]);
    });
  }, [project.personnelAssigned, project.pid]); // Added project.pid to trigger refresh when project changes

  const form = useForm<AdminProjectData>({
    resolver: zodResolver(adminProjectSchema),
    defaultValues: {
      pid: project.pid, // Ensure pid is present for validation
      year: project.year || new Date().getFullYear(),
      iid: Array.isArray(project.iid) ? project.iid : (project.iid ? [project.iid] : []),
      startDate: project.startDate ? new Date(project.startDate) : undefined,
      lead: project.lead || "",
      title: project.title || "",
      projectTag: project.projectTag || "",
      status: project.status || "Ongoing",
      sendingInstitution: project.sendingInstitution || "Government",
      fundingCategory: project.fundingCategory || "In-House",
      fundingInstitution: project.fundingInstitution || "",
      serviceRequested: Array.isArray(project.serviceRequested)
        ? project.serviceRequested.filter((s): s is "Laboratory Services" | "Retail Sales" | "Equipment Use" | "Bioinformatics Analysis" | "Training" =>
          ["Laboratory Services", "Retail Sales", "Equipment Use", "Bioinformatics Analysis", "Training"].includes(s))
        : [],
      notes: project.notes || "",
      personnelAssigned: project.personnelAssigned || "",
    },
  });

  // Reset form once when modal is opened
  useEffect(() => {
    if (isOpen) {
      const resetData = {
        pid: project.pid,
        year: project.year || new Date().getFullYear(),
        iid: Array.isArray(project.iid) ? project.iid : (project.iid ? [project.iid] : []),
        startDate: project.startDate ? new Date(project.startDate) : undefined,
        lead: project.lead || "",
        title: project.title || "",
        projectTag: project.projectTag || "",
        status: project.status || "Ongoing",
        sendingInstitution: project.sendingInstitution || "Government",
        fundingCategory: project.fundingCategory || "In-House",
        fundingInstitution: project.fundingInstitution || "",
        serviceRequested: Array.isArray(project.serviceRequested)
          ? project.serviceRequested.filter((s): s is "Laboratory Services" | "Retail Sales" | "Equipment Use" | "Bioinformatics Analysis" | "Training" =>
            ["Laboratory Services", "Retail Sales", "Equipment Use", "Bioinformatics Analysis", "Training"].includes(s))
          : [],
        notes: project.notes || "",
        personnelAssigned: project.personnelAssigned || "",
      };
      
      form.reset(resetData);
      
      // Update serviceRequestedInput as well
      setServiceRequestedInput(
        Array.isArray(project.serviceRequested)
          ? project.serviceRequested.join(", ")
          : project.serviceRequested || ""
      );
    }
  }, [isOpen, project.pid]); // Only reset when modal opens or project changes

  useEffect(() => {
    const val = form.getValues("serviceRequested");
    if (Array.isArray(val)) {
      setServiceRequestedInput(val.join(", "));
    } else if (typeof val === "string") {
      setServiceRequestedInput(val);
    } else {
      setServiceRequestedInput("");
    }
  }, [isOpen, project.pid]); // Added project.pid to update when project changes

  const onSubmit = async (data: AdminProjectData) => {
    setIsLoading(true);
    // Ensure pid is present
    const pid = data.pid || project.pid;
    if (!pid) {
      toast.error("Project ID (pid) is missing. Cannot update project.");
      setIsLoading(false);
      return;
    }
    // Ensure serviceRequested is always an array
    let serviceRequested = data.serviceRequested;
    if (typeof serviceRequested === "string") {
      const validOptions = [
        "Laboratory Services",
        "Retail Sales",
        "Equipment Use",
        "Bioinformatics Analysis",
        "Training",
      ] as const;
      serviceRequested = (serviceRequested as string)
        .split(",")
        .map((s: string) => s.trim())
        .filter((s): s is typeof validOptions[number] => validOptions.includes(s as typeof validOptions[number]));
    } else if (!Array.isArray(serviceRequested)) {
      serviceRequested = [];
    }
    const updatedData = { 
      ...data, 
      pid, 
      serviceRequested,
      // Ensure startDate is properly formatted for storage (as string YYYY-MM-DD if needed, or Date)
      // Based on types/Project.ts, startDate is a string.
      startDate: data.startDate instanceof Date 
        ? data.startDate.toLocaleDateString('en-CA') // Format as YYYY-MM-DD
        : data.startDate
    };

    try {
      // Get old project data for logging
      const projectRef = doc(db, "projects", pid);
      const projectDoc = await getDoc(projectRef);
      const oldData = projectDoc.data();

      // Type cast to any or a more permissive type to allow the string startDate for Firestore
      // while the internal schema uses Date for the calendar component.
      await editProject(updatedData as any);

      // Log the activity
      const changedFields = Object.keys(updatedData).filter(
        (key) => {
          const oldVal = oldData?.[key];
          const newVal = updatedData[key as keyof typeof updatedData];
          // Handle array comparison
          if (Array.isArray(oldVal) && Array.isArray(newVal)) {
            return JSON.stringify(oldVal) !== JSON.stringify(newVal);
          }
          return oldVal !== newVal;
        }
      );
      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "UPDATE",
        entityType: "project",
        entityId: pid,
        entityName: data.title || pid,
        description: `Updated project: ${data.title || pid}`,
        changesBefore: oldData,
        changesAfter: { ...oldData, ...updatedData },
        changedFields,
      });

      toast.success("Project updated successfully!");
      setIsOpen(false);
      // Call onSuccess after modal is closed
      setTimeout(() => {
        onSuccess?.();
      }, 200);
    } catch (error) {
      console.error("Error updating project:", error);
      toast.error("Failed to update project. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!project.pid) return;
    try {
      // Get project data before deletion for logging
      const projectRef = doc(db, "projects", project.pid);
      const projectDoc = await getDoc(projectRef);
      const projectData = projectDoc.data();

      // Delete associated Storage folders
      for (const basePath of [`serviceReports/${project.pid}`, `client-form-submissions/${project.pid}`]) {
        try {
          const folderRef = ref(storage, basePath);
          const listRes = await listAll(folderRef);
          await Promise.all(listRes.items.map((item) => deleteObject(item)));
        } catch (storageErr) {
          console.warn(`Could not delete storage folder ${basePath}:`, storageErr);
        }
      }

      await deleteDoc(projectRef);

      // Delete corresponding projectRequests document(s) for each linked inquiry ID
      const iid = project.iid;
      const iids: string[] = Array.isArray(iid) ? iid : iid ? [iid] : [];
      await Promise.allSettled(iids.map((id) => deleteProjectRequest(id)));

      // Log the activity
      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "DELETE",
        entityType: "project",
        entityId: project.pid,
        entityName: project.title || project.pid,
        description: `Deleted project: ${project.title || project.pid}`,
        changesBefore: projectData,
      });

      toast.success("Project deleted successfully!");
      setShowDeleteConfirm(false);
      setIsOpen(false);
      // Call onSuccess after modal is closed
      setTimeout(() => {
        onSuccess?.();
      }, 200);
    } catch (error) {
      console.error("Error deleting project:", error);
      toast.error("Failed to delete project. Please try again.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <FileEdit className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl">Edit Project</DialogTitle>
              <DialogDescription className="text-sm mt-1">
                Update project information and track changes
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs px-3 py-1">
              ID: {project.pid}
            </Badge>
          </div>
        </DialogHeader>

        <Separator className="my-1" />
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, (errors) => {
              console.error("Form validation errors:", errors);
              toast.error("Please fix the errors in the form.");
            })}
            className="space-y-3"
          >
            {/* Basic Information Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-md">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Basic Information</h3>
              </div>
              <Separator />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Year</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Enter year"
                        className="h-9"
                        {...field}
                        onChange={e => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => {
                  const currentValue = field.value;
                  const displayDate = currentValue instanceof Date ? currentValue : 
                                     currentValue ? new Date(currentValue) : undefined;
                  
                  return (
                    <FormItem>
                      <FormLabel className="text-xs">Start Date</FormLabel>
                      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className={`w-full justify-start text-left font-normal h-9 ${!displayDate ? "text-muted-foreground" : ""}`}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {displayDate ?
                              displayDate.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
                              : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[110]" align="start">
                          <div onClick={(e) => e.stopPropagation()}>
                            <Calendar
                              mode="single"
                              selected={displayDate}
                              onSelect={(date) => {
                                console.log('Date selected:', date);
                                field.onChange(date || undefined);
                                setPopoverOpen(false);
                              }}
                              initialFocus
                            />
                          </div>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Project Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter project title" className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Inquiry Numbers (Multi-Select) */}
            <FormField
              control={form.control}
              name="iid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs flex items-center gap-1.5">
                    Inquiry ID(s)
                    <Badge variant="outline" className="text-[10px] font-normal py-0 px-1.5 h-auto">
                      Multi
                    </Badge>
                  </FormLabel>
                  <div className="space-y-2 border rounded-md p-2 bg-gray-50/50">
                    <div className="flex flex-wrap gap-1.5 min-h-6">
                      {(() => {
                        const current = Array.isArray(field.value) ? field.value : (field.value ? [field.value] : []);
                        if (current.length === 0) return (
                          <span className="text-xs text-gray-400 italic py-1">No inquiry IDs assigned</span>
                        );
                        return current.map((id, index) => (
                          <Badge key={index} variant="secondary" className="pl-2 pr-1 py-0.5 flex items-center gap-1 bg-white border shadow-sm transition-all hover:border-red-200">
                            <span className="text-[11px] font-medium text-gray-700">{id}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const newVal = [...current];
                                newVal.splice(index, 1);
                                field.onChange(newVal);
                              }}
                              className="text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ));
                      })()}
                    </div>
                    
                    <Select onValueChange={(val) => {
                      const current = Array.isArray(field.value) ? field.value : (field.value ? [field.value] : []);
                      if (!current.includes(val)) {
                        field.onChange([...current, val]);
                      }
                    }}>
                      <FormControl>
                        <SelectTrigger className="w-full h-8 bg-white text-xs">
                          <div className="flex items-center gap-2">
                            <Plus className="h-3.5 w-3.5 text-blue-500" />
                            <span>Add inquiry ID...</span>
                          </div>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[250px] w-[350px]">
                        <div className="px-2 py-1 sticky top-0 bg-white border-b z-10 flex items-center gap-2 mb-1">
                           <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                           <Input 
                             placeholder="Search inquiry ID or name..." 
                             className="h-7 text-xs border-none focus-visible:ring-0 shadow-none px-0" 
                             value={inquirySearch}
                             onChange={(e) => setInquirySearch(e.target.value)}
                           />
                        </div>
                        {inquiryOptions
                          .filter(inq => {
                             const current = Array.isArray(field.value) ? field.value : (field.value ? [field.value] : []);
                             return !current.includes(inq.id || "") && (
                               inq.id?.toLowerCase().includes(inquirySearch.toLowerCase()) || 
                               inq.name?.toLowerCase().includes(inquirySearch.toLowerCase()) ||
                               inq.affiliation?.toLowerCase().includes(inquirySearch.toLowerCase())
                             );
                          })
                          .length > 0 ? (
                          inquiryOptions
                            .filter(inq => {
                               const current = Array.isArray(field.value) ? field.value : (field.value ? [field.value] : []);
                               return !current.includes(inq.id || "") && (
                                 inq.id?.toLowerCase().includes(inquirySearch.toLowerCase()) || 
                                 inq.name?.toLowerCase().includes(inquirySearch.toLowerCase()) ||
                                 inq.affiliation?.toLowerCase().includes(inquirySearch.toLowerCase())
                               );
                            })
                            .map((inquiry) => (
                              <SelectItem key={inquiry.id} value={inquiry.id || ""} className="py-2.5">
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-xs text-blue-700">{inquiry.id}</span>
                                    <span className="text-[10px] text-gray-400 font-normal">|</span>
                                    <span className="text-[11px] font-medium text-gray-700 truncate w-48">{inquiry.name}</span>
                                  </div>
                                  {inquiry.affiliation && (
                                    <span className="text-[10px] text-gray-500 truncate">{inquiry.affiliation}</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))
                        ) : (
                          <div className="py-4 text-center text-xs text-gray-500">
                            {inquirySearch ? "No matching inquiries found" : "All available inquiries assigned"}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="lead"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Project Lead</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter project lead" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="projectTag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Project Tag</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter project tag" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full h-9">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Ongoing">Ongoing</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Funding Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-50 rounded-md">
                  <Banknote className="h-4 w-4 text-emerald-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Funding & Institution</h3>
              </div>
              <Separator />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="sendingInstitution"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Sending Institution</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full h-9">
                          <SelectValue placeholder="Select institution" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="UP System">UP System</SelectItem>
                        <SelectItem value="SUC/HEI">SUC/HEI</SelectItem>
                        <SelectItem value="Government">Government</SelectItem>
                        <SelectItem value="Private/Local">Private/Local</SelectItem>
                        <SelectItem value="International">International</SelectItem>
                        <SelectItem value="N/A">N/A</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fundingCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Funding Category</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full h-9">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="External">External</SelectItem>
                        <SelectItem value="In-House">In-House</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="fundingInstitution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Funding Institution</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter funding institution" className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Services Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-50 rounded-md">
                  <Briefcase className="h-4 w-4 text-purple-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Services & Personnel</h3>
              </div>
              <Separator />
            </div>
            <FormField
              control={form.control}
              name="serviceRequested"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Service Requested</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {(["Laboratory Services", "Retail Sales", "Equipment Use", "Bioinformatics Analysis", "Training"] as const).map(option => (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={field.value?.includes(option) || false}
                            onChange={() => {
                              const current = field.value as typeof option[] || [];
                              if (current.includes(option)) {
                                field.onChange(current.filter((s) => s !== option));
                              } else {
                                field.onChange([...current, option]);
                              }
                            }}
                            className="h-4 w-4"
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="personnelAssigned"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Personnel Assigned</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full h-9 text-left">
                        <SelectValue placeholder={personnelOptions.length > 0 ? "Select personnel" : "No personnel available"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {personnelOptions.length > 0 ? (
                        personnelOptions.map((person) => (
                          <SelectItem key={person.id} value={person.value} className="py-2">
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{person.value}</span>
                              {person.position && (
                                <span className="text-xs text-gray-500">{person.position}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-center text-gray-500">
                          No personnel configured.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Notes</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter notes" className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator className="my-4" />

            <div className="flex justify-between items-center pt-2">
              {canDelete("projects") && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isLoading}
                  className="min-w-[100px] hover:bg-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
              <div className={`flex gap-3 ${!canDelete("projects") ? "w-full justify-end" : ""}`}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  disabled={isLoading}
                  className="min-w-[100px]"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || form.formState.isSubmitting}
                  className="min-w-[120px] bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-md"
                >
                  {(isLoading || form.formState.isSubmitting) ? (
                    <>
                      <span className="mr-2">Saving...</span>
                      <span className="animate-spin">⏳</span>
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
              <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <DialogContent className="max-w-xs w-full">
                  <DialogHeader>
                    <DialogTitle>Delete Project</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete this project? This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={handleDelete}>
                      Delete
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
