//src/app/client/layout.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useAuth from "@/hooks/useAuth";
import Header from "@/components/ui/header";
import Link from "next/link";
import { CreditCard, HelpCircle } from "lucide-react";
import {
  DEFAULT_PORTAL_FEATURES,
  getConfigurationSettings,
} from "@/services/configurationSettingsService";
import { ConfigurationSettings } from "@/types/ConfigurationSettings";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, signOut, loading } = useAuth();
  const router = useRouter();
  const [configSettings, setConfigSettings] = useState<ConfigurationSettings | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      try {
        const data = await getConfigurationSettings();
        if (isMounted) setConfigSettings(data);
      } catch (error) {
        console.error("Failed to load configuration settings:", error);
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      // If not logged in, but on /client/client-info, redirect to /portal instead of /login
      if (typeof window !== 'undefined' && window.location.pathname === '/client/client-info') {
        router.replace('/portal');
      } else {
        router.replace('/login');
      }
    } else if (!loading && user && isAdmin) {
      router.replace("/admin/dashboard");
    }
  }, [user, isAdmin, loading, router]);

  if (loading || !user || isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <p className="text-sm text-muted-foreground">Checking access...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <Header
        user={user}
        onLogout={signOut}
        menuVisibility={configSettings?.portalFeatures ?? DEFAULT_PORTAL_FEATURES}
        extras={
          <div className="flex items-center gap-1">
            {/* FAQs shortcut */}
            <Link
              href="/faqs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-[#166FB5] hover:bg-slate-100 rounded-lg transition-colors border border-slate-100"
              title="Frequently Asked Questions"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">FAQs</span>
            </Link>
            <a
              href="https://firebasestorage.googleapis.com/v0/b/pgc-genomebase.firebasestorage.app/o/documents%2Fmode_of_payment.pdf?alt=media&token=279c10a9-ce74-40ef-8e7d-80a86820a8e0"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-[#166FB5] hover:bg-slate-100 rounded-lg transition-colors border border-slate-100"
              title="Mode of Payment"
            >
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">Mode of Payment</span>
            </a>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto relative">
        {children}
      </main>
    </div>
  );
}
