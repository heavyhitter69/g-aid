"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAppStore } from "@/store/app-store";
import { X, Search, Settings as SettingsIcon, LogOut, User, Building, Compass, Check, AlertCircle, ChevronDown, ChevronUp, Bot } from "lucide-react";
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
  const { user, isAuthenticated, selectedDiscipline, setUser, setDiscipline, setAgent, setAuthenticated, theme, setTheme, layoutMode, setLayoutMode, privacyMode, setPrivacyMode, agentSettings, setAgentSettings } = useAppStore();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"general" | "account" | "agent">("general"); // Default to general tab
  const [isPrivacyDropdownOpen, setIsPrivacyDropdownOpen] = useState(false);

  // Form states
  const [fullName, setFullName] = useState("");
  const [institution, setInstitution] = useState("");
  const [role, setRole] = useState<UserRole>("researcher");
  const [discipline, setDisciplineState] = useState<DisciplineId>("exploration");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Custom dropdown states for Agents
  const [isTextSizeOpen, setIsTextSizeOpen] = useState(false);
  const [isMaxTabOpen, setIsMaxTabOpen] = useState(false);
  const [isQueueMessagesOpen, setIsQueueMessagesOpen] = useState(false);

  // Sync state with store on load
  useEffect(() => {
    if (user) {
      setFullName(user.fullName || "");
      setInstitution(user.institution || "");
      setRole(user.role || "researcher");
      setDisciplineState(user.discipline || selectedDiscipline || "exploration");
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
      currentProject: null,
      projectFiles: [],
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
    setTimeout(() => {
      setSaveSuccess(false);
      setIsEditing(false);
    }, 2000);
  };

  const userDisciplineName = DISCIPLINES.find(d => d.id === (user?.discipline || selectedDiscipline))?.name || "Not Specified";
  const userRoleLabel = roleLabels[user?.role || "researcher"] || "Researcher";

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-[#cccccc] select-none font-sans">
      <div className="flex-1 flex overflow-hidden">
        {/* Settings Sidebar */}
        <div className="w-[250px] shrink-0 overflow-y-auto py-4 px-3 flex flex-col justify-between">
          <div className="space-y-4">
          {/* User profile — only shown when signed in */}
          {isAuthenticated && user?.email && (
            <div className="flex items-center gap-3 px-2 py-1.5 rounded">
              <div className="h-8 w-8 rounded-full bg-[#333333] flex items-center justify-center text-[#cccccc] font-medium text-sm border border-zinc-700">
                {(fullName || user?.fullName || "G").charAt(0)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[12px] text-white font-medium truncate w-[140px]">
                  {fullName || user?.fullName || "Geophysicist"}
                </span>
                <span className="text-[10px] text-[#858585] truncate w-[140px]">
                  {user?.email}
                </span>
              </div>
            </div>
          )}

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
                onClick={() => setActiveTab("agent")}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-left",
                  activeTab === "agent" ? "bg-[#37373d] text-white font-medium" : "hover:bg-white/5 text-[#cccccc]"
                )}
              >
                <Bot className="h-3.5 w-3.5" /> Agents
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

          {/* Bottom area: sign-in CTAs or sign-out */}
          <div className="px-2 pt-4 border-t border-[#2b2b2b] mt-auto space-y-2">
            {isAuthenticated ? (
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded text-[12px] text-[#ef4444] hover:bg-[#ef4444]/15 hover:text-[#f87171] transition-all font-medium border border-transparent hover:border-[#ef4444]/20 cursor-pointer"
              >
                <LogOut className="h-4 w-4 shrink-0" /> Sign Out
              </button>
            ) : (
              <>
                <Link
                  href="/signin"
                  className="w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded text-[12px] text-[#cccccc] hover:text-white bg-[#252526] hover:bg-[#2d2d2d] border border-[#3c3c3c] hover:border-[#555] transition-all font-medium"
                >
                  Sign In
                </Link>
                <Link
                  href="/signup"
                  className="w-full flex items-center justify-center gap-2 px-2.5 py-2 rounded text-[12px] text-white bg-[#007acc] hover:bg-[#0062a3] border border-transparent transition-all font-medium"
                >
                  Sign Up for Free
                </Link>
              </>
            )}
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

                <div className="pt-2">
                  <h3 className="text-[13px] font-semibold text-[#cccccc] mb-1">Window Layout</h3>
                  <p className="text-[12px] text-[#858585]">Choose your preferred workspace layout</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Editor Mode */}
                  <div
                    onClick={() => setLayoutMode("editor")}
                    className={cn(
                      "flex flex-col gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                      layoutMode === "editor"
                        ? "border-[#007acc] shadow-lg ring-1 ring-[#007acc]/50 bg-black"
                        : "border-[#3c3c3c] bg-[#252526] hover:border-[#555555] hover:bg-[#2a2d2e]"
                    )}
                  >
                    <div className="h-24 w-full rounded-lg bg-black border border-zinc-800 overflow-hidden relative flex p-2 gap-2">
                       <div className="w-1/4 h-full bg-zinc-900 rounded border border-zinc-800" />
                       <div className="flex-1 h-full bg-zinc-800 rounded" />
                       <div className="w-1/3 h-full bg-zinc-900 rounded border border-zinc-800" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">Editor Mode</p>
                        <p className="text-xs text-[#858585]">Sidebar on left, AI on right</p>
                      </div>
                      {layoutMode === "editor" && <div className="h-2 w-2 rounded-full bg-[#007acc]" />}
                    </div>
                  </div>

                  {/* Agent Mode */}
                  <div
                    onClick={() => setLayoutMode("agent")}
                    className={cn(
                      "flex flex-col gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                      layoutMode === "agent"
                        ? "border-[#007acc] shadow-lg ring-1 ring-[#007acc]/50 bg-black"
                        : "border-[#3c3c3c] bg-[#252526] hover:border-[#555555] hover:bg-[#2a2d2e]"
                    )}
                  >
                    <div className="h-24 w-full rounded-lg bg-black border border-zinc-800 overflow-hidden relative flex p-2 gap-2">
                       <div className="w-1/3 h-full bg-zinc-900 rounded border border-zinc-800" />
                       <div className="flex-1 h-full bg-zinc-800 rounded" />
                       <div className="w-1/4 h-full bg-zinc-900 rounded border border-zinc-800" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">Agent Mode</p>
                        <p className="text-xs text-[#858585]">AI on left, Sidebar on right</p>
                      </div>
                      {layoutMode === "agent" && <div className="h-2 w-2 rounded-full bg-[#007acc]" />}
                    </div>
                  </div>
                </div>

                {/* Privacy Section */}
                <div className="pt-6">
                  <h3 className="text-[13px] font-semibold text-[#cccccc] mb-3">Privacy</h3>
                  
                  <div className="bg-[#252526] border border-[#3c3c3c] rounded-xl p-4 flex justify-between items-start">
                    <div className="flex flex-col gap-1 max-w-[420px]">
                      <div className="flex items-center gap-2 text-[13px] font-medium text-white">
                        <Check className="h-4 w-4" /> 
                        {privacyMode === "share" ? "Data Sharing Enabled" : "Privacy Mode Enabled"}
                      </div>
                      <p className="text-[12px] text-[#858585] leading-relaxed mt-1">
                        {privacyMode === "share" 
                          ? "Your codebase, prompts, edits and other usage data will be stored and trained on by G-AID to improve the product."
                          : "No training. Data may be stored for Background Agent and other features."}
                      </p>
                    </div>
                    
                    <div className="relative mt-1">
                      <button 
                        onClick={() => setIsPrivacyDropdownOpen(!isPrivacyDropdownOpen)}
                        className="flex items-center justify-between min-w-[120px] bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-[12px] text-[#cccccc] hover:bg-[#2a2d2e] transition-colors"
                      >
                        {privacyMode === "share" ? "Share Data" : "Privacy Mode"}
                        <div className="flex flex-col items-center ml-2">
                          <ChevronUp className="h-2.5 w-2.5 -mb-0.5 text-[#858585]" />
                          <ChevronDown className="h-2.5 w-2.5 -mt-0.5 text-[#858585]" />
                        </div>
                      </button>

                      {isPrivacyDropdownOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setIsPrivacyDropdownOpen(false)} 
                          />
                          <div className="absolute right-0 top-full mt-1 w-[260px] bg-[#1e1e1e] border border-[#3c3c3c] rounded-md shadow-2xl z-50 flex flex-col py-1">
                            <button 
                              onClick={() => { setPrivacyMode("share"); setIsPrivacyDropdownOpen(false); }}
                              className="w-full text-left px-3 py-2 hover:bg-[#2d2d2d] transition-colors border-b border-[#2b2b2b]"
                            >
                              <div className="text-[12px] font-medium text-[#cccccc] group-hover:text-white mb-0.5">Share Data</div>
                              <div className="text-[10px] text-[#858585] leading-relaxed">Improve G-AID for everyone</div>
                            </button>
                            <button 
                              onClick={() => { setPrivacyMode("privacy"); setIsPrivacyDropdownOpen(false); }}
                              className="w-full text-left px-3 py-2 hover:bg-[#2d2d2d] transition-colors"
                            >
                              <div className="text-[12px] font-medium text-[#cccccc] group-hover:text-white mb-0.5">Privacy Mode</div>
                              <div className="text-[10px] text-[#858585] leading-relaxed">No training. Data may be stored for Background Agent and other features.</div>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </>
          ) : activeTab === "account" ? (
            <>
              <h2 className="text-[16px] font-bold text-[#cccccc] mb-6">Account Settings</h2>

              {!isAuthenticated ? (
                /* Not signed in — show auth CTAs */
                <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
                  <div className="h-14 w-14 rounded-full bg-[#252526] border border-[#3c3c3c] flex items-center justify-center">
                    <User className="h-6 w-6 text-[#555555]" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#cccccc] mb-1">You&apos;re browsing the demo</p>
                    <p className="text-[12px] text-[#858585] max-w-[280px] leading-relaxed mx-auto">
                      Create a free account to save your workspace preferences, discipline, and agent settings across sessions.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 w-full max-w-[240px]">
                    <Link
                      href="/signup"
                      className="w-full flex items-center justify-center py-2.5 rounded text-[13px] text-white bg-[#007acc] hover:bg-[#0062a3] border border-transparent transition-all font-semibold"
                    >
                      Sign Up for Free
                    </Link>
                    <Link
                      href="/signin"
                      className="w-full flex items-center justify-center py-2.5 rounded text-[13px] text-[#cccccc] hover:text-white bg-[#252526] hover:bg-[#2d2d2d] border border-[#3c3c3c] hover:border-[#555] transition-all font-semibold"
                    >
                      Sign In
                    </Link>
                  </div>
                </div>
              ) : (
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
                      disabled={!isEditing}
                      className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-3 py-2 text-xs text-white outline-none focus:border-[#007acc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                      disabled={!isEditing}
                      className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-3 py-2 text-xs text-white outline-none focus:border-[#007acc] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                        disabled={!isEditing}
                        className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-3 py-2 text-xs text-white outline-none focus:border-[#007acc] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                        disabled={!isEditing}
                        className="w-full bg-[#252526] border border-[#3c3c3c] rounded px-3 py-2 text-xs text-white outline-none focus:border-[#007acc] cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                    {!isEditing ? (
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsEditing(true);
                        }}
                        className="px-6 py-2 rounded bg-[#333333] hover:bg-[#3d3d3d] text-white text-xs font-bold transition-all cursor-pointer border-none shadow-md"
                      >
                        Edit Details
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button 
                          type="submit"
                          disabled={saveSuccess}
                          className="px-6 py-2 rounded bg-[#007acc] hover:bg-[#005f9e] disabled:bg-[#007acc]/80 text-white text-xs font-bold transition-all cursor-pointer border-none shadow-md shadow-[#007acc]/10 flex items-center gap-1.5"
                        >
                          {saveSuccess ? (
                            <>
                              <Check className="w-3.5 h-3.5" /> Saved Successfully!
                            </>
                          ) : (
                            "Save Changes"
                          )}
                        </button>
                        {!saveSuccess && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setIsEditing(false);
                            }}
                            className="px-4 py-2 rounded bg-transparent hover:bg-white/5 text-[#cccccc] text-xs font-bold transition-all cursor-pointer border-none"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                    {saveSuccess && (
                      <span className="text-xs text-[#4caf50] animate-pulse">
                        Your workspace agent has been calibrated!
                      </span>
                    )}
                  </div>
                </form>
              </section>
              )}
            </>
          ) : activeTab === "agent" ? (
            <>
              <h2 className="text-[16px] font-bold text-[#cccccc] mb-6">Agents</h2>
              <div className="bg-[#252526] border border-[#3c3c3c] rounded-xl overflow-hidden">
                {/* Text Size */}
                <div className="flex items-center justify-between p-4 border-b border-[#3c3c3c]">
                  <div>
                    <div className="text-[13px] font-medium text-[#cccccc]">Text Size</div>
                    <div className="text-[11px] text-[#858585] mt-0.5">Adjust the conversation text size</div>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setIsTextSizeOpen(!isTextSizeOpen)}
                      className="flex items-center gap-2 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-xs text-[#cccccc] outline-none hover:border-[#555555] cursor-pointer min-w-[120px] justify-between"
                    >
                      {agentSettings?.textSize || "Default"}
                      <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                    </button>
                    {isTextSizeOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsTextSizeOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 w-full min-w-[120px] bg-[#1e1e1e] border border-[#3c3c3c] rounded-md shadow-2xl z-50 flex flex-col py-1">
                          {["Small", "Default", "Large", "Extra Large"].map((size) => (
                            <button
                              key={size}
                              onClick={() => {
                                setAgentSettings({ textSize: size as any });
                                setIsTextSizeOpen(false);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-[#2d2d2d] transition-colors text-[12px] text-[#cccccc]"
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              
                {/* Submit with Ctrl + Enter */}
                <div className="flex items-center justify-between p-4 border-b border-[#3c3c3c]">
                  <div>
                    <div className="text-[13px] font-medium text-[#cccccc]">Submit with Ctrl + Enter</div>
                    <div className="text-[11px] text-[#858585] mt-0.5">When enabled, Ctrl + Enter submits chat and Enter inserts a newline</div>
                  </div>
                  <button
                    onClick={() => setAgentSettings({ submitWithCtrlEnter: !agentSettings?.submitWithCtrlEnter })}
                    className={cn("w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors relative", agentSettings?.submitWithCtrlEnter ? "bg-[#007acc]" : "bg-[#4b4b4b]")}
                  >
                    <div className={cn("w-4 h-4 bg-white rounded-full transition-transform", agentSettings?.submitWithCtrlEnter ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
              
                {/* Max Tab Count */}
                <div className="flex items-center justify-between p-4 border-b border-[#3c3c3c]">
                  <div>
                    <div className="text-[13px] font-medium text-[#cccccc]">Max Tab Count</div>
                    <div className="text-[11px] text-[#858585] mt-0.5">Limit how many chat tabs can be open at once</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={agentSettings?.maxTabCount?.value || 5}
                      onChange={(e) => setAgentSettings({ maxTabCount: { value: e.target.value, type: agentSettings?.maxTabCount?.type || "Custom" } })}
                      className="w-16 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-xs text-[#cccccc] outline-none focus:border-[#007acc] hover:border-[#555555] transition-colors"
                    />
                    <div className="relative">
                      <button
                        onClick={() => setIsMaxTabOpen(!isMaxTabOpen)}
                        className="flex items-center gap-2 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-xs text-[#cccccc] outline-none hover:border-[#555555] cursor-pointer min-w-[100px] justify-between"
                      >
                        {agentSettings?.maxTabCount?.type || "Custom"}
                        <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                      </button>
                      {isMaxTabOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsMaxTabOpen(false)} />
                          <div className="absolute right-0 top-full mt-1 w-full min-w-[100px] bg-[#1e1e1e] border border-[#3c3c3c] rounded-md shadow-2xl z-50 flex flex-col py-1">
                            {["5", "10", "Unlimited", "Custom"].map((val) => (
                              <button
                                key={val}
                                onClick={() => {
                                  setAgentSettings({ 
                                    maxTabCount: { 
                                      value: val === "Unlimited" ? "Unlimited" : val === "5" ? 5 : val === "10" ? 10 : (agentSettings?.maxTabCount?.value || 5), 
                                      type: val as any 
                                    } 
                                  });
                                  setIsMaxTabOpen(false);
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-[#2d2d2d] transition-colors text-[12px] text-[#cccccc]"
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              
                {/* Queue Messages */}
                <div className="flex items-center justify-between p-4 border-b border-[#3c3c3c]">
                  <div>
                    <div className="text-[13px] font-medium text-[#cccccc]">Queue Messages</div>
                    <div className="text-[11px] text-[#858585] mt-0.5">Adjust the default behavior of sending a message while Agent is running</div>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setIsQueueMessagesOpen(!isQueueMessagesOpen)}
                      className="flex items-center gap-2 bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-xs text-[#cccccc] outline-none hover:border-[#555555] cursor-pointer min-w-[200px] justify-between"
                    >
                      {agentSettings?.queueMessages || "Send after current message"}
                      <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                    </button>
                    {isQueueMessagesOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsQueueMessagesOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 w-full min-w-[200px] bg-[#1e1e1e] border border-[#3c3c3c] rounded-md shadow-2xl z-50 flex flex-col py-1">
                          {["Send after current message", "Stop & send right away"].map((opt) => (
                            <button
                              key={opt}
                              onClick={() => {
                                setAgentSettings({ queueMessages: opt as any });
                                setIsQueueMessagesOpen(false);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-[#2d2d2d] transition-colors text-[12px] text-[#cccccc]"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              
                {/* Agent Autocomplete */}
                <div className="flex items-center justify-between p-4 border-b border-[#3c3c3c]">
                  <div>
                    <div className="text-[13px] font-medium text-[#cccccc]">Agent Autocomplete</div>
                    <div className="text-[11px] text-[#858585] mt-0.5">Contextual suggestions while prompting Agent</div>
                  </div>
                  <button
                    onClick={() => setAgentSettings({ agentAutocomplete: !agentSettings?.agentAutocomplete })}
                    className={cn("w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors relative", agentSettings?.agentAutocomplete ? "bg-[#007acc]" : "bg-[#4b4b4b]")}
                  >
                    <div className={cn("w-4 h-4 bg-white rounded-full transition-transform", agentSettings?.agentAutocomplete ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
              
                {/* Auto-Approve Mode Transitions */}
                <div className="flex items-center justify-between p-4">
                  <div className="pr-8">
                    <div className="text-[13px] font-medium text-[#cccccc]">Auto-Approve Mode Transitions</div>
                    <div className="text-[11px] text-[#858585] mt-0.5 leading-relaxed">Allow Agent to switch modes without asking first, such as Agent to Plan or Agent to Debug. When off, Cursor asks before switching.</div>
                  </div>
                  <button
                    onClick={() => setAgentSettings({ autoApproveModeTransitions: !agentSettings?.autoApproveModeTransitions })}
                    className={cn("w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors relative shrink-0", agentSettings?.autoApproveModeTransitions ? "bg-[#007acc]" : "bg-[#4b4b4b]")}
                  >
                    <div className={cn("w-4 h-4 bg-white rounded-full transition-transform", agentSettings?.autoApproveModeTransitions ? "translate-x-4" : "translate-x-0")} />
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
