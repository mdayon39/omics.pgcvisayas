/**
 * Admin Inquiry Table Column Definitions
 *
 * This file defines the column structure for the inquiry data table in the admin interface.
 * It uses TanStack Table (React Table) to create a sortable, filterable table with custom cell renderers and actions.
 */

"use client";

import { useRouter } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Inquiry } from "@/types/Inquiry";
import { CatalogItem } from "@/types/CatalogSettings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditInquiryModal } from "@/components/forms/EditInquiryModal";
import useAuth from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QuoteButton } from "./QuoteButton";
import UnreadBadge from "@/components/chat/UnreadBadge";
import { Copy, User, Eye, Circle, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import usePresenceStatus from "@/hooks/usePresenceStatus";
import { setInquiryPinned } from "@/services/inquiryService";
import { useState } from "react";

const InquiryPinButton = ({ inquiry }: { inquiry: Inquiry }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const isPinned = inquiry.pinnedByAdmin === true;
  const Icon = isPinned ? PinOff : Pin;
  const label = isPinned ? "Unpin inquiry" : "Pin inquiry";

  const togglePinned = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsUpdating(true);
    try {
      await setInquiryPinned(inquiry.id, !isPinned);
      toast.success(isPinned ? "Inquiry unpinned" : "Inquiry pinned");
    } catch {
      toast.error(`Failed to ${isPinned ? "unpin" : "pin"} inquiry`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={togglePinned}
      disabled={isUpdating}
      title={label}
      aria-label={label}
    >
      <Icon className={`h-3.5 w-3.5 ${isPinned ? "text-blue-600" : ""}`} />
    </Button>
  );
};

/**
 * Presence Cell Component
 * 
 * Separate component to handle the inclusion of the usePresenceStatus hook
 * within the table cell, which is not allowed directly in the ColumnDef object.
 */
const PresenceCell = ({ inquiryId }: { inquiryId: string }) => {
  const presence = usePresenceStatus(`client_${inquiryId}`);
  
  if (!presence.isOnline) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Online Now</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Helper to convert hex color to rgba
 */
const hexToRgba = (hex: string, alpha: number) => {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return "";
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/**
 * Get status color from catalog or fallback to default
 */
const getStatusColorFromCatalog = (
  status: string,
  catalog: CatalogItem[]
): { bg: string; text: string } => {
  const catalogItem = catalog.find((item) => item.value === status);
  if (catalogItem?.color) {
    return {
      bg: hexToRgba(catalogItem.color, 0.15),
      text: catalogItem.color,
    };
  }
  // Fallback colors
  const fallbacks: Record<string, { bg: string; text: string }> = {
    "Approved Client": { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e" },
    "Quotation Only": { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" },
    "Ongoing Quotation": { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316" },
    "In Progress": { bg: "rgba(14, 165, 233, 0.15)", text: "#0ea5e9" },
    "Service Not Offered": { bg: "rgba(148, 163, 184, 0.15)", text: "#94a3b8" },
    Cancelled: { bg: "rgba(148, 163, 184, 0.15)", text: "#94a3b8" },
    Pending: { bg: "rgba(234, 179, 8, 0.15)", text: "#eab308" },
  };
  return fallbacks[status] || fallbacks.Pending;
};

/**
 * Column definitions for the inquiry data table
 *
 * Accepts statusCatalog to apply dynamic colors from Configuration > Catalog Settings.
 * Each column defines how data should be displayed, including custom cell renderers
 * for complex data types like dates and status badges. The columns are configured
 * to work with TanStack Table's sorting and filtering features.
 */
export const columns = (statusCatalog: CatalogItem[] = []): ColumnDef<Inquiry>[] => [
  {
    accessorKey: "id",
    header: "Inquiry ID",
    size: 110, // Increased size to display the complete inquiry ID
    cell: ({ row }) => {
      const inquiry = row.original;

      // Check if inquiry is within last 24 hours
      const isRecent = (() => {
        if (!inquiry.createdAt) return false;
        const date =
          inquiry.createdAt instanceof Date
            ? inquiry.createdAt
            : new Date(inquiry.createdAt);
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return date >= oneDayAgo;
      })();

      // NEW badge logic:
      // Only show if status is "Pending"
      const showNew = inquiry.status === "Pending";

      const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(inquiry.id);
          toast.success("Inquiry ID copied to clipboard");
        } catch (err) {
          toast.error("Failed to copy Inquiry ID");
        }
      };

      const shortId = inquiry.id.slice(0, 8);

      return (
        <div className="flex items-center gap-2 w-full pr-1">
          <PresenceCell inquiryId={inquiry.id} />
          {showNew && (
            <Badge
              variant="destructive"
              className="h-3 px-1 text-[7px] animate-pulse shrink-0"
            >
              N
            </Badge>
          )}
          <span className="font-mono text-xs truncate flex-1" title={inquiry.id}>
            {inquiry.id}
          </span>
          <button
            onClick={handleCopy}
            className="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-100 rounded shrink-0"
            title="Copy Inquiry ID"
          >
            <Copy className="h-2.5 w-2.5 text-slate-400" />
          </button>
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Date",
    size: 70, // Compressed
    cell: ({ row }) => {
      const createdAt = row.original.createdAt;

      if (!createdAt) {
        return <span className="text-muted-foreground italic">—</span>;
      }

      // Ensure we have a Date object
      const date = createdAt instanceof Date ? createdAt : new Date(createdAt);

      if (isNaN(date.getTime())) {
        return <span className="text-red-500 text-[10px]">Invalid</span>;
      }

      // Format date for display (MM-DD-YYYY format)
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      
      return (
        <span className="text-slate-500 font-medium tabular-nums text-[11px]">
          {`${month}-${day}-${year}`}
        </span>
      );
    },
  },
  {
    accessorKey: "name",
    header: "Name",
    size: 110, // Reduced per request; tooltip shows full value
    cell: ({ getValue }) => {
      const name = getValue() as string;

      const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(name);
          toast.success("Name copied to clipboard");
        } catch (err) {
          toast.error("Failed to copy Name");
        }
      };

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 group w-full cursor-pointer">
                <span className="truncate text-[11px] font-semibold text-slate-700 flex-1">
                  {name}
                </span>
                <button
                  onClick={handleCopy}
                  className="p-1 hover:bg-slate-100 rounded shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Copy Name"
                >
                  <Copy className="h-2.5 w-2.5 text-slate-400" />
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[300px] break-words">
              <p className="text-xs font-semibold">{name}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  {
    accessorKey: "email",
    header: "Email",
    size: 100, // Reduced from 120 per request
    cell: ({ getValue }) => {
      const email = (getValue() as string) || "—";

      const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (email === "—") return;
        try {
          await navigator.clipboard.writeText(email);
          toast.success("Email copied to clipboard");
        } catch (err) {
          toast.error("Failed to copy Email");
        }
      };

      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 group w-full cursor-pointer">
                <span className="truncate text-[11px] text-slate-400 flex-1">
                  {email}
                </span>
                {email !== "—" && (
                  <button
                    onClick={handleCopy}
                    className="p-1 hover:bg-slate-100 rounded shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy Email"
                  >
                    <Copy className="h-2.5 w-2.5 text-slate-400" />
                  </button>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[300px] break-words">
              <p className="text-xs font-semibold">{email}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  {
    accessorKey: "affiliation",
    header: "Affiliation",
    size: 95, // Reduced per request; tooltip shows full value
    cell: ({ getValue }) => {
      const affiliation = getValue() as string;
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-full truncate text-[11px] text-slate-500 font-medium cursor-pointer">
                {affiliation}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[300px] break-words">
              <p className="text-xs font-semibold">{affiliation}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    },
  },
  {
    accessorKey: "serviceType",
    header: "Svc",
    size: 45, // Minimum possible
    cell: ({ getValue }) => {
      const serviceType = getValue() as string;
      if (!serviceType) return <span className="text-muted-foreground italic">—</span>;
      
      // Shorten/Capitalize
      const getShortType = (type: string) => {
        const map: Record<string, string> = {
          'laboratory': 'Lab',
          'bioinformatics': 'Bio',
          'equipment': 'Equip',
          'retail': 'Ret',
          'research': 'Res',
          'training': 'Trn'
        };
        return map[type.toLowerCase()] || type;
      };

      return (
        <div className="font-semibold text-slate-500 text-[10px] uppercase">
          {getShortType(serviceType)}
        </div>
      );
    },
  },
  // Designation - Hidden for cleaner view
  // {
  //   accessorKey: "designation",
  //   header: "Designation",
  // },
  {
    accessorKey: "status",
    header: "Status",
    size: 180, // Expanded slightly to provide more breathing room for labels and icons
    cell: ({ row }) => {
      const router = useRouter();
      const inquiry = row.original;
      const status = inquiry.status || "Pending";
      const hasLoggedIn = inquiry.hasLoggedIn;
      const hasOpenedQuotation = inquiry.hasOpenedQuotation;

      // Render status as a colored badge with fixed width and trailing icons
      const colors = getStatusColorFromCatalog(status, statusCatalog);
      return (
        <div className="flex items-center gap-2 w-full pr-1">
          <div className="w-[72%] flex-shrink-0">
            <span
              className="block w-full px-1.5 py-0.5 rounded-full text-[9px] font-bold truncate text-center"
              style={{
                backgroundColor: colors.bg,
                color: colors.text,
              }}
            >
              {status}
            </span>
          </div>
          
          <div className="flex items-center gap-1.5 flex-1 justify-start">
            <div className="flex items-center gap-1.5 min-w-[42px] justify-start shrink-0">
              {!!hasLoggedIn ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <User className="h-3.5 w-3.5 text-green-600 fill-green-600 shrink-0 cursor-default" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs font-semibold">
                        Client logged in
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <div className="w-3.5 h-3.5 shrink-0" />
              )}
              
              {!!hasOpenedQuotation ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Eye
                        className="h-3.5 w-3.5 text-blue-500 shrink-0 cursor-default"
                        strokeWidth={3}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs font-semibold">
                        Quotation viewed
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <div className="w-3.5 h-3.5 shrink-0" />
              )}
            </div>
            
            <div className="shrink-0 flex items-center ml-auto">
              <UnreadBadge
                inquiryId={inquiry.id}
                role="admin"
                senderId={inquiry.email}
                senderName={inquiry.name}
              />
            </div>
          </div>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: () => <div className="text-center w-full">Actions</div>,
    size: 120,
    cell: ({ row }) => {
      const inquiry = row.original;
      const router = useRouter();
      const { adminInfo } = useAuth();
      const { canEdit, canCreate } = usePermissions(adminInfo?.role);

      return (
        <div className="flex items-center justify-center -space-x-1 h-9">
          <InquiryPinButton inquiry={inquiry} />
          {canCreate("quotations") && (
            <div className="scale-90 origin-center">
              <QuoteButton inquiryId={inquiry.id} />
            </div>
          )}

          {/* Edit inquiry modal trigger - only show if user has edit permission */}
          {canEdit("inquiries") && (
            <div className="scale-75 origin-center">
              <EditInquiryModal
                key={inquiry.id} // Force re-render when inquiry changes
                inquiry={inquiry}
                onSuccess={() => router.refresh()}
              />
            </div>
          )}
        </div>
      );
    },
  },
];
