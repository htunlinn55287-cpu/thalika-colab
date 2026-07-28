export {};

declare global {
  interface Window {
    thalikaDesktop?: {
      isElectron: boolean;
      platform: string;
      openStorageFolder?: (folderId: string) => Promise<{ ok: boolean; error?: string }>;
    };
  }
}
