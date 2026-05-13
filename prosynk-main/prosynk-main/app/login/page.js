"use client";

import { useState, useEffect } from "react";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
//import { createClient } from "../../lib/supabaseClient";
import { supabase } from "../../lib/supabaseClient";
export default function LoginPage() {
  const router = useRouter();
  //const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  // --- FIXES: Clear fields, prevent caching, handle back button ---
  useEffect(() => {
    // Clear fields on mount
    setEmail("");
    setPassword("");

    // Disable autocomplete
    const inputs = document.querySelectorAll("input");
    inputs.forEach((input) =>
      input.setAttribute(
        "autocomplete",
        input.type === "password" ? "new-password" : "off"
      )
    );

    // Intercept back button
    window.history.pushState(null, "", window.location.href);
    window.onpopstate = () => {
      router.replace("/"); // Redirect to start page
    };

    // Handle bfcache (back-forward cache)
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        setEmail("");
        setPassword("");
      }
    });
  }, []);

  // --- LOGIN FUNCTION ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (!data || !data.user) {
        setError("Login failed. Please check your credentials.");
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile || !profile.role) {
        setError("User profile data incomplete (Role missing).");
        setLoading(false);
        return;
      }

      const userRole = profile.role.toLowerCase();
      if (userRole === "headpm") router.replace("/dashboard/headpm");
      else if (userRole === "employee") router.replace("/dashboard/employee");
      else {
        setError("Invalid or unsupported user role: " + profile.role);
        setLoading(false);
      }
    } catch (err) {
      setError("An unexpected error occurred during login.");
      setLoading(false);
    }
  };

  // --- FORGOT PASSWORD FUNCTION ---
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) setError(error.message);
      else setResetSuccess(true);
    } catch (err) {
      setError("Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  // --- RENDER FORGOT PASSWORD ---
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#163853] via-[#1e4a63] to-[#163853] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <span className="text-3xl font-bold text-[#163853]">P</span>
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Reset Password</h1>
              <p className="text-slate-300">Enter your email to receive a reset link</p>
            </div>

            {resetSuccess ? (
              <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 mb-6">
                <p className="text-green-300 text-sm">
                  Password reset link sent! Check your email inbox.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {error && (
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-red-300 text-sm">{error}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-white/40 transition"
                      placeholder="your.email@example.com"
                      required
                      autoComplete="off"
                    />
                  </div>
                </div>
                <button
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="w-full py-3 bg-white text-[#163853] rounded-lg font-semibold hover:bg-slate-100 transition duration-300 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </div>
            )}

            <button
              onClick={() => {
                setShowForgotPassword(false);
                setResetSuccess(false);
                setError("");
                setEmail("");
                setPassword("");
              }}
              className="w-full mt-4 text-slate-300 hover:text-white transition text-sm"
            >
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RENDER LOGIN FORM ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#163853] via-[#1e4a63] to-[#163853] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-3xl font-bold text-[#163853]">P</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
            <p className="text-slate-300">Sign in to your ProSynk account</p>
          </div>

          <div className="space-y-6">
            {error && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-white/40 transition"
                  placeholder="your.email@example.com"
                  required
                  autoComplete="off"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-white/40 transition"
                  placeholder="Enter your password"
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-white/20 bg-white/10 text-white focus:ring-2 focus:ring-white/20" />
                <span className="text-sm text-slate-300">Remember me</span>
              </label>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-slate-300 hover:text-white transition"
              >
                Forgot password?
              </button>
            </div>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 bg-white text-[#163853] rounded-lg font-semibold hover:bg-slate-100 transition duration-300 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-slate-300 text-sm">
              Don't have an account?{" "}
              <a href="/signup" className="text-white font-semibold hover:underline">
                Sign up
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
