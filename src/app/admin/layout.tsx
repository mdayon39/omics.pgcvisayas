// src/app/admin/layout.tsx
"use client";

import { AdminSidebar } from "@/components/layout/AdminSidebar";
import { TabBar } from "@/components/layout/TabBar";
import { TabContent } from "@/components/layout/TabContent";
import { MessageNotificationCenter } from "@/components/layout/MessageNotificationCenter";
import GlobalChatWidget from "@/components/chat/GlobalChatWidget";
import AdminChatWidget from "@/components/chat/AdminChatWidget";
import { TabProvider } from "@/contexts/TabContext";
import { Toaster } from "@/components/ui/sonner";
import useAuth from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LogOut, Settings, Info, Key, Menu } from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, signOut, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    } else if (!loading && user && !isAdmin) {
      router.replace("/client/inquiry-request");
    }
  }, [user, isAdmin, loading, router]);

  if (loading || !user || !isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-6 relative overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-[#F69122]/10 to-[#912ABD]/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-[#166FB5]/10 to-[#4038AF]/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        </div>
        
        <div className="relative z-10 text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-r from-[#F69122] via-[#B9273A] to-[#912ABD] rounded-full flex items-center justify-center mx-auto animate-spin">
            <div className="w-8 h-8 bg-white rounded-full"></div>
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-700">Checking access...</p>
            <p className="text-sm text-muted-foreground">Please wait while we verify your permissions</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TabProvider>
      <div className="flex flex-col h-screen bg-slate-50/30 overflow-hidden">
        {/* New Consolidated Top Header */}
        <header className="bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-100 sticky top-0 z-50">
          <div className="w-full px-4 py-3">
            <div className="flex justify-between items-center px-2">
              {/* Logo Section */}
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center">
                  <img
                    src="/assets/pgc-logo.png"
                    alt="Philippine Genome Center Logo"
                    className="w-[90px] h-[55px] object-contain"
                  />
                </div>
                <div className="hidden md:block">
                  <div className="text-sm font-semibold bg-gradient-to-r from-[#166FB5] to-[#4038AF] bg-clip-text text-transparent uppercase tracking-wider">
                    PHILIPPINE GENOME CENTER VISAYAS
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    UNIVERSITY OF THE PHILIPPINES VISAYAS, MIAGAO, ILOILO
                  </div>
                </div>
              </div>

              {/* Right Header Content */}
              <div className="flex items-center gap-4">
                <MessageNotificationCenter />
                
                {/* Admin Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="p-2 hover:bg-slate-100 rounded-lg transition-colors border border-slate-100"
                    >
                      <Menu className="w-6 h-6 text-[#166FB5]" />
                    </Button>
                  </DropdownMenuTrigger>
                  
                  <DropdownMenuContent className="w-[200px] mt-2 p-1.5 rounded-xl border-slate-200" align="end">
                    <DropdownMenuItem className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-slate-700 hover:bg-slate-50 transition-colors">
                      <Settings className="w-4 h-4 text-[#166FB5]" />
                      <span className="font-medium">Settings</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-slate-700 hover:bg-slate-50 transition-colors">
                      <Key className="w-4 h-4 text-purple-600" />
                      <span className="font-medium">Change Password</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-slate-700 hover:bg-slate-50 transition-colors">
                      <Info className="w-4 h-4 text-orange-600" />
                      <span className="font-medium">About</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuSeparator className="my-1.5 bg-slate-100" />
                    
                    <DropdownMenuItem 
                      onClick={signOut}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-[#B9273A] hover:bg-[#B9273A]/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="font-bold">Logout</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <AdminSidebar />
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Tab Bar Container */}
            <div className="bg-white border-b border-slate-200 z-10">
              <TabBar />
            </div>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto bg-gradient-to-br from-slate-50/30 via-blue-50/20 to-indigo-50/30">
              <TabContent>{children}</TabContent>
            </main>
          </div>
        </div>
        <GlobalChatWidget />
        <AdminChatWidget />
        <Toaster />
      </div>
    </TabProvider>
  );
}