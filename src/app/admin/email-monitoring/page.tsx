import { PermissionGuard } from "@/components/PermissionGuard";
import { EmailMonitoringPanel } from "@/components/admin/EmailMonitoringPanel";

export default function EmailMonitoringPage() {
  return (
    <PermissionGuard module="sentItems" action="view">
      <div className="mx-auto w-full max-w-7xl p-6">
        <EmailMonitoringPanel />
      </div>
    </PermissionGuard>
  );
}
