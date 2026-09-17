/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_CREATOR_MOCK?: string;
  readonly VITE_CREATOR_APP_NAME?: string;
  readonly VITE_CREATOR_FORM_LINK_NAME?: string;
  readonly VITE_CREATOR_REPORT_LINK_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
