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
import type { WorkspaceIndex } from "@/lib/workspace-index";
import type { ProjectCatalog } from "@/lib/catalog/types";
import type { JobResults } from "@/lib/job-results";
import type { WorkStep } from "@/lib/work-steps";
import { conversationTitleFromText, isPlaceholderTopic } from "@/lib/conversation-title";
import { defaultPluginEnabled } from "@/lib/plugins/catalog";
import type { PluginSecrets } from "@/lib/plugins/types";

export interface ConversationMessage {
  id?: string;
  sender: "user" | "agent";
  text: string;
  preamble?: any | null; // using any here since StreamPreamble import might be messy, or we can just import it
  thinkingStartedAt?: number;
  thinkingDuration?: number;
  thought?: string;
  awaitingApproval?: boolean;
  taskFolder?: string;
  workSteps?: WorkStep[];
  timestamp?: string;
  isStreaming?: boolean;
  interrupted?: boolean;
  interruptKind?: "network" | "empty" | "stalled" | "engine";
}

export interface TimelineEvent {
  id: string;
  at: string;
  action: "opened" | "saved" | "created" | "job";
  label: string;
  path?: string;
}

export interface Conversation {
  id: string;
  topic: string;
  messages: ConversationMessage[];
  hidden?: boolean;
  inputVal?: string;
  isGenerating?: boolean;
}

export interface WorkbenchTab {
  id: string;
  type: "file" | "settings" | "view";
  title: string;
}

export interface PendingFileChange {
  id: string;
  name: string;
  path: string;
  kind: "created" | "edited";
  previousContent: string;
  content: string;
  additions: number;
  deletions: number;
}

export interface AgentSettings {
  textSize: "Small" | "Default" | "Large" | "Extra Large";
  submitWithCtrlEnter: boolean;
  maxTabCount: { value: number | string; type: "5" | "10" | "Unlimited" | "Custom" };
  queueMessages: "Send after current message" | "Stop & send right away";
  agentAutocomplete: boolean;
  autoApproveModeTransitions: boolean;
  orchestraChoice: "auto" | "fast" | "thinking";
}

export interface RecentProject {
  name: string;
  path: string;      // best-effort – may be relative for browser-picked folders
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
  lastJobResults: JobResults | null;
  currentProject: string | null;
  workspaceRoot: string | null;
  lastWorkspaceRoot: string | null;
  lastCurrentProject: string | null;
  workspaceIndex: WorkspaceIndex | null;
  projectCatalog: ProjectCatalog | null;
  recentProjects: RecentProject[];
  processingStatus: "idle" | "running" | "complete" | "error";
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
  fileTimeline: TimelineEvent[];
  pushTimelineEvent: (event: Omit<TimelineEvent, "id" | "at"> & { id?: string; at?: string }) => void;
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
  pluginState: { enabled: Record<string, boolean>; secrets: PluginSecrets };
  setPluginEnabled: (id: string, enabled: boolean) => void;
  setPluginSecret: (key: keyof PluginSecrets, value: string) => void;
  setAuthenticated: (value: boolean) => void;
  setUser: (user: UserProfile | null) => void;
  patchUser: (partial: Partial<UserProfile>) => void;
  setOnboardingStep: (step: OnboardingStep) => void;
  setDiscipline: (discipline: DisciplineId) => void;
  setAgent: (agent: AgentProfile | null) => void;
  completeOnboarding: () => void;
  setWorkspaceView: (view: WorkspaceView) => void;
  presentJobResults: (results: JobResults) => void;
  setProcessingStatus: (status: "idle" | "running" | "complete" | "error") => void;
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
  setWorkspaceRoot: (root: string | null, index?: WorkspaceIndex | null) => void;
  setProjectCatalog: (catalog: ProjectCatalog | null) => void;
  setOpenFileDialogOpen: (value: boolean) => void;
  setOpenFolderDialogOpen: (value: boolean) => void;
  setSaveAsDialogOpen: (value: boolean) => void;
  setFileContent: (fileName: string, content: string) => void;
  addConversation: () => void;
  startBlankChat: () => void;
  openChatFromHistory: (id: string) => void;
  clearWindowWorkspace: () => void;
  hideConversation: (id: string) => void;
  removeConversation: (id: string) => void;
  updateConversationTopic: (id: string, topic: string) => void;
  addMessageToConversation: (id: string, msg: ConversationMessage) => void;
  updateMessageInConversation: (conversationId: string, messageId: string, updates: Partial<ConversationMessage>) => void;
  setConversationState: (id: string, state: Partial<Conversation>) => void;
  reset: () => void;
  isHistoryModalOpen: boolean;
  setHistoryModalOpen: (value: boolean) => void;
  pendingPrompt: string | null;
  setPendingPrompt: (prompt: string | null) => void;
  pendingFileChanges: PendingFileChange[];
  enqueuePendingFileChanges: (changes: PendingFileChange[]) => void;
  removePendingFileChange: (id: string) => void;
  clearPendingFileChanges: () => void;
}

