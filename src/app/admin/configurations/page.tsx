"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PermissionGuard } from "@/components/PermissionGuard";
import { usePermissions } from "@/hooks/usePermissions";
import useAuth from "@/hooks/useAuth";
import {
  DEFAULT_PORTAL_FEATURES,
  getConfigurationSettings,
  updateConfigurationSettings,
} from "@/services/configurationSettingsService";
import {
  ConfigurationSettings,
  InquiryNotificationGroup,
  PortalFeatureKey,
} from "@/types/ConfigurationSettings";

export default function ConfigurationsPage() {
  return (
    <PermissionGuard module="configurations" action="view">
      <ConfigurationsContent />
    </PermissionGuard>
  );
}

function ConfigurationsContent() {
  const { adminInfo } = useAuth();
  const { canEdit } = usePermissions(adminInfo?.role);
  const [settings, setSettings] = useState<ConfigurationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({});
  const [receiptEmailInput, setReceiptEmailInput] = useState("");

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await getConfigurationSettings();
        setSettings(data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load configuration settings");
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const portalFeatures = settings?.portalFeatures ?? DEFAULT_PORTAL_FEATURES;
  const notificationGroups = useMemo(
    () => settings?.inquiryNotifications ?? [],
    [settings],
  );

  const updatePortalFeature = async (key: PortalFeatureKey) => {
    if (!settings) return;
    const next = {
      ...settings.portalFeatures,
      [key]: !settings.portalFeatures[key],
    };

    setSettings({ ...settings, portalFeatures: next });

    try {
      await updateConfigurationSettings({ portalFeatures: next });
      toast.success("Portal visibility updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update portal visibility");
      setSettings(settings);
    }
  };

  const updateNotificationGroups = async (groups: InquiryNotificationGroup[]) => {
    if (!settings) return;
    setSettings({ ...settings, inquiryNotifications: groups });

    try {
      await updateConfigurationSettings({ inquiryNotifications: groups });
      toast.success("Notification recipients updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update notification recipients");
      setSettings(settings);
    }
  };

  const handleAddRecipient = (groupId: string) => {
    if (!settings) return;
    const raw = emailInputs[groupId]?.trim() || "";
    const email = raw.toLowerCase();

    if (!email) {
      toast.error("Please enter an email address");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }

    const groups = settings.inquiryNotifications.map((group) => {
      if (group.id !== groupId) return group;
      const recipients = new Set((group.recipients || []).map((e) => e.toLowerCase()));
      recipients.add(email);
      return { ...group, recipients: Array.from(recipients) };
    });

    setEmailInputs((prev) => ({ ...prev, [groupId]: "" }));
    updateNotificationGroups(groups);
  };

  const handleRemoveRecipient = (groupId: string, email: string) => {
    if (!settings) return;
    const groups = settings.inquiryNotifications.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        recipients: (group.recipients || []).filter((item) => item !== email),
      };
    });

    updateNotificationGroups(groups);
  };

  const [bioinfoEmailInput, setBioinfoEmailInput] = useState("");

  const handleAddBioinfoRecipient = () => {
    if (!settings) return;
    const email = bioinfoEmailInput.trim().toLowerCase();
    if (!email) { toast.error("Please enter an email address"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Please enter a valid email address"); return; }
    const current = new Set((settings.bioinformaticsWorkflowNotifications || []).map((e) => e.toLowerCase()));
    current.add(email);
    const updated = Array.from(current);
    setBioinfoEmailInput("");
    updateBioinfoNotifications(updated);
  };

  const handleRemoveBioinfoRecipient = (email: string) => {
    if (!settings) return;
    const updated = (settings.bioinformaticsWorkflowNotifications || []).filter((e) => e !== email);
    updateBioinfoNotifications(updated);
  };

  const updateBioinfoNotifications = async (emails: string[]) => {
    if (!settings) return;
    setSettings({ ...settings, bioinformaticsWorkflowNotifications: emails });
    try {
      await updateConfigurationSettings({ bioinformaticsWorkflowNotifications: emails });
      toast.success("Bioinformatics workflow notification recipients updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update bioinformatics workflow notification recipients");
      setSettings(settings);
    }
  };

  const handleAddReceiptRecipient = () => {
    if (!settings) return;
    const email = receiptEmailInput.trim().toLowerCase();
    if (!email) { toast.error("Please enter an email address"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("Please enter a valid email address"); return; }
    const current = new Set((settings.receiptNotifications || []).map((e) => e.toLowerCase()));
    current.add(email);
    const updated = Array.from(current);
    setReceiptEmailInput("");
    updateReceiptNotifications(updated);
  };

  const handleRemoveReceiptRecipient = (email: string) => {
    if (!settings) return;
    const updated = (settings.receiptNotifications || []).filter((e) => e !== email);
    updateReceiptNotifications(updated);
  };

  const updateReceiptNotifications = async (emails: string[]) => {
    if (!settings) return;
    setSettings({ ...settings, receiptNotifications: emails });
    try {
      await updateConfigurationSettings({ receiptNotifications: emails });
      toast.success("Receipt notification recipients updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update receipt notification recipients");
      setSettings(settings);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500">Loading configurations...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">General Settings</h1>
        <p className="text-sm text-slate-500">
          Manage client portal visibility and notification routing.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Chat & Support</CardTitle>
          <CardDescription>
            Configure chat widget automated behaviors.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Automated Office Hours Reply</p>
              <p className="text-xs text-slate-500">
                {portalFeatures.chatAutoReply ? "Enabled" : "Disabled"}. Automatically informs clients about office closures/holidays when they message.
              </p>
            </div>
            <Switch
              checked={portalFeatures.chatAutoReply}
              onCheckedChange={() => updatePortalFeature("chatAutoReply")}
              disabled={!canEdit("configurations")}
            />
          </div>

          <Separator className="my-2" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Chat Header Availability Status</p>
              <p className="text-xs text-slate-500">
                {portalFeatures.chatHeaderStatus ? "Enabled" : "Disabled"}. Shows "Outside Office Hours", "Weekend", etc. in the chat widget header.
              </p>
            </div>
            <Switch
              checked={portalFeatures.chatHeaderStatus}
              onCheckedChange={() => updatePortalFeature("chatHeaderStatus")}
              disabled={!canEdit("configurations")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email Notification Routing</CardTitle>
          <CardDescription>
            Add or remove recipients per inquiry category. Multiple recipients are supported.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {notificationGroups.map((group) => (
            <div key={group.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{group.label}</p>
                  {group.description && (
                    <p className="text-xs text-slate-500">{group.description}</p>
                  )}
                </div>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  {group.serviceFilters.join(", ")}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                {group.recipients?.length ? (
                  group.recipients.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(group.id, email)}
                        className="text-slate-500 hover:text-red-500"
                        disabled={!canEdit("configurations")}
                      >
                        ×
                      </button>
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No recipients configured.</p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Add recipient email"
                  value={emailInputs[group.id] || ""}
                  onChange={(e) =>
                    setEmailInputs((prev) => ({ ...prev, [group.id]: e.target.value }))
                  }
                  className="sm:flex-1"
                  disabled={!canEdit("configurations")}
                />
                <Button
                  onClick={() => handleAddRecipient(group.id)}
                  disabled={!canEdit("configurations")}
                >
                  Add recipient
                </Button>
              </div>

              <Separator />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt Upload Notifications</CardTitle>
          <CardDescription>
            Email addresses that receive an automatic alert when a client uploads an Official Receipt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(settings?.receiptNotifications || []).length ? (
              (settings!.receiptNotifications!).map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => handleRemoveReceiptRecipient(email)}
                    className="text-slate-500 hover:text-red-500"
                    disabled={!canEdit("configurations")}
                  >
                    &times;
                  </button>
                </span>
              ))
            ) : (
              <p className="text-xs text-slate-400">No recipients configured.</p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Add recipient email"
              value={receiptEmailInput}
              onChange={(e) => setReceiptEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddReceiptRecipient(); } }}
              className="sm:flex-1"
              disabled={!canEdit("configurations")}
            />
            <Button
              onClick={handleAddReceiptRecipient}
              disabled={!canEdit("configurations")}
            >
              Add recipient
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bioinformatics Workflow Notifications</CardTitle>
          <CardDescription>
            Email addresses that receive an automatic alert when a client submits a Laboratory inquiry with the <strong>Complete molecular workflow with Bioinformatics Analysis</strong> workflow and fills out the "Configure Bioinformatics Analysis" form.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(settings?.bioinformaticsWorkflowNotifications || []).length ? (
              (settings!.bioinformaticsWorkflowNotifications!).map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => handleRemoveBioinfoRecipient(email)}
                    className="text-slate-500 hover:text-red-500"
                    disabled={!canEdit("configurations")}
                  >
                    &times;
                  </button>
                </span>
              ))
            ) : (
              <p className="text-xs text-slate-400">No recipients configured.</p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Add recipient email"
              value={bioinfoEmailInput}
              onChange={(e) => setBioinfoEmailInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddBioinfoRecipient(); } }}
              className="sm:flex-1"
              disabled={!canEdit("configurations")}
            />
            <Button
              onClick={handleAddBioinfoRecipient}
              disabled={!canEdit("configurations")}
            >
              Add recipient
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
