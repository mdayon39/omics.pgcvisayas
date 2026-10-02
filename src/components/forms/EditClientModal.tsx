"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { adminClientSchema, AdminClientData } from "@/schemas/adminClientSchema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trash2, Pencil, UserCog, User, Mail, Phone, Building2, Briefcase, FolderOpen, Save, Plus, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Client } from "@/types/Client";
import { Project } from "@/types/Project";
import { getProjects } from "@/services/projectsService";
import { updateClientAndProjectName } from "@/services/updateClientAndProjectName";
import { toast } from "sonner";
import { collection, deleteDoc, doc, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logActivity } from "@/services/activityLogService";
import useAuth from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

interface EditClientModalProps {
  client: Client;
  onSuccess?: () => void;
}

export function EditClientModal({ client, onSuccess }: EditClientModalProps) {
  const { adminInfo } = useAuth();
  const { canDelete } = usePermissions(adminInfo?.role);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "projects">("info");
  
  // Project dropdown state
  const [projectOptions, setProjectOptions] = useState<Project[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  
  // Projects state (pid is now an array)
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedNewProject, setSelectedNewProject] = useState<string>("");
  const [loadingProjects, setLoadingProjects] = useState(false);

  const form = useForm<AdminClientData & { pid?: string }>({
    resolver: zodResolver(adminClientSchema),
    defaultValues: {
      name: client.name || "",
      email: client.email || "",
      affiliation: client.affiliation || "",
      affiliationAddress: client.affiliationAddress || "",
      designation: client.designation || "",
      sex: client.sex || "M",
      phoneNumber: client.phoneNumber || "",
      pid: client.pid?.[0] || "",
    },
  });

  // Fetch project options and load client's projects
  useEffect(() => {
    getProjects().then((projects) => {
      setProjectOptions(projects);
    });
    
    // Load projects from client's pid array (pid is now an array)
    if (isOpen) {
      const clientProjects = Array.isArray(client.pid) ? client.pid : (client.pid ? [client.pid] : []);
      setProjects(clientProjects);
      // Update form to show primary project (first in array)
      form.setValue("pid", clientProjects[0] || "");
      setLoadingProjects(false);
    }
  }, [isOpen, client.pid]);

  // Filter project options by search
  const filteredProjectOptions = projectOptions.filter(
    (proj) =>
      proj.pid?.toLowerCase().includes(projectSearch.toLowerCase()) ||
      proj.title?.toLowerCase().includes(projectSearch.toLowerCase()) ||
      proj.lead?.toLowerCase().includes(projectSearch.toLowerCase())
  );
  const availableProjectOptions = filteredProjectOptions.filter(
    (project) => !projects.includes(project.pid || "")
  );

  const onSubmit = async (data: AdminClientData) => {
    setIsLoading(true);
    try {
      // Get old client data for logging
      const clientRef = doc(db, "clients", client.cid!);
      const clientDoc = await getDoc(clientRef);
      const oldData = clientDoc.data();
      
      // Check if pid array changed (compare primary project)
      const oldPrimaryPid = Array.isArray(client.pid) ? client.pid[0] : client.pid;
      const newPrimaryPid = projects[0];
      const pidChanged = oldPrimaryPid !== newPrimaryPid;
      
      // Include pid as array in the update data
      const updateData = {
        name: data.name,
        email: data.email,
        affiliation: data.affiliation,
        affiliationAddress: data.affiliationAddress,
        designation: data.designation,
        sex: data.sex,
        phoneNumber: data.phoneNumber,
        pid: projects,
      };
      
      // Update client and handle project name synchronization
      await updateClientAndProjectName(
        client.cid!, 
        updateData, 
        client.name, 
        pidChanged ? oldPrimaryPid : undefined
      );
      
      // Log the activity
      const changedFields = Object.keys(updateData).filter(
        (key) => (oldData?.[key] ?? null) !== (updateData[key as keyof typeof updateData] ?? null)
      );
      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "UPDATE",
        entityType: "client",
        entityId: client.cid!,
        entityName: data.name || client.cid!,
        description: `Updated client: ${data.name || client.cid!}`,
        changesBefore: oldData,
        changesAfter: { ...oldData, ...updateData },
        changedFields,
      });
      
      toast.success("Client updated successfully!");
      setIsOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error("Failed to update client. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddProject = async () => {
    if (!selectedNewProject) return;
    
    // Check if project already exists
    if (projects.includes(selectedNewProject)) {
      toast.error("Project already linked to this client");
      return;
    }
    
    setProjects(prev => [...prev, selectedNewProject]);
    setSelectedNewProject("");
    toast.success("Project added! Click Save to apply changes.");
  };

  const handleRemoveProject = (projectId: string) => {
    const currentPid = form.watch("pid");
    
    // If removing the primary project, update form to next project or empty
    if (projectId === currentPid) {
      const remainingProjects = projects.filter(p => p !== projectId);
      form.setValue("pid", remainingProjects[0] || "");
    }
    
    // Remove from projects array
    setProjects(prev => prev.filter(p => p !== projectId));
    toast.success("Project removed! Click Save to apply changes.");
  };

  const handleSetPrimaryProject = (projectId: string) => {
    // Move selected project to first position
    const newProjects = [projectId, ...projects.filter(p => p !== projectId)];
    setProjects(newProjects);
    // Update form to show new primary project
    form.setValue("pid", projectId);
    toast.success("Primary project updated! Click Save to apply changes.");
  };

  const handleDelete = async () => {
    if (!client.cid) return;
    try {
      // Get client data before deletion for logging
      const clientRef = doc(db, "clients", client.cid);
      const clientDoc = await getDoc(clientRef);
      const clientData = clientDoc.data();

      const clientName = (client.name || "").trim();

      // Remove the client name from all matching projects before deleting the client document.
      if (clientName) {
        const projectsRef = collection(db, "projects");
        const projectsQuery = query(projectsRef, where("clientNames", "array-contains", clientName));
        const projectsSnapshot = await getDocs(projectsQuery);

        if (!projectsSnapshot.empty) {
          const batch = writeBatch(db);

          for (const projectDoc of projectsSnapshot.docs) {
            const projectData = projectDoc.data();
            const existingNames = Array.isArray(projectData.clientNames) ? projectData.clientNames : [];
            const updatedNames = existingNames.filter((name: string) => name !== clientName);

            if (updatedNames.length !== existingNames.length) {
              batch.update(projectDoc.ref, { clientNames: updatedNames });
            }
          }

          await batch.commit();
        }
      }

      const clientEmail = client.email?.trim();

      if (clientEmail) {
        const maxBatchOps = 450;
        let cleanupBatch = writeBatch(db);
        let cleanupBatchOps = 0;

        const queueCleanupOperation = async (operation: () => void) => {
          operation();
          cleanupBatchOps += 1;

          if (cleanupBatchOps >= maxBatchOps) {
            await cleanupBatch.commit();
            cleanupBatch = writeBatch(db);
            cleanupBatchOps = 0;
          }
        };

        // Delete client portal request records for the client email.
        const clientRequestsRef = collection(db, "clientRequests");
        const clientRequestsQuery = query(clientRequestsRef, where("email", "==", clientEmail));
        const clientRequestsSnapshot = await getDocs(clientRequestsQuery);

        for (const clientRequestDoc of clientRequestsSnapshot.docs) {
          await queueCleanupOperation(() => {
            cleanupBatch.delete(clientRequestDoc.ref);
          });
        }

        // Remove matching members from portal approval drafts; delete drafts that become empty.
        type MemberApprovalMember = {
          formData?: {
            email?: string;
          };
        };

        const memberApprovalsRef = collection(db, "memberApprovals");
        const memberApprovalsSnapshot = await getDocs(memberApprovalsRef);

        for (const memberApprovalDoc of memberApprovalsSnapshot.docs) {
          const memberApprovalData = memberApprovalDoc.data();
          const existingMembers = Array.isArray(memberApprovalData.members)
            ? (memberApprovalData.members as MemberApprovalMember[])
            : [];

          const filteredMembers = existingMembers.filter(
            (member) => member?.formData?.email !== clientEmail
          );

          if (filteredMembers.length !== existingMembers.length) {
            await queueCleanupOperation(() => {
              if (filteredMembers.length === 0) {
                cleanupBatch.delete(memberApprovalDoc.ref);
              } else {
                cleanupBatch.update(memberApprovalDoc.ref, { members: filteredMembers });
              }
            });
          }
        }

        if (cleanupBatchOps > 0) {
          await cleanupBatch.commit();
        }
      }
      
      await deleteDoc(clientRef);
      
      // Log the activity
      await logActivity({
        userId: adminInfo?.email || "system",
        userEmail: adminInfo?.email || "system@pgc.admin",
        userName: adminInfo?.name || "System",
        action: "DELETE",
        entityType: "client",
        entityId: client.cid,
        entityName: client.name || client.cid,
        description: `Deleted client: ${client.name || client.cid}`,
        changesBefore: clientData,
      });
      
      toast.success("Client deleted successfully!");
      setShowDeleteConfirm(false);
      setIsOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("Failed to delete client and clean up project references. Please try again.");
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
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <UserCog className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <DialogTitle className="text-2xl">Edit Client</DialogTitle>
              <DialogDescription className="text-sm mt-1">
                Update client information and manage associations
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs px-3 py-1">
              ID: {client.cid}
            </Badge>
          </div>
        </DialogHeader>

        <Separator className="my-1" />
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "info" | "projects")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="info">Client Info</TabsTrigger>
            <TabsTrigger value="projects">
              Projects ({projects.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="info" className="space-y-3 mt-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {/* Personal Information Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-md">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Personal Information</h3>
              </div>
              <Separator />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter full name" className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Email Address</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="Enter email address" className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="sex"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Sex</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select sex" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="M">Male</SelectItem>
                        <SelectItem value="F">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Mobile Number</FormLabel>
                    <FormControl>
                      <Input placeholder="09191234567 or N/A" className="h-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Professional Information Section */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-50 rounded-md">
                  <Briefcase className="h-4 w-4 text-purple-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Professional Information</h3>
              </div>
              <Separator />
            </div>

            <FormField
              control={form.control}
              name="pid"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Primary Project ID</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input 
                        value={field.value || "(No primary project)"} 
                        readOnly 
                        className="h-9 bg-gray-50 cursor-default" 
                        title="Manage projects in the Projects tab"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                        View Projects tab
                      </div>
                    </div>
                  </FormControl>
                  {field.value && projectOptions.find(p => p.pid === field.value)?.title && (
                    <p className="text-xs text-gray-500 mt-1">
                      {projectOptions.find(p => p.pid === field.value)?.title}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="affiliation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Affiliation (Department & Institution)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Division of Biological Sciences - UPV CAS" className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="affiliationAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Affiliation Address</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter complete address" className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="designation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Designation</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter job title or position" className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
           
            <Separator className="my-4" />
            
            <div className="flex justify-between items-center pt-2">
              {canDelete("clients") && (
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
              <div className={`flex gap-3 ${!canDelete("clients") ? "w-full justify-end" : ""}`}>
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
                  disabled={isLoading} 
                  className="min-w-[120px] bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-md"
                >
                  {isLoading ? (
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
                    <DialogTitle>Delete Client</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete this client? This action cannot be undone.
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
          </TabsContent>
          
          <TabsContent value="projects" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">All Projects</h3>
                <p className="text-xs text-gray-500 mb-3">Manage project associations. The primary project is highlighted in blue.</p>
                
                {loadingProjects ? (
                  <p className="text-sm text-gray-500">Loading projects...</p>
                ) : (
                  <>
                    {/* Display all projects */}
                    {(() => {
                      const currentPid = form.watch("pid");
                      
                      return projects.length > 0 ? (
                        <div className="space-y-2 mb-3">
                          {projects.map((projId) => {
                            const project = projectOptions.find(p => p.pid === projId);
                            const isPrimary = projId === currentPid;
                            
                            return (
                              <div 
                                key={projId} 
                                className={`flex items-center justify-between p-3 border rounded-lg ${
                                  isPrimary 
                                    ? "bg-blue-50 border-blue-200" 
                                    : "bg-gray-50 border-gray-200"
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  <FolderOpen className={`h-4 w-4 ${isPrimary ? "text-blue-600" : "text-gray-600"}`} />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm font-medium">{projId}</p>
                                      {isPrimary && (
                                        <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                                          Primary
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                      {project?.title || "Loading..."}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  {!isPrimary && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleSetPrimaryProject(projId)}
                                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 text-xs h-7 px-2"
                                    >
                                      Set Primary
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveProject(projId)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic mb-3">No projects linked</p>
                      );
                    })()}
                    
                    <Separator className="my-3" />
                    
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Add New Project</h4>
                      <Input
                        value={projectSearch}
                        onChange={(event) => setProjectSearch(event.target.value)}
                        placeholder="Search by project ID, title, or lead"
                        aria-label="Search projects to add"
                        className="h-9 mb-2"
                      />
                      <div className="flex gap-2">
                        <Select value={selectedNewProject} onValueChange={setSelectedNewProject}>
                          <SelectTrigger className="h-9 flex-1">
                            <SelectValue placeholder="Select project to add" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[200px]">
                            {availableProjectOptions.map((proj) => (
                              <SelectItem key={proj.pid} value={proj.pid || ""}>
                                <div className="flex flex-col">
                                  <span className="font-medium text-sm">{proj.pid}</span>
                                  <span className="text-xs text-gray-500">{proj.title}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddProject}
                          disabled={!selectedNewProject}
                          className="h-9"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                      {projectSearch && availableProjectOptions.length === 0 && (
                        <p className="mt-2 text-xs text-gray-500">No matching projects available.</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}