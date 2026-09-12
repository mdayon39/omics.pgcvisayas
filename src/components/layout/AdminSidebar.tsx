// AdminSidebar.tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  LibraryBig,
  MessageSquare,
  FileText,
  Calculator,
  Receipt,
  FileSpreadsheet,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  Sliders,
  Shield,
  Database,
  Bell,
  UserCheck,
  CalendarDays,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useApprovalNotifications } from "@/hooks/useApprovalNotifications";
import { useInquiryNotifications } from "@/hooks/useInquiryNotifications";
import { useProjectFormNotifications } from "@/app/admin/projects/columns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTabContext } from "@/contexts/TabContext";
import type { RolePermissions } from "@/types/Permissions";

// Map routes to permission modules
const ROUTE_MODULE_MAP: Record<string, keyof RolePermissions> = {
  "/admin/dashboard": "dashboard",
  "/admin/inquiry": "inquiries",
  "/admin/projects": "projects",
  "/admin/clients": "clients",
  "/admin/quotations": "quotations",
  "/admin/charge-slips": "chargeSlips",
  "/admin/official-receipts": "officialReceipts",
  "/admin/sample-forms": "sampleForms",
  "/admin/manual-quotation": "manualQuotation",
  "/admin/services": "serviceCatalog",
  "/admin/catalog-settings": "catalogSettings",
  "/admin/configurations": "configurations",
  "/admin/office-calendar": "officeCalendar",
  "/admin/member-approvals": "memberApprovals",
  "/admin/roles": "roleManagement",
  "/admin/admins": "usersPermissions",
  "/admin/activity-logs": "activityLogs",
  "/admin/sent-items": "sentItems",
  "/admin/backup": "usersPermissions", // Backup uses same permissions as user management
};

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, adminInfo } = useAuth();
  const { canView, loading: permissionsLoading } = usePermissions(
    adminInfo?.role,
  );
  const { openTab, activeTab, isTabOpen, setActiveTab } = useTabContext();
  const {
    pendingCount,
    inquiryCount,
    newOrChargeSlipNumbers,
    pendingChargeSlipCount,
  } = useApprovalNotifications();
  const projectsWithUnacknowledged = useProjectFormNotifications();
  const pendingProjectFormCount = projectsWithUnacknowledged.size;

  const handleNavClick = (
    href: string,
    label: string,
    icon: React.ElementType,
  ) => {
    const tabId = href.replace("/admin/", "");

    // Always open/ensure tab exists
    openTab({
      id: tabId,
      label,
      path: href,
      icon,
      closable: true,
    });

    // Navigate (React Query will handle data caching)
    router.push(href);
  };

  const isActive = (href: string) => {
    const tabId = href.replace("/admin/", "");
    return activeTab === tabId;
  };

  // Navigation sections with grouped items
  const navigationSections = [
    {
      title: "OPERATIONS",
      items: [
        {
          href: "/admin/dashboard",
          label: "Dashboard",
          icon: LayoutDashboard,
        },
        {
          href: "/admin/inquiry",
          label: "Inquiries",
          icon: MessageSquare,
        },
        {
          href: "/admin/projects",
          label: "Projects",
          icon: LibraryBig,
        },
        {
          href: "/admin/clients",
          label: "Clients",
          icon: Users,
        },
        {
          href: "/admin/quotations",
          label: "Quotations",
          icon: FileText,
        },
        {
          href: "/admin/charge-slips",
          label: "Charge Slips",
          icon: Receipt,
        },
        {
          href: "/admin/manual-quotation",
          label: "Manual Quotation",
          icon: Calculator,
        },
      ],
    },
    {
      title: "NOTIFICATIONS",
      items: [
        {
          href: "/admin/member-approvals",
          label: "Projects Approval",
          icon: ShieldCheck,
        },
      ],
    },
    {
      title: "CONFIGURATION",
      items: [
        {
          href: "/admin/services",
          label: "Services Catalog",
          icon: Settings,
        },
        {
          href: "/admin/catalog-settings",
          label: "Catalog Settings",
          icon: Sliders,
        },
        {
          href: "/admin/configurations",
          label: "General Settings",
          icon: Sliders,
        },
        {
          href: "/admin/office-calendar",
          label: "Office Calendar",
          icon: CalendarDays,
        },
      ],
    },
    {
      title: "ADMINISTRATION",
      items: [
        {
          href: "/admin/roles",
          label: "Role Management",
          icon: Shield,
        },
        {
          href: "/admin/admins",
          label: "Users & Permissions",
          icon: ShieldCheck,
        },
        {
          href: "/admin/activity-logs",
          label: "Activity Logs",
          icon: ScrollText,
        },
        {
          href: "/admin/sent-items",
          label: "Sent Items",
          icon: Send,
        },
        {
          href: "/admin/backup",
          label: "Database Backup",
          icon: Database,
        },
      ],
    },
  ];

  // Filter navigation items based on permissions
  const filteredSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const routeModule = ROUTE_MODULE_MAP[item.href];
        return routeModule && canView(routeModule);
      }),
    }))
    .filter((section) => section.items.length > 0); // Hide empty sections

  return (
    <div className="flex flex-col h-full w-64 bg-white border-r border-slate-200">
      {/* Admin profile — pinned at the top */}
      {user && (
        <div className="p-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarImage src={user.photoURL || ""} />
              <AvatarFallback className="bg-[#166FB5] text-white text-sm">
                {user.displayName?.[0] ?? "A"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {adminInfo?.name || user.displayName}
              </p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
            <Button
              onClick={signOut}
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 flex-shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
          {adminInfo?.role && (
            <div className="mt-2.5">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-medium capitalize",
                  adminInfo.role === "superadmin" &&
                    "border-purple-300 text-purple-700 bg-purple-50",
                  adminInfo.role === "admin" &&
                    "border-blue-300 text-blue-700 bg-blue-50",
                  adminInfo.role === "moderator" &&
                    "border-green-300 text-green-700 bg-green-50",
                  adminInfo.role === "viewer" &&
                    "border-slate-300 text-slate-700 bg-slate-50",
                )}
              >
                {adminInfo.role}
              </Badge>
            </div>
          )}
        </div>
      )}

      {/* Clean Navigation */}
      <div className="flex-1 overflow-y-auto p-4">
        <nav className="space-y-6">
          {filteredSections.map((section, sectionIndex) => (
            <div key={section.title}>
              {/* Section Header */}
              <div className="px-3 mb-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {section.title}
                </h3>
              </div>

              {/* Section Items */}
              <div className="space-y-1">
                {section.items.map(({ href, label, icon: Icon }) => (
                  <div
                    key={href}
                    onClick={() => handleNavClick(href, label, Icon)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 cursor-pointer",
                      isActive(href)
                        ? "bg-[#166FB5] text-white"
                        : isTabOpen(href.replace("/admin/", ""))
                          ? "bg-slate-100 text-slate-800 border-l-2 border-[#166FB5]"
                          : "text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium flex-1">{label}</span>

                    {/* Notification badge for Inquiries */}
                    {href === "/admin/inquiry" && inquiryCount > 0 && (
                      <span
                        className={cn(
                          "min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1.5",
                          isActive(href)
                            ? "bg-white text-[#166FB5]"
                            : "bg-red-500 text-white animate-pulse",
                        )}
                      >
                        {inquiryCount}
                      </span>
                    )}

                    {/* Notification badge for Projects */}
                    {href === "/admin/projects" &&
                      pendingProjectFormCount > 0 && (
                        <span
                          className={cn(
                            "min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1.5",
                            isActive(href)
                              ? "bg-white text-[#166FB5]"
                              : "bg-red-500 text-white animate-pulse",
                          )}
                        >
                          {pendingProjectFormCount > 99
                            ? "99+"
                            : pendingProjectFormCount}
                        </span>
                      )}

                    {/* Notification badge for Charge Slips */}
                    {href === "/admin/charge-slips" &&
                      pendingChargeSlipCount > 0 && (
                        <span
                          className={cn(
                            "min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1.5",
                            isActive(href)
                              ? "bg-white text-[#166FB5]"
                              : "bg-red-500 text-white animate-pulse",
                          )}
                        >
                          {pendingChargeSlipCount}
                        </span>
                      )}

                    {/* Notification badge for Projects Approval */}
                    {href === "/admin/member-approvals" && pendingCount > 0 && (
                      <span
                        className={cn(
                          "min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1.5",
                          isActive(href)
                            ? "bg-white text-[#166FB5]"
                            : "bg-red-500 text-white animate-pulse",
                        )}
                      >
                        {pendingCount}
                      </span>
                    )}

                    {isTabOpen(href.replace("/admin/", "")) &&
                      !isActive(href) &&
                      href !== "/admin/member-approvals" &&
                      href !== "/admin/inquiry" &&
                      (href !== "/admin/charge-slips" ||
                        pendingChargeSlipCount === 0) && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#166FB5]" />
                      )}
                  </div>
                ))}
              </div>

              {/* Divider between sections (except last) */}
              {sectionIndex < filteredSections.length - 1 && (
                <div className="mt-4 border-t border-slate-100" />
              )}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
