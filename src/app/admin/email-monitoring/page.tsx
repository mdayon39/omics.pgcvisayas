"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EmailMonitoringPanel } from "@/components/admin/EmailMonitoringPanel";
import { hasAdminEmailOperationsAccess } from "@/constants/adminEmailAccess";
import useAuth from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";

export default function EmailMonitoringPage() {
  const router = useRouter();
  const { adminInfo, loading: authLoading } = useAuth();
  const { canView, loading: permissionsLoading } = usePermissions(
    adminInfo?.role,
  );
  const hasAccess =
    hasAdminEmailOperationsAccess(adminInfo?.email) || canView("sentItems");
  const isLoading = authLoading || permissionsLoading;

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      router.replace("/admin/dashboard");
    }
  }, [hasAccess, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Checking email monitoring access…
      </div>
    );
  }

  if (!hasAccess) return null;

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <EmailMonitoringPanel />
    </div>
  );
}
