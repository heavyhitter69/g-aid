import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AgentProfile,
  DisciplineId,
  OnboardingStep,
  UserProfile,
  WorkspaceView,
} from "@/types";
import type { ProjectFile } from "@/types/project";

export interface Conversation {
  id: string;
  topic: string;
  messages: Array<{ sender: "user" | "agent"; text: string }>;
}

export interface WorkbenchTab {
  id: string;
  type: "file" | "settings" | "view";
  title: string;
}

export interface AgentSettings {
  textSize: "Small" | "Default" | "Large" | "Extra Large";
  submitWithCtrlEnter: boolean;
  maxTabCount: { value: number | string; type: "5" | "10" | "Unlimited" | "Custom" };
  queueMessages: "Send after current message" | "Stop & send right away";
  agentAutocomplete: boolean;
  autoApproveModeTransitions: boolean;
}

export interface RecentProject {
  name: string;
  path: string;      // best-effort — may be relative for browser-picked folders
  openedAt: string;  // ISO 8601
  fileCount: number;
}

interface AppState {
  isAuthenticated: boolean;
  onboardingComplete: boolean;
  onboardingStep: OnboardingStep;
  user: UserProfile | null;
  selectedDiscipline: DisciplineId | null;
  assignedAgent: AgentProfile | null;
  workspaceView: WorkspaceView;
  currentProject: string | null;
  recentProjects: RecentProject[];
  processingStatus: "idle" | "running" | "complete";
  theme: "light" | "dark";
  isAgentSidebarOpen: boolean;
  isTerminalOpen: boolean;
  isChatPanelOpen: boolean;
  isLeftSidebarOpen: boolean;
  activeLeftSidebarTab: string;
  leftSidebarWidth: number;
  aiPanelWidth: number;
  agentSidebarWidth: number;
  layoutMode: "editor" | "agent";
  privacyMode: "share" | "privacy";
  conversations: Conversation[];
  activeConversationId: string;
  activeFile: string | null;
  workbenchTabs: WorkbenchTab[];
  activeWorkbenchTabId: string | null;
  autoSave: boolean;
  dirtyFiles: string[];
  projectFiles: ProjectFile[];
  isOpenFileDialogOpen: boolean;
  isOpenFolderDialogOpen: boolean;
  isSaveAsDialogOpen: boolean;
  fileContents: Record<string, string>;
  agentSettings: AgentSettings;
  setAgentSettings: (settings: Partial<AgentSettings>) => void;
  setAuthenticated: (value: boolean) => void;
  setUser: (user: UserProfile | null) => void;
  patchUser: (partial: Partial<UserProfile>) => void;
  setOnboardingStep: (step: OnboardingStep) => void;
  setDiscipline: (discipline: DisciplineId) => void;
  setAgent: (agent: AgentProfile | null) => void;
  completeOnboarding: () => void;
  setWorkspaceView: (view: WorkspaceView) => void;
  setProcessingStatus: (status: "idle" | "running" | "complete") => void;
  setTheme: (theme: "light" | "dark") => void;
  toggleAgentSidebar: () => void;
  toggleTerminal: () => void;
  toggleChatPanel: () => void;
  setChatPanelOpen: (value: boolean) => void;
  toggleLeftSidebar: () => void;
  setLeftSidebarOpen: (value: boolean) => void;
  setActiveLeftSidebarTab: (tab: string) => void;
  setLeftSidebarWidth: (width: number) => void;
  setAIPanelWidth: (width: number) => void;
  setAgentSidebarWidth: (width: number) => void;
  setLayoutMode: (mode: "editor" | "agent") => void;
  setPrivacyMode: (mode: "share" | "privacy") => void;
  setActiveConversationId: (id: string) => void;
  setActiveFile: (file: string | null) => void;
  openWorkbenchTab: (id: string, type: "file" | "settings" | "view", title: string) => void;
  closeWorkbenchTab: (id: string) => void;
  setActiveWorkbenchTabId: (id: string) => void;
  setAutoSave: (value: boolean) => void;
  setFileDirty: (fileName: string, isDirty: boolean) => void;
  saveFile: (fileName: string) => void;
  saveAllFiles: () => void;
  setProjectFiles: (files: ProjectFile[]) => void;
  addProjectFile: (file: ProjectFile) => void;
  setCurrentProject: (projectName: string | null, path?: string, fileCount?: number) => void;
  setOpenFileDialogOpen: (value: boolean) => void;
  setOpenFolderDialogOpen: (value: boolean) => void;
  setSaveAsDialogOpen: (value: boolean) => void;
  setFileContent: (fileName: string, content: string) => void;
  addConversation: () => void;
  removeConversation: (id: string) => void;
  updateConversationTopic: (id: string, topic: string) => void;
  addMessageToConversation: (id: string, msg: { sender: "user" | "agent"; text: string }) => void;
  reset: () => void;
}

