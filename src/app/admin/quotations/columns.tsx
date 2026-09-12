"use client";

import { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { QuotationRecord } from "@/types/Quotation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteQuotation } from "@/services/quotationService";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import useAuth from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

const categoryColors: Record<string, string> = {
  laboratory: "bg-green-100 text-green-800",
  equipment: "bg-blue-100 text-blue-800",
  bioinformatics: "bg-purple-100 text-purple-800",
  retail: "bg-orange-100 text-orange-800",
};

// helper to read any of: ISO string | number | Firestore Timestamp | Date
function toMillis(v: unknown): number {
  if (!v) return NaN;
  if (typeof v === "number") return v; // already ms
  if (typeof v === "string") return new Date(v).getTime();
  // Firestore Timestamp has toDate()
  const anyV = v as any;
  if (typeof anyV?.toDate === "function") return anyV.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  return NaN;
}

const ActionCell = ({ row }: { row: any }) => {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const { adminInfo } = useAuth();
  const { canDelete } = usePermissions(adminInfo?.role);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    if (
      !window.confirm(
        `Are you sure you want to delete quotation ${row.original.referenceNumber}?`,
      )
    ) {
      return;
    }

    try {
      setIsDeleting(true);
      await deleteQuotation(row.original.referenceNumber);
      toast.success("Quotation deleted successfully");
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete quotation");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex justify-end pr-2">
      {canDelete("quotations") && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleDelete}
          disabled={isDeleting}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export const columns: ColumnDef<QuotationRecord>[] = [
  {
    id: "dateIssued",
    header: "Date",
    // return a number (ms) so sorting is numeric & correct
    accessorFn: (row) => toMillis((row as any).dateIssued),
    // render it back as a date
    cell: ({ getValue }) => {
      const ms = getValue<number>();
      return isNaN(ms) ? "-" : new Date(ms).toLocaleDateString();
    },
    sortDescFirst: true,
  },
  {
    accessorKey: "referenceNumber",
    header: "Reference No.",
  },
  {
    accessorKey: "name",
    header: "Client",
  },
  {
    accessorKey: "designation",
    header: "Designation",
  },
  {
    accessorKey: "institution",
    header: "Institution",
    cell: ({ getValue }) => {
      const institution = (getValue() as string) || "—";
      return (
        <div className="max-w-[200px] truncate text-left" title={institution}>
          {institution}
        </div>
      );
    },
  },
  {
    accessorKey: "categories",
    header: "Category",
    cell: ({ row }) => {
      const categories = (row.getValue("categories") as string[]) ?? [];
      return (
        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => {
            const color =
              categoryColors[cat?.toLowerCase?.() || ""] ||
              "bg-gray-100 text-gray-800";
            return (
              <span
                key={cat}
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}
              >
                {cat?.charAt?.(0)?.toUpperCase?.() + cat?.slice?.(1)}
              </span>
            );
          })}
        </div>
      );
    },
  },
  {
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => {
      const total = Number(row.getValue("total") ?? 0);
      return `₱${total.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = (row.getValue("status") as string) || "pending";
      const statusColors: Record<string, string> = {
        pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
        selected: "bg-green-100 text-green-800 border-green-300",
        cancelled: "bg-slate-100 text-slate-600 border-slate-300",
        completed: "bg-purple-100 text-purple-800 border-purple-300",
      };
      const color =
        statusColors[status] || "bg-gray-100 text-gray-800 border-gray-300";
      return (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${color} capitalize`}
        >
          {status}
        </span>
      );
    },
  },
  {
    accessorKey: "preparedBy",
    header: "Prepared By",
    cell: ({ row }) => {
      const preparedBy = row.getValue("preparedBy") as
        | { name?: string; position?: string }
        | undefined;
      const name = preparedBy?.name || "—";
      return (
        <div className="max-w-[150px] truncate text-left" title={name}>
          {name}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right pr-4">Actions</div>,
    cell: ({ row }) => <ActionCell row={row} />,
  },
];
