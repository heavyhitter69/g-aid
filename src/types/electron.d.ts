export {};

type GaidAuthCallback = (url: string) => void;

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
    getPendingAuthUrl: () => Promise<string | null>;
    openAuxWindow: (pathname: string) => Promise<void>;
    pickFolder: () => Promise<string | null>;
    indexWorkspace: (root: string) => Promise<GaidWorkspaceIndex>;
    readWorkspaceFile: (
      root: string,
      relativePath: string
    ) => Promise<{ text: string; size: number; truncated: boolean }>;
    createWorkspaceFile: (
      root: string,
      relativePath: string,
      content?: string
    ) => Promise<string>;
    createWorkspaceFolder: (root: string, relativePath: string) => Promise<string>;
    dismissBootCover: () => void;
    onAuthCallback: (callback: GaidAuthCallback) => () => void;
  }

  interface Window {
    gaidDesktop?: GaidDesktopBridge;
  }
}
