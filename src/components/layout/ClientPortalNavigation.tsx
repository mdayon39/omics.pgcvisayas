"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  FolderOpen,
  HelpCircle,
  Home,
  Plus,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import { cn } from "@/lib/utils";

interface ClientPortalNavigationProps {
  user: User;
  children: ReactNode;
}

const links = [
  { href: "/client", label: "Overview", icon: Home, exact: true },
  { href: "/client/inquiry-request", label: "Inquiry request", icon: Plus },
  { href: "/client/client-info", label: "Client information", icon: UserRound },
  { href: "/client/project-info", label: "Project information", icon: FolderOpen },
];

export function ClientPortalNavigation({
  user,
  children,
}: ClientPortalNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const displayName = user.displayName?.trim() || user.email || "Client";
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const hasProjectContext = Boolean(
    searchParams.get("email") && searchParams.get("inquiryId"),
  );
  const visibleLinks = links.filter(
    ({ href }) => href !== "/client/project-info" || hasProjectContext,
  );

  const hrefWithContext = (href: string) => {
    if (href === "/client") return href;
    const query = searchParams.toString();
    return query ? `${href}?${query}` : href;
  };

  const newInquiryHref = () => {
    const params = new URLSearchParams();
    if (user.email) params.set("email", user.email);
    const returnInquiryId =
      searchParams.get("returnInquiryId") || searchParams.get("inquiryId");
    if (returnInquiryId) params.set("returnInquiryId", returnInquiryId);
    params.set("returnToPortal", "true");
    return `/client/inquiry-request?${params.toString()}`;
  };

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const navigationLinks = (compact = false) =>
    visibleLinks.map(({ href, label, icon: Icon, exact }) => {
      const active = isActive(href, exact);
      return (
        <Link
          key={href}
          href={
            href === "/client/inquiry-request"
              ? newInquiryHref()
              : hrefWithContext(href)
          }
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            active
              ? "bg-[#EAF2FB] text-[#1B6AB1]"
              : "text-[#475467] hover:bg-[#F7F8FA] hover:text-[#1B2330]",
            compact && "shrink-0 whitespace-nowrap px-3 py-2",
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </Link>
      );
    });

  return (
    <>
      <aside className="hidden w-[280px] shrink-0 flex-col border-r border-[#E4E7EC] bg-white md:flex xl:w-[300px]">
        <Link
          href="/client"
          className="flex items-center gap-3 border-b border-[#E4E7EC] px-5 py-4"
          aria-label="Client portal home"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white">
            <Image
              src="/assets/pgc-logo.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 object-contain"
            />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] font-semibold leading-4 tracking-wide text-[#1B2330]">
              PHILIPPINE GENOME CENTER
            </span>
            <span className="mt-0.5 block text-xs text-[#667085]">
              Visayas Client Portal
            </span>
          </span>
        </Link>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4">
          <div className="flex items-center gap-3 rounded-lg px-2 py-3">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#EAF2FB] text-sm font-semibold text-[#1B6AB1]">
              {initials}
              <span
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#2FA66A]"
                aria-label="Signed in"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[#1B2330]">
                {displayName}
              </span>
              <span className="block truncate text-xs text-[#667085]">
                {user.email}
              </span>
            </span>
          </div>

          <p className="mb-2 mt-5 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#667085]">
            Workspace
          </p>
          <nav aria-label="Client portal navigation" className="space-y-1">
            {navigationLinks()}
          </nav>

          <div className="mt-auto pt-6">
            <div className="rounded-xl border border-[#E4E7EC] bg-[#F7F8FA] p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#1B2330]">
                <HelpCircle className="h-4 w-4 text-[#1B6AB1]" aria-hidden="true" />
                Need assistance?
              </div>
              <p className="mb-3 mt-1 text-xs leading-5 text-[#667085]">
                Find guidance on inquiries, project forms, and sample submissions.
              </p>
              <Link
                href="/faqs"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B6AB1] hover:text-[#155A98]"
              >
                Visit FAQs
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
            <Link
              href={newInquiryHref()}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#1B6AB1] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#155A98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B6AB1]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New inquiry
            </Link>
          </div>
        </div>
      </aside>

      <nav
        aria-label="Client portal navigation"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-[#E4E7EC] bg-white px-3 py-2 md:hidden"
      >
        {navigationLinks(true)}
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <main className="relative min-h-0 flex-1 overflow-y-auto bg-[#F5F6F8]">
          {children}
        </main>
      </div>
    </>
  );
}
