import React, { useState } from "react";
import { motion } from "motion/react";
import { LogIn, ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { UserProfile } from "../types";
import Tooltip from "./Tooltip";

interface LoginProps {
  onLoginSuccess: (profile: UserProfile) => void;
  isDarkMode?: boolean;
}

export default function LoginScreen({ onLoginSuccess, isDarkMode = false }: LoginProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError("Please enter your username to continue.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Authentication failed. Please check your username.");
      }

      if (data.token) {
        localStorage.setItem("adwords_token", data.token);
      }

      onLoginSuccess(data.profile);
    } catch (err: any) {
      setError(err.message || "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-screen-container" className="flex flex-col items-center justify-center min-h-[72vh] px-4">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className={`p-8 rounded-2xl border shadow-2xl transition-all duration-300 backdrop-blur-xl ${
            isDarkMode 
              ? "bg-slate-900/90 border-cyan-500/20 shadow-cyan-950/40" 
              : "bg-white border-slate-200 shadow-slate-200/80"
          }`}
        >
          {/* Brand header */}
          <div className="flex flex-col items-center mb-7 text-center">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3.5 border ${
              isDarkMode 
                ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" 
                : "bg-indigo-50 border-indigo-200 text-indigo-700"
            }`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className={`text-xl font-bold tracking-[0.15em] uppercase font-mono ${
              isDarkMode ? "text-white" : "text-slate-900"
            }`}>
              ADWORDS
            </h1>
            <p className={`text-xs font-mono mt-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
              Leave & Roster Coordinator
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label 
                htmlFor="username-input" 
                className={`block text-xs font-mono uppercase tracking-wider mb-2 font-semibold ${
                  isDarkMode ? "text-slate-300" : "text-slate-700"
                }`}
              >
                Username
              </label>
              <input
                id="username-input"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter username"
                disabled={loading}
                className={`w-full px-4 py-3 rounded-xl border text-sm font-mono transition-all duration-200 focus:outline-none focus:ring-2 ${
                  isDarkMode
                    ? "bg-slate-950/80 border-white/10 text-white placeholder-slate-600 focus:border-cyan-400 focus:ring-cyan-400/20"
                    : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:ring-indigo-600/20"
                }`}
              />
              <p className={`text-[11px] font-mono mt-2 ${isDarkMode ? "text-slate-500" : "text-slate-500"}`}>
                Enter your assigned username to access the portal.
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className={`p-3 rounded-xl border text-xs font-mono flex items-start gap-2 ${
                  isDarkMode 
                    ? "bg-red-500/10 border-red-500/30 text-red-400" 
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </motion.div>
            )}

            <Tooltip text="Submit credentials to sign in" isDarkMode={isDarkMode} position="bottom">
              <button
                id="sign-in-button"
                type="submit"
                disabled={loading}
                className={`w-full py-3 px-4 rounded-xl font-mono text-xs uppercase tracking-widest font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-lg active:scale-[0.98] ${
                  isDarkMode
                    ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25 border border-cyan-400/30"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/25 border border-indigo-700"
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </Tooltip>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
