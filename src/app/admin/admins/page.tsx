"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllAdmins, toggleAdminStatus } from "@/services/adminService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import useAuth from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Pencil, Search, Shield, UserX, UserCheck, Loader2 } from "lucide-react";
import AdminModal from "./AdminModal";
import { Admin } from "@/services/adminService";
import { getAdminDisplayName, getAdminDisplayNameWithIcon } from "@/lib/chatUtils";
import { PermissionGuard } from "@/components/PermissionGuard";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function AdminsManagementPage() {
  return (
    <PermissionGuard module="usersPermissions" action="view">
      <AdminsManagementContent />
    </PermissionGuard>
  );
}

function AdminsManagementContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<Admin | null>(null);
  const [statusDialog, setStatusDialog] = useState<{
    isOpen: boolean;
    admin: Admin | null;
  }>({
    isOpen: false,
    admin: null,
  });
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const queryClient = useQueryClient();
  const { adminInfo } = useAuth();
  const { canCreate, canEdit } = usePermissions(adminInfo?.role);

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ["admins"],
    queryFn: getAllAdmins,
  });

  const handleToggleStatus = async () => {
    if (!statusDialog.admin) return;

    setIsTogglingStatus(true);
    try {
      await toggleAdminStatus(
        statusDialog.admin.email,
        statusDialog.admin.status || "active"
      );
      toast.success(
        `Admin ${
          statusDialog.admin.status === "deactivated"
            ? "activated"
            : "deactivated"
        } successfully`
      );
      queryClient.invalidateQueries({ queryKey: ["admins"] });
    } catch (error) {
      console.error("Failed to toggle admin status:", error);
      toast.error("Failed to update admin status");
    } finally {
      setIsTogglingStatus(false);
      setStatusDialog({ isOpen: false, admin: null });
    }
  };

  const filteredAdmins = admins.filter((admin) => {
    const matchesSearch =
      !searchQuery ||
      admin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admin.chatAlias?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admin.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admin.position.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const handleAdd = () => {
    setEditingAdmin(null);
    setIsModalOpen(true);
  };

  const handleEdit = (admin: Admin) => {
    setEditingAdmin(admin);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingAdmin(null);
  };

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["admins"] });
    handleModalClose();
  };

  const formatDate = (date: any) => {
    if (!date) return "N/A";
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString("en-US", { 
      year: "numeric", 
      month: "short", 
      day: "numeric" 
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-blue-600" />
            Users & Permissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage system users and their access levels ({filteredAdmins.length} users)
          </p>
        </div>
        {canCreate("usersPermissions") && (
          <Button onClick={handleAdd} className="shadow-md">
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        )}
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, alias, email, or position..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]"></TableHead>
                <TableHead className="w-[200px]">Name</TableHead>
                <TableHead className="w-[140px]">Chat Alias</TableHead>
                <TableHead className="w-[250px]">Email</TableHead>
                <TableHead className="w-[180px]">Position</TableHead>
                <TableHead className="w-[100px]">Role</TableHead>
                <TableHead className="w-[130px]">Created At</TableHead>
                <TableHead className="w-[130px]">Last Login</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center h-32">
                    Loading admins...
                  </TableCell>
                </TableRow>
              ) : filteredAdmins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center h-32 text-muted-foreground">
                    No admins found. Try adjusting your search or add a new admin.
                  </TableCell>
                </TableRow>
              ) : (
                filteredAdmins.map((admin) => (
                  <TableRow key={admin.email} className={admin.status === "deactivated" ? "opacity-60 bg-slate-50" : ""}>
                    <TableCell>
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={admin.photoURL} />
                        <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">
                          {admin.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {admin.name}
                        {admin.status === "deactivated" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-200 text-red-600 bg-red-50">
                            Deactivated
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span aria-hidden="true" className="text-base">
                          {admin.chatIcon ||
                            getAdminDisplayNameWithIcon(admin.email).split(" ")[0]}
                        </span>
                        {admin.chatAlias || getAdminDisplayName(admin.email)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{admin.email}</TableCell>
                    <TableCell className="text-sm">{admin.position}</TableCell>
                    <TableCell>
                      <Badge 
                        className={
                          admin.role === "superadmin" ? "bg-purple-100 text-purple-800" :
                          admin.role === "admin" ? "bg-blue-100 text-blue-800" :
                          admin.role === "moderator" ? "bg-green-100 text-green-800" :
                          "bg-gray-100 text-gray-800"
                        }
                      >
                        <Shield className="h-3 w-3 mr-1" />
                        {admin.role === "superadmin" ? "Super Admin" :
                         admin.role === "admin" ? "Admin" :
                         admin.role === "moderator" ? "Moderator" :
                         "Viewer"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(admin.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(admin.lastLogin)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit("usersPermissions") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(admin)}
                            disabled={admin.status === "deactivated"}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canEdit("usersPermissions") && adminInfo?.email !== admin.email && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title={admin.status === "deactivated" ? "Reactivate user" : "Deactivate user"}
                            aria-label={admin.status === "deactivated" ? "Reactivate user" : "Deactivate user"}
                            className={`${
                              admin.status === "deactivated"
                                ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                : "text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            } transition-transform duration-150 hover:scale-105`}
                            onClick={() =>
                              setStatusDialog({ isOpen: true, admin })
                            }
                          >
                            {admin.status === "deactivated" ? (
                              <UserCheck className="h-4 w-4" />
                            ) : (
                              <UserX className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Modal */}
      {isModalOpen && (
        <AdminModal
          admin={editingAdmin}
          onClose={handleModalClose}
          onSuccess={handleSuccess}
        />
      )}

      {/* Status Confirmation Dialog */}
      <AlertDialog
        open={statusDialog.isOpen}
        onOpenChange={(open) =>
          !open && setStatusDialog({ isOpen: false, admin: null })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusDialog.admin?.status === "deactivated"
                ? "Reactivate User?"
                : "Deactivate User?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusDialog.admin?.status === "deactivated"
                ? `This will restore access for ${statusDialog.admin?.name}. They will be able to log in and perform actions according to their role.`
                : `This will suspend access for ${statusDialog.admin?.name}. They will not be able to log in or access the admin panel until reactivated.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTogglingStatus}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleToggleStatus();
              }}
              disabled={isTogglingStatus}
              className={
                statusDialog.admin?.status === "deactivated"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-amber-600 hover:bg-amber-700"
              }
            >
              {isTogglingStatus ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : statusDialog.admin?.status === "deactivated" ? (
                "Reactivate"
              ) : (
                "Deactivate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
