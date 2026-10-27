import React, { useState } from "react";
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Language } from "../locales";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export function AuthModal({ isOpen, onClose, lang }: AuthModalProps) {
  const { currentUser, isConfigured, signIn, signUp, signInWithGoogle, signOut } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isConfigured) {
      setErrorMessage(
        lang === "bn"
          ? "লগইন সিস্টেম চালু করতে ফায়ারবেস API কী প্রয়োজন (Firebase API Key is required to enable login)। অনুগ্রহ করে src/lib/firebase.ts ফাইলে API কী সেট করুন।"
          : "Firebase API Key is required to enable login. Please set your API key in src/lib/firebase.ts."
      );
      return;
    }

    if (!email.trim() || !password.trim()) {
      setErrorMessage(
        lang === "bn"
          ? "অনুগ্রহ করে ইমেইল এবং পাসওয়ার্ড পূরণ করুন।"
          : "Please enter both email and password."
      );
      return;
    }

    if (password.length < 6) {
      setErrorMessage(
        lang === "bn"
          ? "পাসওয়ার্ড ন্যূনতম ৬ অক্ষরের হতে হবে।"
          : "Password must be at least 6 characters."
      );
      return;
    }

    setIsLoading(true);

    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
        setSuccessMessage(lang === "bn" ? "সফলভাবে লগইন হয়েছে!" : "Signed in successfully!");
        setTimeout(() => onClose(), 800);
      } else {
        await signUp(email.trim(), password, displayName.trim());
        setSuccessMessage(lang === "bn" ? "একাউন্ট সফলভাবে তৈরি হয়েছে!" : "Account created successfully!");
        setTimeout(() => onClose(), 800);
      }
    } catch (err: any) {
      console.error("[AuthModal] Error:", err);
      let msg = err?.message || "Authentication failed.";
      if (err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password") {
        msg = lang === "bn" ? "ভুল ইমেইল অথবা পাসওয়ার্ড।" : "Invalid email or password.";
      } else if (err?.code === "auth/email-already-in-use") {
        msg = lang === "bn" ? "এই ইমেইলটি ইতিমধ্যে ব্যবহৃত হচ্ছে।" : "This email is already in use.";
      } else if (err?.code === "auth/user-not-found") {
        msg = lang === "bn" ? "কোনো একাউন্ট পাওয়া যায়নি।" : "No user found with this email.";
      }
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isConfigured) {
      setErrorMessage(
        lang === "bn"
          ? "লগইন সিস্টেম চালু করতে ফায়ারবেস API কী প্রয়োজন (Firebase API Key is required to enable login)। অনুগ্রহ করে src/lib/firebase.ts ফাইলে API কী সেট করুন।"
          : "Firebase API Key is required to enable login. Please set your API key in src/lib/firebase.ts."
      );
      return;
    }

    setIsLoading(true);
    try {
      await signInWithGoogle();
      setSuccessMessage(lang === "bn" ? "গুগল সাইন-ইন সফল হয়েছে!" : "Google Sign-In successful!");
      setTimeout(() => onClose(), 800);
    } catch (err: any) {
      console.error("[AuthModal] Google Sign-In Error:", err);
      setErrorMessage(err?.message || "Google Sign-In failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await signOut();
      setSuccessMessage(lang === "bn" ? "সফলভাবে সাইন আউট হয়েছে।" : "Signed out successfully.");
      setTimeout(() => onClose(), 600);
    } catch (err: any) {
      setErrorMessage(err?.message || "Sign-out failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-stone-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800 bg-stone-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                {currentUser
                  ? lang === "bn"
                    ? "ব্যবহারকারী প্রোফাইল"
                    : "User Profile"
                  : mode === "signin"
                  ? lang === "bn"
                    ? "নেটফ্লো একাউন্টে সাইন ইন করুন"
                    : "Sign in to NETFLOW"
                  : lang === "bn"
                  ? "নতুন একাউন্ট তৈরি করুন"
                  : "Create NETFLOW Account"}
              </h2>
              <p className="text-[11px] text-stone-400">
                {lang === "bn"
                  ? "Google Firebase Authentication দ্বারা সুরক্ষিত"
                  : "Secured with Google Firebase Authentication"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Firebase Config Guide Notice if keys are placeholders */}
        {!isConfigured && !currentUser && (
          <div className="mx-5 mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <p className="font-semibold text-amber-300">
                {lang === "bn"
                  ? "লগইন সিস্টেম চালু করতে ফায়ারবেস API কী প্রয়োজন"
                  : "Firebase API Key is required to enable login"}
              </p>
              <p className="mt-0.5 text-stone-300 text-[11px]">
                {lang === "bn"
                  ? "Firebase Console থেকে আপনার প্রজেক্টের আসল Web API কী এনে src/lib/firebase.ts ফাইলে পেস্ট করুন।"
                  : "Please get your Web API keys from Firebase Console and paste them into src/lib/firebase.ts."}
              </p>
            </div>
          </div>
        )}

        {/* Logged in state */}
        {currentUser ? (
          <div className="p-5 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-600/30 border-2 border-emerald-500 flex items-center justify-center text-emerald-300 mb-3 text-xl font-bold">
              {currentUser.displayName
                ? currentUser.displayName[0].toUpperCase()
                : currentUser.email
                ? currentUser.email[0].toUpperCase()
                : "U"}
            </div>
            <h3 className="text-base font-bold text-white mb-0.5">
              {currentUser.displayName || (lang === "bn" ? "নেটফ্লো ব্যবহারকারী" : "NETFLOW User")}
            </h3>
            <p className="text-xs text-stone-400 font-mono mb-4">{currentUser.email}</p>

            <div className="w-full bg-stone-850 rounded-xl p-3 border border-stone-800 text-left mb-5 text-xs space-y-1.5">
              <div className="flex justify-between text-stone-400">
                <span>UID:</span>
                <span className="font-mono text-stone-300">{currentUser.uid.slice(0, 12)}...</span>
              </div>
              <div className="flex justify-between text-stone-400">
                <span>Status:</span>
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-750 text-rose-400 hover:text-rose-300 text-xs font-semibold transition-colors border border-stone-700/60 flex items-center justify-center gap-2"
            >
              <LogIn className="w-3.5 h-3.5 rotate-180" />
              <span>{lang === "bn" ? "সাইন আউট করুন" : "Sign Out"}</span>
            </button>
          </div>
        ) : (
          /* Sign In / Sign Up Form */
          <div className="p-5 flex flex-col">
            {/* Tabs */}
            <div className="flex rounded-xl bg-stone-800 p-1 mb-4 border border-stone-750">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setErrorMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "signin"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                {lang === "bn" ? "সাইন ইন" : "Sign In"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setErrorMessage(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "signup"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                {lang === "bn" ? "নতুন একাউন্ট" : "Sign Up"}
              </button>
            </div>

            {/* Error & Success Messages */}
            {errorMessage && (
              <div className="mb-3 p-2.5 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            {successMessage && (
              <div className="mb-3 p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "signup" && (
                <div>
                  <label className="block text-xs font-medium text-stone-300 mb-1">
                    {lang === "bn" ? "আপনার নাম" : "Your Name"}
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={lang === "bn" ? "উদা: মো. আজিজুল" : "e.g. John Doe"}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-stone-800 border border-stone-700 text-stone-100 placeholder-stone-500 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  {lang === "bn" ? "ইমেইল ঠিকানা" : "Email Address"}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-stone-800 border border-stone-700 text-stone-100 placeholder-stone-500 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  {lang === "bn" ? "পাসওয়ার্ড" : "Password"}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-9 py-2 rounded-xl bg-stone-800 border border-stone-700 text-stone-100 placeholder-stone-500 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 mt-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-800 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : mode === "signin" ? (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>{lang === "bn" ? "লগইন করুন" : "Sign In"}</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>{lang === "bn" ? "একাউন্ট তৈরি করুন" : "Create Account"}</span>
                  </>
                )}
              </button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-800" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-stone-900 px-2 text-stone-500">
                  {lang === "bn" ? "অথবা" : "or continue with"}
                </span>
              </div>
            </div>

            {/* Google Sign In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-stone-800 hover:bg-stone-750 border border-stone-700 text-stone-200 text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {/* Google G Logo SVG */}
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{lang === "bn" ? "Google দিয়ে সাইন ইন করুন" : "Sign in with Google"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