function prependTimeline(events: TimelineEvent[] | undefined, event: Omit<TimelineEvent, "id" | "at"> & { id?: string; at?: string }): TimelineEvent[] {
  const next: TimelineEvent = {
    id: event.id || `tl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    at: event.at || new Date().toISOString(),
    action: event.action,
    label: event.label,
    path: event.path,
  };
  const withoutDup = (events || []).filter(
    (item) => !(item.action === next.action && item.path && item.path === next.path && Date.now() - Date.parse(item.at) < 4000)
  );
  return [next, ...withoutDup].slice(0, 80);
}

function persistableConversations(conversations: Conversation[]): Conversation[] {
  return conversations.map((conversation) => {
    const firstUser = conversation.messages.find((message) => message.sender === "user")?.text || "";
    const topic =
      !isPlaceholderTopic(conversation.topic)
        ? conversation.topic
        : conversationTitleFromText(firstUser) || conversation.topic;
    return {
      id: conversation.id,
      topic,
      hidden: conversation.hidden,
      inputVal: conversation.inputVal,
      isGenerating: false,
      messages: conversation.messages.map((message) => ({
        ...message,
        isStreaming: false,
      })),
    };
  });
}

const initialState = {
  isAuthenticated: false,
  onboardingComplete: false,
  onboardingStep: "welcome" as OnboardingStep,
  user: null,
  selectedDiscipline: null,
  assignedAgent: null,
  workspaceView: "dashboard" as WorkspaceView,
  lastJobResults: null as JobResults | null,
  currentProject: null as string | null,
  workspaceRoot: null as string | null,
  lastWorkspaceRoot: null as string | null,
  lastCurrentProject: null as string | null,
  workspaceIndex: null as WorkspaceIndex | null,
  projectCatalog: null as ProjectCatalog | null,
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
  fileTimeline: [] as TimelineEvent[],
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
    orchestraChoice: "auto" as const,
  },
  pluginState: {
    enabled: defaultPluginEnabled(),
    secrets: {},
  },
  isHistoryModalOpen: false,
  pendingPrompt: null,
  pendingFileChanges: [] as PendingFileChange[],
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
      setAgentSettings: (settings) => set((s) => ({ agentSettings: { ...s.agentSettings, ...settings } })),
      setPluginEnabled: (id, enabled) =>
        set((s) => ({
          pluginState: {
            enabled: { ...(s.pluginState?.enabled || defaultPluginEnabled()), [id]: enabled },
            secrets: s.pluginState?.secrets || {},
          },
        })),
      setPluginSecret: (key, value) =>
        set((s) => ({
          pluginState: {
            enabled: s.pluginState?.enabled || defaultPluginEnabled(),
            secrets: { ...(s.pluginState?.secrets || {}), [key]: value },
          },
        })),
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
      presentJobResults: (results) =>
        set((s) => {
          const id = "visualization";
          const title = results.taskFolder || "Results";
          const alreadyOpen = s.workbenchTabs.some((t) => t.id === id);
          const workbenchTabs = alreadyOpen
            ? s.workbenchTabs.map((t) => (t.id === id ? { ...t, title } : t))
            : [...s.workbenchTabs, { id, type: "view" as const, title }];
          const reveal =
            results.activeLayerId ||
            results.files.find((file: string) => /\.(tif|tiff|asc|npz|npy)$/i.test(file)) ||
            results.productsRel;
          return {
            lastJobResults: results,
            workbenchTabs,
            activeWorkbenchTabId: id,
            workspaceView: "visualization" as WorkspaceView,
            activeFile: reveal,
            fileTimeline: prependTimeline(s.fileTimeline, {
              action: "job",
              label: title,
              path: typeof reveal === "string" ? reveal : undefined,
            }),
          };
        }),
      setProcessingStatus: (status) => set({ processingStatus: status }),
      setTheme: (theme) => set({ theme }),
      toggleAgentSidebar: () => set((s) => ({ isAgentSidebarOpen: !s.isAgentSidebarOpen })),
      toggleTerminal: () => set((s) => ({ isTerminalOpen: !s.isTerminalOpen })),
      toggleChatPanel: () => set((s) => {
        if (s.isChatPanelOpen) return { isChatPanelOpen: false };
        const visible = s.conversations.filter((c) => !c.hidden);
        if (visible.length > 0) return { isChatPanelOpen: true };
        const newId = `chat_${Date.now()}`;
        return {
          isChatPanelOpen: true,
          conversations: [...s.conversations, { id: newId, topic: "New Agent", messages: [], hidden: false }],
          activeConversationId: newId,
        };
      }),
      setChatPanelOpen: (value) => set((s) => {
        if (!value) return { isChatPanelOpen: false };
        const visible = s.conversations.filter((c) => !c.hidden);
        if (visible.length > 0) return { isChatPanelOpen: true };
        const newId = `chat_${Date.now()}`;
        return {
          isChatPanelOpen: true,
          conversations: [...s.conversations, { id: newId, topic: "New Agent", messages: [], hidden: false }],
          activeConversationId: newId,
        };
      }),
      toggleLeftSidebar: () => set((s) => ({ isLeftSidebarOpen: !s.isLeftSidebarOpen })),
      setLeftSidebarOpen: (value) => set({ isLeftSidebarOpen: value }),
      setActiveLeftSidebarTab: (tab) => set({ activeLeftSidebarTab: tab }),
      setLeftSidebarWidth: (width) => set({ leftSidebarWidth: width }),
      setAIPanelWidth: (width) => set({ aiPanelWidth: width }),
      setAgentSidebarWidth: (width) => set({ agentSidebarWidth: width }),
      setLayoutMode: (mode) => set({ layoutMode: mode }),
      setPrivacyMode: (mode) => set({ privacyMode: mode }),
      setActiveConversationId: (id) => set((s) => ({
        activeConversationId: id,
        conversations: s.conversations.map(c => c.id === id ? { ...c, hidden: false } : c)
      })),
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
          activeFile: file,
          fileTimeline:
            type === "file"
              ? prependTimeline(s.fileTimeline, { action: "opened", label: title, path: file || undefined })
              : s.fileTimeline,
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
        dirtyFiles: s.dirtyFiles.filter(f => f !== fileName),
        fileTimeline: prependTimeline(s.fileTimeline, {
          action: "saved",
          label: fileName.split(/[\\/]/).pop() || fileName,
          path: fileName,
        }),
      })),
      pushTimelineEvent: (event) => set((s) => ({
        fileTimeline: prependTimeline(s.fileTimeline, event),
      })),
      saveAllFiles: () => set({ dirtyFiles: [] }),
      setProjectFiles: (files) => set({ projectFiles: files }),
      addProjectFile: (file) => set((s) => {
        if (s.projectFiles.some((f) => f.id === file.id)) return {};
        return { projectFiles: [...s.projectFiles, file] };
      }),
      setCurrentProject: (projectName, path, fileCount) => set((s) => {
        if (!projectName) return { currentProject: null };
        const entry: RecentProject = {
          name: projectName,
          path: path ?? projectName,
          openedAt: new Date().toISOString(),
          fileCount: fileCount ?? 0,
        };
        const filtered = s.recentProjects.filter((p) => p.name !== projectName && p.path !== entry.path);
        return {
          currentProject: projectName,
          lastCurrentProject: projectName,
          lastWorkspaceRoot: path || s.workspaceRoot || s.lastWorkspaceRoot,
          recentProjects: [entry, ...filtered].slice(0, 10),
        };
      }),
      setWorkspaceRoot: (root, index) => set((s) => ({
        workspaceRoot: root,
        workspaceIndex: index ?? null,
        ...(root ? { lastWorkspaceRoot: root } : {}),
      })),
      setProjectCatalog: (catalog) => set({ projectCatalog: catalog }),
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
          const visibleCount = s.conversations.filter(c => !c.hidden).length;
          if (!isNaN(limitNum) && visibleCount >= limitNum) {
            return {}; // Max tabs reached
          }
        }
        
        const newId = Date.now().toString();
        return {
          conversations: [
            ...s.conversations,
            { id: newId, topic: "New Agent", messages: [], hidden: false }
          ],
          activeConversationId: newId,
        };
      }),
      startBlankChat: () => set((s) => {
        const kept = s.conversations
          .filter((c) => c.messages.length > 0)
          .map((c) => ({ ...c, hidden: true, isGenerating: false }));
        const newId = `chat_${Date.now()}`;
        return {
          conversations: [...kept, { id: newId, topic: "New Agent", messages: [], hidden: false }],
          activeConversationId: newId,
          isChatPanelOpen: true,
        };
      }),
      openChatFromHistory: (id) => set((s) => {
        const kept = s.conversations
          .filter((c) => c.messages.length > 0 || c.id === id)
          .map((c) => ({
            ...c,
            hidden: c.id !== id,
            isGenerating: false,
          }));
        if (!kept.some((c) => c.id === id)) {
          kept.push({ id, topic: "New Agent", messages: [], hidden: false, isGenerating: false });
        }
        return {
          conversations: kept,
          activeConversationId: id,
          isChatPanelOpen: true,
        };
      }),
      clearWindowWorkspace: () => set({
        currentProject: null,
        workspaceRoot: null,
        workspaceIndex: null,
        projectCatalog: null,
        projectFiles: [],
        fileContents: {},
        workbenchTabs: [],
        activeFile: null,
        activeWorkbenchTabId: null,
        workspaceView: "dashboard",
        lastJobResults: null,
      }),
      hideConversation: (id) => set((s) => {
        const updated = s.conversations.map((c) => (c.id === id ? { ...c, hidden: true } : c));
        const visibleConvos = updated.filter((c) => !c.hidden);
        const hasRemaining = visibleConvos.length > 0;
        const nextActiveId = hasRemaining
          ? (s.activeConversationId === id ? visibleConvos[visibleConvos.length - 1].id : s.activeConversationId)
          : id;

        return {
          conversations: updated,
          activeConversationId: nextActiveId,
          isChatPanelOpen: hasRemaining,
        };
      }),
      removeConversation: (id) => set((s) => {
        const updated = s.conversations.filter(c => c.id !== id);
        const visibleConvos = updated.filter(c => !c.hidden);
        const hasRemaining = visibleConvos.length > 0;
        
        let nextActiveId = s.activeConversationId;
        if (s.activeConversationId === id) {
          nextActiveId = hasRemaining ? visibleConvos[visibleConvos.length - 1].id : "default";
        }

        return {
          conversations: updated.length === 0 ? [{ id: "default", topic: "New Agent", messages: [], hidden: false }] : updated,
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
      updateMessageInConversation: (conversationId, messageId, updates) => set((s) => ({
        conversations: s.conversations.map(c => 
          c.id === conversationId 
            ? { ...c, messages: c.messages.map(m => m.id === messageId ? { ...m, ...updates } : m) } 
            : c
        )
      })),
      setConversationState: (id, state) => set((s) => ({
        conversations: s.conversations.map(c => c.id === id ? { ...c, ...state } : c)
      })),
      reset: () => set(initialState),
      setHistoryModalOpen: (value) => set({ isHistoryModalOpen: value }),
      setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),
      enqueuePendingFileChanges: (changes) => set((state) => {
        if (!changes.length) return {};
        const next = [...state.pendingFileChanges];
        for (const change of changes) {
          const idx = next.findIndex((item) => item.id === change.id);
          if (idx >= 0) next[idx] = change;
          else next.push(change);
        }
        return { pendingFileChanges: next };
      }),
      removePendingFileChange: (id) => set((state) => ({
        pendingFileChanges: state.pendingFileChanges.filter((item) => item.id !== id),
      })),
      clearPendingFileChanges: () => set({ pendingFileChanges: [] }),
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
        lastCurrentProject: state.lastCurrentProject,
        lastWorkspaceRoot: state.lastWorkspaceRoot,
        recentProjects: state.recentProjects,
        autoSave: state.autoSave,
        theme: state.theme,
        layoutMode: state.layoutMode,
        privacyMode: state.privacyMode,
        agentSettings: state.agentSettings,
        pluginState: state.pluginState,
        conversations: persistableConversations(state.conversations),
        fileTimeline: (state.fileTimeline || []).slice(0, 80),
        isChatPanelOpen: state.isChatPanelOpen,
      }),
      version: 3,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          return { ...initialState, theme: persistedState?.theme || "dark" };
        }
        let next = persistedState || {};
        if (version < 2) {
          const { currentProject, workspaceRoot, ...rest } = next;
          next = {
            ...rest,
            lastWorkspaceRoot: next.lastWorkspaceRoot || workspaceRoot || null,
            lastCurrentProject: next.lastCurrentProject || currentProject || null,
          };
        }
        if (version < 3) {
          next = {
            ...next,
            pluginState: next.pluginState || { enabled: defaultPluginEnabled(), secrets: {} },
          };
        }
        return next;
      },
    }
  )
);