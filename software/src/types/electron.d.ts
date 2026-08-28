export {};

type GaidAuthSession = {
  access_token: string;
  refresh_token: string;
};

type GaidAuthError = {
  code: string;
  message: string;
};

interface GaidWorkspaceIndexFile {
  relativePath: string;
  name: string;
  size: number;
  ext: string;
  kind: string;
}

interface GaidWorkspaceIndex {
  root: string;
  folders: string[];
  files: GaidWorkspaceIndexFile[];
  truncated: boolean;
}

declare global {
  interface GaidDesktopBridge {
    isDesktop: true;
    openExternal: (url: string) => Promise<void>;
    getAuthBaseUrl: () => Promise<string>;
    isPublicLoginConfigured: () => Promise<boolean>;
    startPublicLogin: (mode?: "login" | "signup") => Promise<{ started: boolean; reason?: string }>;
    cancelPublicLogin: () => Promise<void>;
    getPendingAuthSession: () => Promise<GaidAuthSession | null>;
    openAuxWindow: (pathname: string) => Promise<void>;
    openNewWindow: () => Promise<void>;
    pickFolder: (options?: { title?: string }) => Promise<string | null>;
    indexWorkspace: (root: string) => Promise<GaidWorkspaceIndex>;
    searchWorkspace: (
      root: string,
      query: string,
      options?: { maxHits?: number }
    ) => Promise<
      {
        relativePath: string;
        name: string;
        kind: string;
        score: number;
        why: string;
        snippet?: string;
      }[]
    >;
    readWorkspaceFile: (
      root: string,
      relativePath: string
    ) => Promise<{
      text: string;
      size: number;
      truncated: boolean;
      binary?: boolean;
      media?: string;
      kind?: string;
      companion?: string;
    }>;
    createWorkspaceFile: (
      root: string,
      relativePath: string,
      content?: string
    ) => Promise<string>;
    saveWorkspaceFile: (
      root: string,
      relativePath: string,
      content?: string
    ) => Promise<string>;
    createWorkspaceFolder: (root: string, relativePath: string) => Promise<string>;
    deleteWorkspacePath: (root: string, relativePath: string) => Promise<string>;
    moveWorkspacePath: (root: string, fromRel: string, destFolderRel?: string) => Promise<string>;
    copyWorkspacePath: (root: string, fromRel: string, destFolderRel?: string) => Promise<string>;
    renameWorkspacePath: (root: string, fromRel: string, newName: string) => Promise<string>;
    cloneGitRepo: (url: string, destParent: string) => Promise<string>;
    showItemInFolder: (root: string, relativePath?: string) => Promise<void>;
    openPath: (root: string, relativePath?: string) => Promise<void>;
    dismissBootCover: () => void;
    onAuthSession: (callback: (session: GaidAuthSession) => void) => () => void;
    onAuthError: (callback: (error: GaidAuthError) => void) => () => void;
  }

  interface Window {
    gaidDesktop?: GaidDesktopBridge;
  }
}
