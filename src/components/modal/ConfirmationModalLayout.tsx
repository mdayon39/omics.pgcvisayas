// Flexible Confirmation Modal Layout
// A reusable dialog for confirming user actions, with support for custom content, loading state, and customizable button labels.

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Props for the flexible confirmation modal layout
interface ConfirmationModalLayoutProps {
  open: boolean;
  title?: string;
  description?: string;
  children?: React.ReactNode; // Custom content to display in the modal
  headerIcon?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean; // Show loading state on confirm button
  className?: string; // Optional className for the dialog content
}

export default function ConfirmationModalLayout({
  open,
  title = "Please double check before saving",
  description = "Review your entries below before confirming. This action cannot be undone.",
  children,
  confirmLabel = "Confirm & Save",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  loading = false,
  className = "max-w-md", // Default width
  headerIcon,
}: ConfirmationModalLayoutProps) {
  return (
    <Dialog open={open} onOpenChange={onCancel}>
      <DialogContent
        className={`gap-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl ${className}`}
      >
        <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-12">
          <div className="flex items-start gap-3">
            {headerIcon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-100 bg-violet-100">
                {headerIcon}
              </div>
            )}
            <div className="min-w-0">
              <DialogTitle className="text-lg font-bold leading-tight text-slate-900">
                {title}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm leading-5 text-slate-600">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        {/* Custom content (e.g., summary, form, etc.) */}
        <div className="px-5 py-4">{children}</div>
        {/* Action buttons with loading state */}
        <DialogFooter className="flex-row justify-end gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={loading}
            className="h-10 border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="h-10 bg-[#166FB5] px-4 text-sm font-semibold text-white hover:bg-[#125f9c]"
          >
            {loading ? "Saving..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
