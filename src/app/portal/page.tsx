// Client Login Page
// Allows users to sign in with Google, agree to privacy, and verify their password to access project/client forms.

"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";
import { markInquiryAsLoggedIn } from "@/services/inquiryService";
import { logActivity } from "@/services/activityLogService";

import { Shield, CheckCircle, AlertTriangle, Mail, Home } from "lucide-react";
import Link from "next/link";

const MASTER_EMAILS = ["madayon1@up.edu.ph", "merlito.dayon@gmail.com"];
const ALLOWED_INQUIRY_STATUSES = [
  "Pending",
  "Approved Client",
  "Quotation Only",
  "Ongoing Quotation",
  "In Progress",
  "Service Not Offered",
] as const;

type PortalInquiryRecord = {
  email?: string;
  name?: string;
  isApproved?: boolean;
  status?: string;
  customPassword?: string;
};

export default function ClientVerifyPage() {
  // State for privacy agreement, inquiry ID, errors, loading, and Google user
  const [agreed, setAgreed] = useState(false);
  const [inquiryId, setInquiryId] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [googleUser, setGoogleUser] = useState<{
    email: string;
    uid: string;
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotErrorModal, setForgotErrorModal] = useState<string | null>(null);
  const router = useRouter();

  const handleForgotPassword = async () => {
    if (!googleUser?.email) return;
    setForgotSending(true);
    setForgotSent(false);
    setForgotErrorModal(null);
    try {
      const res = await fetch("/api/portal/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: googleUser.email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data.error || "Failed to send recovery email.";
        setForgotErrorModal(message);
        return;
      }
      setForgotSent(true);
      toast.success("Recovery email sent! Check your inbox.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send recovery email.";
      setForgotErrorModal(message);
    } finally {
      setForgotSending(false);
    }
  };

  // Handle Google sign-in and set user
  const handleGoogleSignIn = async () => {
    if (!agreed) {
      const message =
        "Please agree to the privacy notice before signing in with Google.";
      setVerifyError(message);
      toast.warning(message);
      return;
    }
    setVerifyError("");
    setVerifying(true);
    try {
      const provider = new GoogleAuthProvider();
      // Forces account selection to ensure a fresh session and better error reporting
      provider.setCustomParameters({ prompt: "select_account" });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user.email) {
        throw new Error("Google account has no email.");
      }
      setGoogleUser({ email: user.email, uid: user.uid });
    } catch (err: any) {
      const code: string = err?.code ?? "";
      console.error("Google sign-in error:", code, err);
      const domain =
        typeof window !== "undefined" ? window.location.hostname : "unknown";

      let message = "Google sign-in failed. Please try again.";
      if (code === "auth/popup-blocked") {
        message = "Popup blocked! Please allow popups for this site.";
      } else if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        message = "Sign-in was cancelled.";
      } else if (code === "auth/unauthorized-domain") {
        message = `Domain "${domain}" is not authorized in Firebase Console.`;
      } else if (code) {
        message = `Google sign-in failed (${code}).`;
      } else if (err?.message) {
        message = err.message;
      }

      setVerifyError(message);
      toast.error(message);
    } finally {
      setVerifying(false);
    }
  };

  // Handle verification of Inquiry ID and permissions
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      const message = "Please agree to the privacy notice.";
      setVerifyError(message);
      toast.warning(message);
      return;
    }
    setVerifyError("");
    setVerifying(true);
    try {
      if (!googleUser?.email) {
        const message = "Please sign in with Google first.";
        setVerifyError(message);
        toast.error(message);
        setVerifying(false);
        return;
      }
      if (!inquiryId) {
        const message = "Please enter your password.";
        setVerifyError(message);
        toast.error(message);
        setVerifying(false);
        return;
      }
      // Determine the active password and resolve the primary inquiry
      const isMasterAdmin = googleUser.email
        ? MASTER_EMAILS.includes(googleUser.email)
        : false;
      let resolvedInquiryId: string = inquiryId;
      let inquiry: PortalInquiryRecord | null = null;

      if (isMasterAdmin) {
        // Master admins: direct document lookup, no password restriction
        const directDoc = await getDoc(doc(db, "inquiries", inquiryId));
        if (directDoc.exists()) {
          inquiry = directDoc.data() as PortalInquiryRecord;
          resolvedInquiryId = directDoc.id;
        }
      } else {
        // UUID is optional on inquiries. Resolve the entered inquiry ID
        // directly, then verify ownership through the signed-in email.
        const [directInquiryDoc, emailSnap] = await Promise.all([
          getDoc(doc(db, "inquiries", inquiryId)),
          getDocs(
            query(
              collection(db, "inquiries"),
              where("email", "==", googleUser.email),
            ),
          ),
        ]);

        const docsById = new Map(
          [
            ...emailSnap.docs,
            ...(directInquiryDoc.exists() ? [directInquiryDoc] : []),
          ].map((inquiryDoc) => [inquiryDoc.id, inquiryDoc]),
        );

        const normalizedGoogleEmail = googleUser.email.trim().toLowerCase();
        const allDocs = [...docsById.values()].filter((d) => {
          const inquiryEmail = (d.data().email as string | undefined)
            ?.trim()
            .toLowerCase();
          return inquiryEmail === normalizedGoogleEmail;
        });

        // Sort ascending by createdAt — oldest = primary / original inquiry
        const sorted = [...allDocs].sort((a, b) => {
          const tsA = a.data().createdAt;
          const tsB = b.data().createdAt;
          const msA = tsA?.toMillis?.() ?? (tsA ? Number(tsA) : 0);
          const msB = tsB?.toMillis?.() ?? (tsB ? Number(tsB) : 0);
          return msA - msB;
        });

        let authenticated = false;

        // 1. Check if any inquiry has a customPassword matching the entered value
        const withCustomPw = allDocs.find(
          (d) =>
            d.data().customPassword &&
            inquiryId === (d.data().customPassword as string),
        );

        if (withCustomPw) {
          authenticated = true;
        } else if (!allDocs.some((d) => d.data().customPassword)) {
          // Before a custom password is set, any owned inquiry ID is valid.
          authenticated = allDocs.some((d) => inquiryId === d.id);
        }

        if (authenticated && sorted.length > 0) {
          // Always navigate to the primary inquiry after login
          resolvedInquiryId = sorted[0].id;
          inquiry = sorted[0].data() as PortalInquiryRecord;
        }
      }

      if (!inquiry) {
        const message =
          "Incorrect password. Please check your credentials or use \u2018Forgot your password?\u2019.";
        setVerifyError(message);
        toast.error(message);
        setVerifying(false);
        return;
      }

      // Allow login for Pending, Approved Client (isApproved), Quotation Only, Ongoing Quotation, In Progress, and Service Not Offered
      const isAllowed =
        inquiry.isApproved ||
        ALLOWED_INQUIRY_STATUSES.includes(
          (inquiry.status || "") as (typeof ALLOWED_INQUIRY_STATUSES)[number],
        );

      if (!isAllowed) {
        const message =
          "This inquiry is not currently eligible for portal access.";
        setVerifyError(message);
        toast.error(message);
        setVerifying(false);
        return;
      }

      // When master admin logs in, impersonate the inquiry's email to see their data accurately
      const activeEmail = isMasterAdmin ? inquiry.email : googleUser.email;

      const params = new URLSearchParams();
      if (activeEmail) params.set("email", activeEmail);
      params.set("inquiryId", resolvedInquiryId);

      // Default to workspace view; do not preselect a project on login.

      // Mark as logged in if not admin
      // Check if it's a client login (not an admin bypass)
      const isClientLogin = !isMasterAdmin;

      if (isClientLogin) {
        console.log(
          `[Portal] Client login detected for inquiry ${resolvedInquiryId}. Marking as logged in.`,
        );
        await markInquiryAsLoggedIn(resolvedInquiryId);

        // Log the successful login
        await logActivity({
          userId: googleUser.email,
          userEmail: googleUser.email,
          userName: inquiry.name,
          userRole: "client",
          action: "LOGIN",
          entityType: "inquiry",
          entityId: resolvedInquiryId,
          entityName: inquiry.name,
          description: `Client logged into portal using password for Inquiry ID: ${resolvedInquiryId}`,
        });
      }

      router.push(`/client/client-info?${params.toString()}`);
    } catch {
      const message =
        "Login failed. Please check your password and Google account.";
      setVerifyError(message);
      toast.error(message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4 py-4 md:py-8 relative"
      style={{
        background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
      }}
    >
      {/* Back Home Button */}
      <div className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2 md:left-8 md:translate-x-0">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-white/80 hover:bg-white rounded-full border border-slate-200 text-slate-600 text-xs md:text-sm font-semibold transition-all shadow-sm hover:shadow group"
        >
          <Home className="w-3.5 h-3.5 md:w-4 md:h-4 transition-transform group-hover:scale-110" />
          Back Home
        </Link>
      </div>

      <div className="w-full max-w-md py-2">
        <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-2 pt-5">
            {/* PGC Logo */}
            <div className="flex justify-center mb-3">
              <Image
                src="/assets/pgc-logo.png"
                alt="PGC Logo"
                width={120}
                height={60}
                className="h-auto"
                priority
                sizes="(max-width: 640px) 100px, 120px"
              />
            </div>
            <CardTitle className="text-base lg:text-lg font-bold text-gray-800 uppercase tracking-tight">
              Client Portal Login
            </CardTitle>
            <p className="text-[10px] text-gray-500 mt-1 leading-relaxed max-w-xs mx-auto">
              Sign in with <strong>Google</strong> and enter your{" "}
              <strong>Password</strong> to access your project information.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pb-6">
            {verifyError && (
              <div
                className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] text-red-700"
                role="alert"
                aria-live="assertive"
              >
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            {/* Privacy Notice Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-gray-500 uppercase tracking-widest">
                <Shield className="w-3 h-3" />
                Privacy Notice
              </div>
              <div className="text-[10px] text-gray-500 bg-slate-50/50 p-2 rounded-md border border-slate-100 leading-relaxed shadow-inner">
                Your personal information will be processed in accordance with
                our privacy policy. Your data is used solely for project
                management and communication purposes.
              </div>
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="privacy-agreement"
                  checked={agreed}
                  onCheckedChange={(checked) => setAgreed(checked === true)}
                  className="mt-0.5 border-slate-300 h-3.5 w-3.5"
                />
                <label
                  htmlFor="privacy-agreement"
                  className="text-[10px] text-gray-500 leading-snug cursor-pointer select-none"
                >
                  I agree to the privacy notice and terms of service
                </label>
              </div>
            </div>

            <Separator className="opacity-50" />

            {/* Google Sign In Section */}
            <div className="space-y-2">
              <Button
                onClick={handleGoogleSignIn}
                disabled={verifying || !!googleUser}
                aria-label={
                  googleUser
                    ? `Signed in as ${googleUser.email}`
                    : "Sign in with Google"
                }
                className="w-full bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm transition-all duration-200 h-9 text-xs font-medium"
                variant="outline"
              >
                <Mail className="w-3.5 h-3.5 mr-2 text-slate-500" />
                {googleUser
                  ? `Signed in as ${googleUser.email}`
                  : "Sign in with Google"}
              </Button>
              {/* Show success if signed in */}
              {googleUser && (
                <div className="flex items-center gap-2 text-[10px] text-green-600 bg-green-50/50 p-2 rounded-md border border-green-100">
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  <span>Successfully authenticated</span>
                </div>
              )}

              {/* Forgot password — only shown after Google sign-in */}
              {googleUser && (
                <div className="text-center space-y-1">
                  {forgotSent ? (
                    <p className="text-[10px] text-green-600">
                      ✓ Recovery email sent to{" "}
                      <strong>{googleUser.email}</strong>. Check your inbox.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={forgotSending}
                      className="text-[10px] text-[#166FB5] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {forgotSending
                        ? "Sending recovery email…"
                        : "Forgot your password?"}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Verification Form Section */}
            {googleUser && (
              <>
                <Separator className="opacity-50" />
                <form onSubmit={handleVerify} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="inquiry-id"
                      className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest"
                    >
                      Password <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="inquiry-id"
                        type={showPassword ? "text" : "password"}
                        value={inquiryId}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setInquiryId(e.target.value.trim())
                        }
                        placeholder="Enter your unique password"
                        autoComplete="current-password"
                        aria-describedby="password-help"
                        maxLength={80}
                        required
                        className="transition-all duration-200 focus:ring-2 focus:ring-blue-500/20 h-9 text-xs border-slate-200 pr-20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 hover:bg-slate-100"
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <p className="text-[9px] text-slate-400 leading-tight">
                      <span id="password-help">
                        Check the email sent by PGC Visayas for your password.
                      </span>
                    </p>
                  </div>
                  <Button
                    type="submit"
                    disabled={verifying || !inquiryId.trim()}
                    className="w-full h-10 bg-gradient-to-r from-[#166FB5] to-[#4038AF] hover:translate-y-[-1px] active:translate-y-[0] text-white font-bold shadow-lg hover:shadow-xl transition-all duration-300 uppercase text-[10px] tracking-widest"
                  >
                    {verifying ? "Logging in..." : "Login to Portal"}
                  </Button>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Forgot Password — Email Not Found Modal */}
      <Dialog
        open={!!forgotErrorModal}
        onOpenChange={(open) => {
          if (!open) setForgotErrorModal(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              {forgotErrorModal?.startsWith("You have reached")
                ? "Password Recovery Limit Reached"
                : "Account Not Found"}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600 leading-relaxed pt-1">
              {forgotErrorModal}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              onClick={async () => {
                try {
                  await firebaseSignOut(auth);
                } catch {
                  /* ignore */
                }
                window.location.href = "/portal";
              }}
              className="w-full bg-[#166FB5] hover:bg-[#166FB5]/90"
            >
              Try a Different Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
