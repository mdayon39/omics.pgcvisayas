// Admin Clients Table Columns
// Defines the columns and actions for the admin/clients data table.

"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Client } from "@/types/Client"
import { clientSchema } from "@/schemas/clientSchema"
import { Button } from "@/components/ui/button"
import { toast } from "sonner";
import { ArrowUpDown, Copy } from "lucide-react"
import useAuth from "@/hooks/useAuth"
import { usePermissions } from "@/hooks/usePermissions"
import { ChargeSlipButton } from "./ChargeSlipButton"
import { EditClientModal } from "@/components/forms/EditClientModal"

// Helper to validate client data using Zod schema
const validateClient = (data: any) => {
  const result = clientSchema.safeParse(data)
  return {
    isValid: result.success,
    data: result.success ? result.data : null,
    error: result.success ? null : result.error
  }
}

function CopyCellValue({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  if (!value) return null;

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard`);
    } catch (error) {
      console.error(`Failed to copy client ${label.toLowerCase()}:`, error);
      toast.error(`Failed to copy ${label.toLowerCase()}`);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      <Copy className="h-3 w-3" />
    </button>
  );
}

// Table columns definition for admin/clients
export const columns: ColumnDef<Client>[] = [

  { 
    accessorKey: "cid",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="hover:bg-accent px-1 text-[11px] font-semibold"
        >
          Client ID
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      )
    },
    size: 70,
    cell: ({ row }) => {
      const clientId = row.original.cid || "";
      return (
        <div className="group flex items-center gap-1 px-1">
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {clientId}
          </span>
          <CopyCellValue value={clientId} label="Client ID" />
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="hover:bg-accent px-1 text-[11px] font-semibold"
        >
          Date
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      )
    },
    size: 90,
    cell: ({ getValue }) => {
      const dateValue = getValue();
      if (!dateValue) return <div className="px-1 text-[10px] text-muted-foreground text-center">—</div>;
      
      try {
        const date = dateValue instanceof Date ? dateValue : (typeof dateValue === 'object' && 'toDate' in (dateValue as any) ? (dateValue as any).toDate() : new Date(dateValue as any));
        if (isNaN(date.getTime())) return <div className="px-1 text-[10px] text-muted-foreground text-center">—</div>;
        
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const yyyy = date.getFullYear();
        
        return (
          <div className="font-mono text-[10px] text-slate-500 px-1 text-center tabular-nums font-medium">
            {`${mm}-${dd}-${yyyy}`}
          </div>
        );
      } catch (e) {
        return <div className="px-1 text-[10px] text-muted-foreground text-center">—</div>;
      }
    },
  },
  {
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="hover:bg-accent px-1 text-[11px] font-semibold"
        >
          Client Name
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      )
    },
    size: 160,
    cell: ({ row }) => {
      const name = row.original.name || "";
      return (
        <div className="group flex items-start gap-1 px-1">
          <div className="max-w-[160px] flex-1 text-[11px] font-medium whitespace-normal break-words leading-tight text-slate-900">
            {name}
          </div>
          <CopyCellValue value={name} label="Client name" />
        </div>
      );
    },
  },
  {
    accessorKey: "email",
    header: () => <div className="px-1 text-[11px] font-semibold">Email</div>,
    size: 140,
    cell: ({ row }) => {
      const email = row.original.email || "";
      return (
        <div className="group flex items-center gap-1 px-1">
          <div className="max-w-[140px] flex-1 truncate text-[10px] text-slate-500" title={email}>
            {email}
          </div>
          <CopyCellValue value={email} label="Email" />
        </div>
      );
    },
  },
  {
    accessorKey: "pid",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="hover:bg-accent px-1 text-[11px] font-semibold"
        >
          Projects
          <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      )
    },
    size: 100,
    cell: ({ row }) => {
      // pid is now an array
      const projects = Array.isArray(row.original.pid) 
        ? row.original.pid 
        : (row.original.pid ? [row.original.pid] : []);
      const projectIds = projects.join(", ");
      
      if (projects.length === 0) return <span className="text-gray-400 text-[10px] px-1">-</span>;
      
      if (projects.length === 1) {
        return (
          <div className="group flex items-center gap-1">
            <div className="px-1.5 py-0.5 bg-blue-50 border border-blue-100 rounded text-[9px] font-mono font-bold text-[#166FB5] w-fit ml-1">
              {projects[0]}
            </div>
            <CopyCellValue value={projectIds} label="Projects" />
          </div>
        );
      }

      const firstPid = projects[0];
      const otherPids = projects.slice(1).join(", ");
      
      return (
        <div className="group flex items-center gap-1 ml-1">
          <div className="px-1.5 py-0.5 bg-blue-50 border border-blue-100 rounded text-[9px] font-mono font-bold text-[#166FB5]">
            {firstPid}
          </div>
          <div 
            className="px-1 py-0.5 bg-gray-50 border border-gray-200 rounded text-[9px] font-mono font-bold text-gray-500 cursor-help"
            title={otherPids}
          >
            +{projects.length - 1}
          </div>
          <CopyCellValue value={projectIds} label="Projects" />
        </div>
      );
    },
  },
  {
    accessorKey: "affiliation",
    header: () => <div className="px-1 text-[11px] font-semibold">Affiliation</div>,
    size: 140,
    cell: ({ getValue }) => (
      <div className="max-w-[140px] line-clamp-1 text-[10px] leading-tight text-slate-600 px-1" title={getValue() as string}>
        {getValue() as string}
      </div>
    ),
  },
  {
    accessorKey: "designation",
    header: () => <div className="px-1 text-[11px] font-semibold">Designation</div>,
    size: 100,
    cell: ({ getValue }) => (
      <div className="max-w-[100px] truncate text-[10px] text-slate-500 px-1" title={getValue() as string}>
        {getValue() as string}
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: () => <div className="px-1 text-[11px] font-semibold">Status</div>,
    size: 90,
    cell: ({ getValue }) => {
      const val = (getValue() as string | undefined) || "Approved";
      const isCancelled = val === "Cancelled";
      return (
        <div className="px-1">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${
              isCancelled
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            {val}
          </span>
        </div>
      );
    },
  },
  {
    id: "actions",
    header: () => <div className="px-1 text-[11px] font-semibold text-right">Actions</div>,
    size: 150,
    cell: (ctx: any) => {
      const { row, meta } = ctx;
      const client = row.original;
      const { adminInfo } = useAuth();
      const { canEdit, canCreate } = usePermissions(adminInfo?.role);
      const projectIds = Array.isArray(client.pid)
        ? client.pid
        : client.pid
          ? [client.pid]
          : [];

      return (
        <div className="flex items-center gap-1 justify-end px-1">
          {canEdit("clients") && (
            <EditClientModal client={client} onSuccess={meta?.onSuccess} />
          )}
          {canCreate("chargeSlips") && (
            <ChargeSlipButton
              clientId={client.cid || ""}
              projectIds={projectIds}
            />
          )}
        </div>
      );
    },
  },
]