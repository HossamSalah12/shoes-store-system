export interface DesktopApi {
  secureStorage: {
    setRefreshToken: (token: string) => Promise<{ persisted: boolean }>;
    getRefreshToken: () => Promise<string | null>;
    clearRefreshToken: () => Promise<boolean>;
  };
  app: {
    getVersion: () => Promise<string>;
  };
  platform: string;
}

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