const initialState = {
  isAuthenticated: false,
  onboardingComplete: false,
  onboardingStep: "welcome" as OnboardingStep,
  user: null,
  selectedDiscipline: null,
  assignedAgent: null,
  workspaceView: "dashboard" as WorkspaceView,
  currentProject: null as string | null,
  recentProjects: [] as RecentProject[],
  processingStatus: "idle" as const,
  theme: "dark" as const,
  isAgentSidebarOpen: false,
  isTerminalOpen: false,
  isChatPanelOpen: false,
  isLeftSidebarOpen: true,
  activeLeftSidebarTab: "explorer",
  leftSidebarWidth: 250,
  aiPanelWidth: 350,
  agentSidebarWidth: 320,
  layoutMode: "editor" as const,
  privacyMode: "share" as const,
  conversations: [
    { id: "default", topic: "New Agent", messages: [] }
  ] as Conversation[],
  activeConversationId: "default",
  activeFile: null as string | null,
  workbenchTabs: [] as WorkbenchTab[],
  activeWorkbenchTabId: null as string | null,
  autoSave: true,
  dirtyFiles: [] as string[],
  projectFiles: [] as ProjectFile[],
  isOpenFileDialogOpen: false,
  isOpenFolderDialogOpen: false,
  isSaveAsDialogOpen: false,
  fileContents: {} as Record<string, string>,
  agentSettings: {
    textSize: "Default" as const,
    submitWithCtrlEnter: false,
    maxTabCount: { value: 5, type: "5" as const },
    queueMessages: "Send after current message" as const,
    agentAutocomplete: true,
    autoApproveModeTransitions: false,
  },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
      setAgentSettings: (settings) => set((s) => ({ agentSettings: { ...s.agentSettings, ...settings } })),
      setAuthenticated: (value) => set({ isAuthenticated: value }),
      setUser: (user) => set({ user }),
      patchUser: (partial) =>
        set((s) => ({
          user: s.user ? { ...s.user, ...partial } : null,
        })),
      setOnboardingStep: (step) => set({ onboardingStep: step }),
      setDiscipline: (discipline) => set({ selectedDiscipline: discipline }),
      setAgent: (agent) => set({ assignedAgent: agent }),
      completeOnboarding: () =>
        set({ onboardingComplete: true, onboardingStep: "complete" }),
      setWorkspaceView: (view) => set({ workspaceView: view }),
      setProcessingStatus: (status) => set({ processingStatus: status }),
      setTheme: (theme) => set({ theme }),
      toggleAgentSidebar: () => set((s) => ({ isAgentSidebarOpen: !s.isAgentSidebarOpen })),
      toggleTerminal: () => set((s) => ({ isTerminalOpen: !s.isTerminalOpen })),
      toggleChatPanel: () => set((s) => ({ isChatPanelOpen: !s.isChatPanelOpen })),
      setChatPanelOpen: (value) => set({ isChatPanelOpen: value }),
      toggleLeftSidebar: () => set((s) => ({ isLeftSidebarOpen: !s.isLeftSidebarOpen })),
      setLeftSidebarOpen: (value) => set({ isLeftSidebarOpen: value }),
      setActiveLeftSidebarTab: (tab) => set({ activeLeftSidebarTab: tab }),
      setLeftSidebarWidth: (width) => set({ leftSidebarWidth: width }),
      setAIPanelWidth: (width) => set({ aiPanelWidth: width }),
      setAgentSidebarWidth: (width) => set({ agentSidebarWidth: width }),
      setLayoutMode: (mode) => set({ layoutMode: mode }),
      setPrivacyMode: (mode) => set({ privacyMode: mode }),
      setActiveConversationId: (id) => set({ activeConversationId: id }),
      setActiveFile: (file) => set({ activeFile: file }),
      openWorkbenchTab: (id, type, title) => set((s) => {
        const alreadyOpen = s.workbenchTabs.some(t => t.id === id);
        const updatedTabs = alreadyOpen ? s.workbenchTabs : [...s.workbenchTabs, { id, type, title }];
        
        let view = s.workspaceView;
        let file = s.activeFile;
        if (type === "file") {
          view = "file-editor";
          file = id.replace("file:", "");
        } else if (type === "settings") {
          view = "settings";
          file = null;
        } else {
          view = id as WorkspaceView;
          file = null;
        }

        return {
          workbenchTabs: updatedTabs,
          activeWorkbenchTabId: id,
          workspaceView: view,
          activeFile: file
        };
      }),
      closeWorkbenchTab: (id) => set((s) => {
        const updated = s.workbenchTabs.filter(t => t.id !== id);
        const hasRemaining = updated.length > 0;
        
        let nextActiveId = s.activeWorkbenchTabId;
        let view = s.workspaceView;
        let file = s.activeFile;

        if (s.activeWorkbenchTabId === id) {
          if (hasRemaining) {
            const nextTab = updated[updated.length - 1];
            nextActiveId = nextTab.id;
            if (nextTab.type === "file") {
              view = "file-editor";
              file = nextTab.id.replace("file:", "");
            } else if (nextTab.type === "settings") {
              view = "settings";
              file = null;
            } else {
              view = nextTab.id as WorkspaceView;
              file = null;
            }
          } else {
            nextActiveId = null;
            view = "dashboard";
            file = null;
          }
        }

        return {
          workbenchTabs: updated,
          activeWorkbenchTabId: nextActiveId,
          workspaceView: view,
          activeFile: file
        };
      }),
      setActiveWorkbenchTabId: (id) => set((s) => {
        const tab = s.workbenchTabs.find(t => t.id === id);
        if (!tab) return {};

        let view = s.workspaceView;
        let file = s.activeFile;
        if (tab.type === "file") {
          view = "file-editor";
          file = tab.id.replace("file:", "");
        } else if (tab.type === "settings") {
          view = "settings";
          file = null;
        } else {
          view = tab.id as WorkspaceView;
          file = null;
        }

        return {
          activeWorkbenchTabId: id,
          workspaceView: view,
          activeFile: file
        };
      }),
      setAutoSave: (value) => set((s) => {
        return {
          autoSave: value,
          dirtyFiles: value ? [] : s.dirtyFiles
        };
      }),
      setFileDirty: (fileName, isDirty) => set((s) => {
        if (s.autoSave) return {}; 
        const isAlreadyDirty = s.dirtyFiles.includes(fileName);
        if (isDirty && !isAlreadyDirty) {
          return { dirtyFiles: [...s.dirtyFiles, fileName] };
        } else if (!isDirty && isAlreadyDirty) {
          return { dirtyFiles: s.dirtyFiles.filter(f => f !== fileName) };
        }
        return {};
      }),
      saveFile: (fileName) => set((s) => ({
        dirtyFiles: s.dirtyFiles.filter(f => f !== fileName)
      })),
      saveAllFiles: () => set({ dirtyFiles: [] }),
      setProjectFiles: (files) => set({ projectFiles: files }),
      addProjectFile: (file) => set((s) => {
        if (s.projectFiles.some((f) => f.id === file.id)) return {};
        return { projectFiles: [...s.projectFiles, file] };
      }),
      setCurrentProject: (projectName, path, fileCount) => set((s) => {
        if (!projectName) return { currentProject: null };
        // Deduplicate by name, prepend new entry, cap at 10
        const entry: RecentProject = {
          name: projectName,
          path: path ?? projectName,
          openedAt: new Date().toISOString(),
          fileCount: fileCount ?? 0,
        };
        const filtered = s.recentProjects.filter((p) => p.name !== projectName);
        return {
          currentProject: projectName,
          recentProjects: [entry, ...filtered].slice(0, 10),
        };
      }),
      setOpenFileDialogOpen: (value) => set({ isOpenFileDialogOpen: value }),
      setOpenFolderDialogOpen: (value) => set({ isOpenFolderDialogOpen: value }),
      setSaveAsDialogOpen: (value) => set({ isSaveAsDialogOpen: value }),
      setFileContent: (fileName, content) => set((s) => ({
        fileContents: { ...s.fileContents, [fileName]: content }
      })),
      addConversation: () => set((s) => {
        const limit = s.agentSettings?.maxTabCount?.value;
        if (limit !== "Unlimited" && limit !== undefined) {
          const limitNum = Number(limit);
          if (!isNaN(limitNum) && s.conversations.length >= limitNum) {
            return {}; // Max tabs reached
          }
        }
        
        const newId = Date.now().toString();
        return {
          conversations: [
            ...s.conversations,
            { id: newId, topic: "New Agent", messages: [] }
          ],
          activeConversationId: newId,
        };
      }),
      removeConversation: (id) => set((s) => {
        const updated = s.conversations.filter(c => c.id !== id);
        const hasRemaining = updated.length > 0;
        
        let nextActiveId = s.activeConversationId;
        if (s.activeConversationId === id) {
          nextActiveId = hasRemaining ? updated[updated.length - 1].id : "default";
        }

        return {
          conversations: updated.length === 0 ? [{ id: "default", topic: "New Agent", messages: [] }] : updated,
          activeConversationId: nextActiveId,
          isChatPanelOpen: hasRemaining ? s.isChatPanelOpen : false
        };
      }),
      updateConversationTopic: (id, topic) => set((s) => ({
        conversations: s.conversations.map(c => c.id === id ? { ...c, topic } : c)
      })),
      addMessageToConversation: (id, msg) => set((s) => ({
        conversations: s.conversations.map(c => c.id === id ? { ...c, messages: [...c.messages, msg] } : c)
      })),
      reset: () => set(initialState),
    }),
    { 
      name: "gaid-app-store",
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        onboardingComplete: state.onboardingComplete,
        onboardingStep: state.onboardingStep,
        user: state.user,
        selectedDiscipline: state.selectedDiscipline,
        assignedAgent: state.assignedAgent,
        currentProject: state.currentProject,
        recentProjects: state.recentProjects,
        autoSave: state.autoSave,
        theme: state.theme,
        layoutMode: state.layoutMode,
        privacyMode: state.privacyMode,
        agentSettings: state.agentSettings,
      }),
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Force wipe stale state but keep their theme
          return { ...initialState, theme: persistedState?.theme || "dark" };
        }
        return persistedState;
      },
    }
  )
);

