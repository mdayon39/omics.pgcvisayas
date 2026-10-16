"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EmailMonitoringPanel } from "@/components/admin/EmailMonitoringPanel";
import useAuth from "@/hooks/useAuth";

export default function EmailMonitoringPage() {
  const router = useRouter();
  const { adminInfo, loading: authLoading } = useAuth();
  const hasAccess =
    adminInfo?.role?.toLowerCase().replace(/[-_\s]/g, "") === "superadmin";

  useEffect(() => {
    if (!authLoading && !hasAccess) {
      router.replace("/admin/dashboard");
    }
  }, [authLoading, hasAccess, router]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Checking email monitoring access…
      </div>
    );
  }

  if (!hasAccess) return null;

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <EmailMonitoringPanel isSuperadmin={hasAccess} />
    </div>
  );
}
