/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_CREATOR_MOCK?: string;
  readonly VITE_CREATOR_APP_NAME?: string;
  readonly VITE_CREATOR_FORM_LINK_NAME?: string;
  readonly VITE_CREATOR_REPORT_LINK_NAME?: string;
  readonly VITE_CREATOR_FORM_PRIVATE_LINK?: string;
  readonly VITE_CREATOR_REPORT_PRIVATE_LINK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Build-time fallbacks for the same settings without the `VITE_` prefix,
 * inlined by `define` in vite.config.ts. Empty string when unset.
 */
declare const __CREATOR_FORM_PRIVATE_LINK__: string;
declare const __CREATOR_REPORT_PRIVATE_LINK__: string;
declare const __CREATOR_APP_NAME__: string;
declare const __CREATOR_FORM_LINK_NAME__: string;
declare const __CREATOR_REPORT_LINK_NAME__: string;
declare const __CREATOR_USE_MOCK__: string;
