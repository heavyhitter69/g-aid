"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { X, Search, Settings as SettingsIcon, LogOut, User, Building, Compass, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { DISCIPLINES, getAgentForDiscipline } from "@/lib/data";
import type { DisciplineId, UserRole } from "@/types";

const roleLabels: Record<string, string> = {
  student: "Student",
  researcher: "Researcher",
  consultant: "Consultant",
  exploration: "Exploration Company",
};

export function SettingsView() {
  const { user, selectedDiscipline, setUser, setDiscipline, setAgent, setAuthenticated, theme, setTheme } = useAppStore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"general" | "account">("account"); // Default to account tab so they see it instantly

  // Form states
  const [fullName, setFullName] = useState("");
  const [institution, setInstitution] = useState("");
  const [role, setRole] = useState<UserRole>("researcher");
  const [discipline, setDisciplineState] = useState<DisciplineId>("groundwater");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state with store on load
  useEffect(() => {
    if (user) {
      setFullName(user.fullName || "");
      setInstitution(user.institution || "");
      setRole(user.role || "researcher");
      setDisciplineState(user.discipline || selectedDiscipline || "groundwater");
    }
  }, [user, selectedDiscipline]);

  const handleSignOut = () => {
    setAuthenticated(false);
    // Reset workspace-only active session layout details, but preserve user registration credentials!
    useAppStore.setState({
      workbenchTabs: [],
      activeWorkbenchTabId: null,
      workspaceView: "dashboard",
      activeFile: null,
      conversations: [{ id: "default", topic: "New Agent", messages: [] }],
      activeConversationId: "default",
    });
    router.push("/signin");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Update user profile in store
    setUser({
      fullName: fullName.trim(),
      institution: institution.trim(),
      email: user?.email || "explorer@gaid.ai",
      role: role,
      discipline: discipline,
    });

    // Update active discipline and calibrate corresponding agent
    setDiscipline(discipline);
    const agent = getAgentForDiscipline(discipline);
    setAgent(agent);

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const userDisciplineName = DISCIPLINES.find(d => d.id === (user?.discipline || selectedDiscipline))?.name || "Not Specified";
  const userRoleLabel = roleLabels[user?.role || "researcher"] || "Researcher";

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-[#cccccc] select-none font-sans">
      <div className="flex-1 flex overflow-hidden">
        {/* Settings Sidebar */}
        <div className="w-[250px] shrink-0 border-r border-[#2b2b2b] overflow-y-auto py-4 px-3 flex flex-col justify-between">
          <div className="space-y-4">
            {/* User Profile Mini Header */}
            <div 
              onClick={() => setActiveTab("account")}
              className={cn(
                "flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer transition-all hover:bg-white/5",
                activeTab === "account" && "bg-white/5 border border-white/10"
              )}
            >
              <div className="h-8 w-8 rounded-full bg-[#333333] flex items-center justify-center text-[#cccccc] font-medium text-sm border border-zinc-700">
                {(fullName || user?.fullName || "G").charAt(0)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[12px] text-white font-medium truncate w-[140px]">
                  {fullName || user?.fullName || "Geophysicist"}
                </span>
                <span className="text-[10px] text-[#858585] truncate w-[140px]">
                  {user?.email || "user@geophysics.ai"}
                </span>
              </div>
            </div>

            <div className="relative px-2">
              <Search className="absolute left-4 top-1.5 h-3.5 w-3.5 text-[#858585]" />
              <input 
                type="text" 
                placeholder="Search settings Ctrl+F" 
                className="w-full bg-[#2a2d2e] border border-[#3c3c3c] rounded px-8 py-1 text-[12px] outline-none placeholder-[#858585] text-[#cccccc]"
              />
            </div>

            <div className="space-y-1 text-[12px]">
              <button 
                onClick={() => setActiveTab("general")}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-left",
                  activeTab === "general" ? "bg-[#37373d] text-white font-medium" : "hover:bg-white/5 text-[#cccccc]"
                )}
              >
                <SettingsIcon className="h-3.5 w-3.5" /> General
              </button>
              
              <button 
                onClick={() => setActiveTab("account")}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-left",
                  activeTab === "account" ? "bg-[#37373d] text-white font-medium" : "hover:bg-white/5 text-[#cccccc]"
                )}
              >
                <User className="h-3.5 w-3.5" /> Account Details
              </button>
            </div>
          </div>

          {/* Quick Sign Out at the Bottom */}
          <div className="px-2 pt-4 border-t border-[#2b2b2b] mt-auto">
            <button 
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded text-[12px] text-[#ef4444] hover:bg-[#ef4444]/15 hover:text-[#f87171] transition-all font-medium border border-transparent hover:border-[#ef4444]/20 cursor-pointer"
            >
              <LogOut className="h-4 w-4 shrink-0" /> Sign Out
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-8 max-w-3xl w-full">
          {activeTab === "general" ? (
            <>
              <h2 className="text-[16px] font-bold text-[#cccccc] mb-6">General Settings</h2>

              {/* Appearance Section */}
              <section className="space-y-6">
                <div>
                  <h3 className="text-[13px] font-semibold text-[#cccccc] mb-1">Appearance</h3>
                  <p className="text-[12px] text-[#858585]">Customize how the platform looks on your device</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Light Mode */}
                  <div
                    onClick={() => setTheme("light")}
                    className={cn(
                      "flex flex-col gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                      theme === "light"
                        ? "border-[#007acc] shadow-lg ring-1 ring-[#007acc]/50 bg-slate-50"
                        : "border-[#3c3c3c] bg-[#252526] hover:border-[#555555] hover:bg-[#2a2d2e]"
                    )}
                  >
                    <div className="h-24 w-full rounded-lg bg-slate-100 border border-slate-200 overflow-hidden relative p-2">
                       <div className="w-8 h-1 bg-slate-300 rounded mb-1" />
                       <div className="w-12 h-1 bg-slate-300 rounded mb-3" />
                       <div className="grid grid-cols-3 gap-1">
                         <div className="h-8 bg-white rounded border border-slate-200" />
                         <div className="h-8 bg-white rounded border border-slate-200" />
                         <div className="h-8 bg-white rounded border border-slate-200" />
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={cn("text-sm font-medium", theme === "light" ? "text-[#111827]" : "text-[#cccccc]")}>Light Mode</p>
                        <p className="text-xs text-[#858585]">{theme === "light" ? "Active Theme" : "Click to activate"}</p>
                      </div>
                      {theme === "light" && <div className="h-2 w-2 rounded-full bg-[#007acc]" />}
                    </div>
                  </div>

                  {/* Dark Mode */}
                  <div
                    onClick={() => setTheme("dark")}
                    className={cn(
                      "flex flex-col gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                      theme === "dark"
                        ? "border-[#007acc] shadow-lg ring-1 ring-[#007acc]/50 bg-black"
                        : "border-[#3c3c3c] bg-[#252526] hover:border-[#555555] hover:bg-[#2a2d2e]"
                    )}
                  >
                    <div className="h-24 w-full rounded-lg bg-black border border-zinc-800 overflow-hidden relative p-2">
                       <div className="w-8 h-1 bg-zinc-800 rounded mb-1" />
                       <div className="w-12 h-1 bg-zinc-800 rounded mb-3" />
                       <div className="grid grid-cols-3 gap-1">
                         <div className="h-8 bg-zinc-900 rounded border border-zinc-800" />
                         <div className="h-8 bg-zinc-900 rounded border border-zinc-800" />
                         <div className="h-8 bg-zinc-900 rounded border border-zinc-800" />
                       </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">Dark Mode</p>
                        <p className="text-xs text-[#858585]">{theme === "dark" ? "Active Theme" : "Click to activate"}</p>
                      </div>
                      {theme === "dark" && <div className="h-2 w-2 rounded-full bg-[#007acc]" />}
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              <h2 className="text-[16px] font-bold text-[#cccccc] mb-6">Account Settings</h2>

              <section className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-[13px] font-semibold text-[#cccccc] mb-1">Profile Information</h3>
                    <p className="text-[12px] text-[#858585]">Customize your workspace credentials, role, and discipline</p>
                  </div>
                  {/* Explanatory banner */}
                  {user?.fullName === "Dr. Alex Chen" && (
                    <div className="flex items-center gap-2 bg-[#007acc]/10 border border-[#007acc]/30 text-[#60a5fa] px-3 py-1.5 rounded-lg text-xs font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Note: Input your real details below to replace the placeholder</span>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                  {/* Name field */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] uppercase font-bold text-[#858585] flex items-center gap-1">
                      <User className="w-3 h-3 text-[#007acc]" /> Full Name
                    </label>
                    <input 
                      type="text" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-3 py-2 text-xs text-white outline-none focus:border-[#007acc] transition-colors"
                      placeholder="e.g. Dr. Alex Chen"
                      required
                    />
                  </div>

                  {/* Institution/Company field */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] uppercase font-bold text-[#858585] flex items-center gap-1">
                      <Building className="w-3 h-3 text-[#007acc]" /> Institution / Company
                    </label>
                    <input 
                      type="text" 
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-3 py-2 text-xs text-white outline-none focus:border-[#007acc] transition-colors"
                      placeholder="e.g. GeoMind Research"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Role selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] uppercase font-bold text-[#858585]">
                        Workspace Role
                      </label>
                      <select 
                        value={role}
                        onChange={(e) => setRole(e.target.value as UserRole)}
                        className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-3 py-2 text-xs text-white outline-none focus:border-[#007acc] cursor-pointer transition-colors"
                      >
                        {Object.entries(roleLabels).map(([val, label]) => (
                          <option key={val} value={val} className="bg-[#1e1e1e]">
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Discipline selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] uppercase font-bold text-[#858585] flex items-center gap-1">
                        <Compass className="w-3.5 h-3.5 text-[#007acc]" /> Primary Discipline
                      </label>
                      <select 
                        value={discipline}
                        onChange={(e) => setDisciplineState(e.target.value as DisciplineId)}
                        className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-3 py-2 text-xs text-white outline-none focus:border-[#007acc] cursor-pointer transition-colors"
                      >
                        {DISCIPLINES.map((d) => (
                          <option key={d.id} value={d.id} className="bg-[#1e1e1e]">
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pt-4 border-t border-[#2b2b2b]">
                    <button 
                      type="submit"
                      className="px-6 py-2 rounded bg-[#007acc] hover:bg-[#005f9e] text-white text-xs font-bold transition-all cursor-pointer border-none shadow-md shadow-[#007acc]/10 flex items-center gap-1.5"
                    >
                      {saveSuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Saved Successfully!
                        </>
                      ) : (
                        "Save Settings"
                      )}
                    </button>
                    {saveSuccess && (
                      <span className="text-xs text-[#4caf50] animate-pulse">
                        Your workspace agent has been calibrated!
                      </span>
                    )}
                  </div>
                </form>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
