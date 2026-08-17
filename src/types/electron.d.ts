export {};

type GaidAuthCallback = (url: string) => void;

declare global {
  interface GaidDesktopBridge {
    isDesktop: true;
    openExternal: (url: string) => Promise<void>;
    getAuthBaseUrl: () => Promise<string>;
    getPendingAuthUrl: () => Promise<string | null>;
    openAuxWindow: (pathname: string) => Promise<void>;
    dismissBootCover: () => void;
    onAuthCallback: (callback: GaidAuthCallback) => () => void;
  }

  interface Window {
    gaidDesktop?: GaidDesktopBridge;
  }
}
