import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Cpu, BookOpen, LogOut, ShieldAlert
} from "lucide-react";
import { UserProfile } from "./types";
import LoginScreen from "./components/LoginScreen";
import DashboardAgent from "./components/DashboardAgent";
import DashboardAdmin from "./components/DashboardAdmin";
import UserManualModal from "./components/UserManualModal";
import Tooltip from "./components/Tooltip";

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isManualOpen, setIsManualOpen] = useState(false);
  // System is strictly Light Mode only
  const isDarkMode = false;
  const [rollingWindow, setRollingWindow] = useState<{ currentMonthIndex: number; currentYear: number; window: any[] }>({
    currentMonthIndex: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    window: []
  });
  const [loading, setLoading] = useState(true);

  // Synchronize documentElement light class and remove any legacy theme persistence
  useEffect(() => {
    try {
      localStorage.removeItem("adwords_theme");
      sessionStorage.removeItem("adwords_theme");
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    } catch (_) {}
  }, []);

  // Load user session on mount
  useEffect(() => {
    const stored = localStorage.getItem("adwords_session");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.username) {
          fetch(`/api/user/profile?username=${encodeURIComponent(parsed.username)}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data && data.profile) {
                setProfile(data.profile);
                localStorage.setItem("adwords_session", JSON.stringify(data.profile));
              } else {
                // User was deleted or is invalid in production datastore
                setProfile(null);
                localStorage.removeItem("adwords_session");
                localStorage.removeItem("adwords_token");
              }
            })
            .catch(() => {
              setProfile(null);
              localStorage.removeItem("adwords_session");
              localStorage.removeItem("adwords_token");
            });
        }
      } catch (e) {
        console.error("Failed to parse saved session:", e);
      }
    }
    fetchRollingWindow();
    setLoading(false);
  }, []);

  const fetchRollingWindow = async () => {
    try {
      const res = await fetch("/api/system/rolling-window");
      if (res.ok) {
        const data = await res.json();
        setRollingWindow(data);
      }
    } catch (err) {
      console.error("Error fetching rolling window:", err);
    }
  };

  const handleLoginSuccess = (userProfile: UserProfile) => {
    setProfile(userProfile);
    localStorage.setItem("adwords_session", JSON.stringify(userProfile));
  };

  const handleLogout = () => {
    setProfile(null);
    localStorage.removeItem("adwords_session");
    localStorage.removeItem("adwords_token");
  };

  if (loading) {
    return (
      <div id="loading-spinner" className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-600 font-mono text-xs gap-3">
        <Cpu className="w-8 h-8 text-indigo-600 animate-spin" />
        <span>INITIALIZING ADWORDS LEAVE BOOKING SYSTEM...</span>
      </div>
    );
  }

  // Strict production access control check: ADWORDSADMIN is the sole Administrator
  const isAdmin = profile?.role === "ADMIN" && profile?.username?.toUpperCase() === "ADWORDSADMIN";

  return (
    <div id="app-root" className="min-h-screen transition-colors duration-300 selection:bg-indigo-500/20 overflow-x-hidden antialiased font-sans bg-slate-100 text-slate-900">

      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* Universal Header */}
        <header id="main-header" className="border-b transition-all duration-300 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 border-slate-300 bg-white shadow-sm text-slate-900">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold tracking-[0.2em] font-mono text-black">ADWORDS</span>
              <span className="text-[10px] font-mono uppercase ml-2 px-1.5 py-0.5 rounded border bg-slate-100 text-slate-700 border-slate-300 font-bold">
                Leave Booking
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            {profile && (
              <Tooltip text={`Signed in as ${profile.fullName || profile.username} (${profile.role})`} isDarkMode={false}>
                <div id="user-session-badge" className="flex items-center gap-2.5 border px-3.5 py-1.5 rounded-xl bg-slate-100 border-slate-300 text-slate-800 font-bold">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow shadow-emerald-400/50" />
                  <span className="font-semibold">{profile.username}</span>
                  <span className="text-slate-400">•</span>
                  <span className={`uppercase font-bold ${isAdmin ? "text-indigo-700" : "text-slate-600"}`}>
                    {profile.role}
                  </span>
                </div>
              </Tooltip>
            )}

            {/* User Manual & Role Guide button */}
            <Tooltip text="Open User Manual with system policies" isDarkMode={false}>
              <button
                id="guide-policy-button"
                onClick={() => setIsManualOpen(true)}
                className="px-3 py-1.5 rounded-xl border text-[10px] transition-all flex items-center gap-1.5 font-bold cursor-pointer bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100 shadow-sm"
              >
                <BookOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Guide & Policy</span>
              </button>
            </Tooltip>

            {/* Logout button */}
            {profile && (
              <Tooltip text="Sign out of current session" isDarkMode={false}>
                <button
                  id="logout-button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-xl border text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1.5 bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
                >
                  <LogOut className="w-3 h-3" />
                  <span>Logout</span>
                </button>
              </Tooltip>
            )}
          </div>
        </header>

        {/* Central Layout Portal */}
        <main id="main-content" className="flex-grow p-4 md:p-8 max-w-7xl w-full mx-auto relative z-10 animate-fade-in">
          <AnimatePresence mode="wait">
            {!profile ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <LoginScreen onLoginSuccess={handleLoginSuccess} isDarkMode={isDarkMode} />
              </motion.div>
            ) : (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3 }}
              >
                {profile.role === "ADMIN" && !isAdmin ? (
                  <div className="p-8 rounded-2xl border border-red-500/30 bg-red-500/10 text-center max-w-md mx-auto my-12">
                    <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-3" />
                    <h2 className="text-lg font-bold text-red-400 uppercase font-mono">Access Denied</h2>
                    <p className="text-xs font-mono text-slate-400 mt-2">
                      Administrative dashboard access is strictly restricted to ADWORDSADMIN.
                    </p>
                    <button
                      onClick={handleLogout}
                      className="mt-5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-mono font-bold rounded-xl"
                    >
                      Return to Login
                    </button>
                  </div>
                ) : isAdmin ? (
                  <DashboardAdmin 
                    profile={profile} 
                    onLogout={handleLogout} 
                    isDarkMode={isDarkMode}
                  />
                ) : (
                  <DashboardAgent 
                    profile={profile} 
                    onLogout={handleLogout} 
                    rollingWindow={rollingWindow}
                    isDarkMode={isDarkMode}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer id="main-footer" className="border-t py-6 px-10 text-center text-xs font-mono relative z-10 transition-colors duration-300 border-slate-300 bg-white text-slate-600">
          <p>© 2026 ADWORDS First-Come, First-Served Leave Booking System. One member per team per date rule enforced.</p>
        </footer>
      </div>

      {/* User Manual Modal */}
      <UserManualModal 
        isOpen={isManualOpen} 
        onClose={() => setIsManualOpen(false)} 
        isDarkMode={isDarkMode}
        userRole={profile?.role || "AGENT"}
      />
    </div>
  );
}
