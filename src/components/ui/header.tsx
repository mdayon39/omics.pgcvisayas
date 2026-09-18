// src/components/ui/header.tsx
import Image from "next/image";
import Link from "next/link";
import { LogOut, User, Settings, Info, Key, ChevronDown, Menu, HelpCircle } from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { PortalFeatureVisibility } from "@/types/ConfigurationSettings";

export interface HeaderProps {
  showNavigation?: boolean;
  user?: {
    displayName?: string | null;
    email?: string | null;
  } | null;
  onLogout?: () => void;
  menuVisibility?: PortalFeatureVisibility;
  extras?: React.ReactNode;
}

export default function Header({
  user,
  onLogout,
  showNavigation = true,
  menuVisibility,
  extras,
}: HeaderProps) {
  const menuFlags = menuVisibility ?? {
    clientMenuSettings: true,
    clientMenuChangePassword: true,
    clientMenuAbout: true,
    sampleForms: true,
    serviceReports: true,
    officialReceipts: true,
  };

  return (
    <header className="bg-white/90 backdrop-blur-md shadow-sm border-b border-slate-100 sticky top-0 z-50">
      <div className="w-full px-4 py-3">
        <div className="flex justify-between items-center px-2">
          {/* Logo Section */}
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center">
              <Image
                src="/assets/pgc-logo.png"
                alt="Philippine Genome Center Logo"
                width={120}
                height={75}
                className="object-contain"
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

          {/* User Dropdown Section */}
          {showNavigation && user && (
            <div className="flex items-center gap-2">
              {/* Extra slot: FAQs button, notification bell, etc. */}
              {extras}

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
                  {menuFlags.clientMenuSettings && (
                    <DropdownMenuItem className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-slate-700 hover:bg-slate-50 transition-colors">
                      <Settings className="w-4 h-4 text-[#166FB5]" />
                      <span className="font-medium">Settings</span>
                    </DropdownMenuItem>
                  )}
                  
                  {menuFlags.clientMenuChangePassword && (
                    <DropdownMenuItem
                      onClick={() => window.dispatchEvent(new CustomEvent("open-change-password"))}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Key className="w-4 h-4 text-purple-600" />
                      <span className="font-medium">Change Password</span>
                    </DropdownMenuItem>
                  )}
                  
                  {menuFlags.clientMenuAbout && (
                    <DropdownMenuItem className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-slate-700 hover:bg-slate-50 transition-colors">
                      <Info className="w-4 h-4 text-orange-600" />
                      <span className="font-medium">About</span>
                    </DropdownMenuItem>
                  )}
                  
                  <DropdownMenuSeparator className="my-1.5 bg-slate-100" />
                  
                  <DropdownMenuItem 
                    onClick={onLogout}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer text-[#B9273A] hover:bg-[#B9273A]/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="font-bold">Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
