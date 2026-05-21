import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AgentProfile,
  DisciplineId,
  OnboardingStep,
  UserProfile,
  WorkspaceView,
} from "@/types";

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

interface AppState {
  isAuthenticated: boolean;
  onboardingComplete: boolean;
  onboardingStep: OnboardingStep;
  user: UserProfile | null;
  selectedDiscipline: DisciplineId | null;
  assignedAgent: AgentProfile | null;
  workspaceView: WorkspaceView;
  currentProject: string | null;
  processingStatus: "idle" | "running" | "complete";
  theme: "light" | "dark";
  isAgentSidebarOpen: boolean;
  isTerminalOpen: boolean;
  isChatPanelOpen: boolean;
  isLeftSidebarOpen: boolean;
  activeLeftSidebarTab: string;
  conversations: Conversation[];
  activeConversationId: string;
  activeFile: string | null;
  workbenchTabs: WorkbenchTab[];
  activeWorkbenchTabId: string | null;
  autoSave: boolean;
  dirtyFiles: string[];
  projectFiles: Array<{ name: string; type: "file" | "folder"; path: string }>;
  isOpenFileDialogOpen: boolean;
  isOpenFolderDialogOpen: boolean;
  isSaveAsDialogOpen: boolean;
  fileContents: Record<string, string>;
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
  setActiveConversationId: (id: string) => void;
  setActiveFile: (file: string | null) => void;
  openWorkbenchTab: (id: string, type: "file" | "settings" | "view", title: string) => void;
  closeWorkbenchTab: (id: string) => void;
  setActiveWorkbenchTabId: (id: string) => void;
  setAutoSave: (value: boolean) => void;
  setFileDirty: (fileName: string, isDirty: boolean) => void;
  saveFile: (fileName: string) => void;
  saveAllFiles: () => void;
  setProjectFiles: (files: Array<{ name: string; type: "file" | "folder"; path: string }>) => void;
  addProjectFile: (name: string, type: "file" | "folder", path: string) => void;
  setCurrentProject: (projectName: string | null) => void;
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
  processingStatus: "idle" as const,
  theme: "dark" as const,
  isAgentSidebarOpen: false,
  isTerminalOpen: false,
  isChatPanelOpen: false,
  isLeftSidebarOpen: true,
  activeLeftSidebarTab: "explorer",
  conversations: [
    { id: "default", topic: "New Agent", messages: [] }
  ] as Conversation[],
  activeConversationId: "default",
  activeFile: null as string | null,
  workbenchTabs: [] as WorkbenchTab[],
  activeWorkbenchTabId: null as string | null,
  autoSave: true,
  dirtyFiles: [] as string[],
  projectFiles: [] as Array<{ name: string; type: "file" | "folder"; path: string }>,
  isOpenFileDialogOpen: false,
  isOpenFolderDialogOpen: false,
  isSaveAsDialogOpen: false,
  fileContents: {} as Record<string, string>,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
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
      addProjectFile: (name, type, path) => set((s) => {
        const exists = s.projectFiles.some(f => f.name === name);
        if (exists) return {};
        return {
          projectFiles: [...s.projectFiles, { name, type, path }]
        };
      }),
      setCurrentProject: (projectName) => set({ currentProject: projectName }),
      setOpenFileDialogOpen: (value) => set({ isOpenFileDialogOpen: value }),
      setOpenFolderDialogOpen: (value) => set({ isOpenFolderDialogOpen: value }),
      setSaveAsDialogOpen: (value) => set({ isSaveAsDialogOpen: value }),
      setFileContent: (fileName, content) => set((s) => ({
        fileContents: { ...s.fileContents, [fileName]: content }
      })),
      addConversation: () => set((s) => {
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
        autoSave: state.autoSave,
        theme: state.theme,
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

