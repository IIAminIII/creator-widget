/**
 * Creator service layer.
 *
 * ALL Zoho Creator SDK interaction lives in this file. Visual components and
 * hooks never touch `window.ZOHO` directly.
 *
 * Two modes:
 *  1. Mock mode  - VITE_USE_CREATOR_MOCK=true, or window.ZOHO unavailable.
 *  2. Creator    - uses ZOHO.CREATOR.PUBLISH.addRecords / uploadFile.
 *
 * NOTE: Transferring Upload_File to a Zoho CRM custom File Upload field is a
 * backend (Creator/Deluge) concern and is intentionally NOT implemented here.
 */

import {
  CreatorServiceError,
  type CreateRecordResult,
  type DealResponseRecordPayload,
  type SubmitDealResponseResult,
  type UploadFileResult,
} from "../types/form";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Creator application link name (SDK v2 requires it on every call). */
const APP_LINK_NAME: string = import.meta.env.VITE_CREATOR_APP_NAME || "external-deal-response";
const FORM_LINK_NAME: string = import.meta.env.VITE_CREATOR_FORM_LINK_NAME || "Deal_Response_Form";
const UPLOAD_FIELD_LINK_NAME = "Upload_File";
/** Report link name used by uploadFile (Creator's uploadFile requires a report context). */
const REPORT_LINK_NAME: string = import.meta.env.VITE_CREATOR_REPORT_LINK_NAME || "All_Deal_Responses";

const MOCK_DELAY_MS = 900;
const isDev = import.meta.env.DEV;

// ---------------------------------------------------------------------------
// Minimal typing for the parts of the Creator Widget SDK v2 we call.
// https://static.zohocdn.com/creator/widgets/version/2.0/widgetsdk-min.js
// ---------------------------------------------------------------------------

interface ZohoCreatorAddRecordsConfig {
  app_name: string;
  form_name: string;
  payload: { data: Record<string, unknown> };
}

interface ZohoCreatorUploadFileConfig {
  app_name: string;
  report_name: string;
  id: string;
  field_name: string;
  file: File;
}

interface ZohoCreatorResponse {
  code?: number;
  data?: { ID?: string | number; [key: string]: unknown };
  message?: string;
  error?: unknown;
}

interface ZohoCreatorPublishApi {
  addRecords(config: ZohoCreatorAddRecordsConfig): Promise<ZohoCreatorResponse>;
  uploadFile(config: ZohoCreatorUploadFileConfig): Promise<ZohoCreatorResponse>;
}

type ParamGetter = () => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;

interface ZohoCreatorUtilApi {
  getQueryParams?: ParamGetter;
  getWidgetParams?: ParamGetter;
  getInitParams?: ParamGetter;
}

interface ZohoSdk {
  CREATOR?: {
    PUBLISH?: ZohoCreatorPublishApi;
    UTIL?: ZohoCreatorUtilApi;
    init?: () => Promise<unknown>;
  };
}

declare global {
  interface Window {
    ZOHO?: ZohoSdk;
  }
}

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

export type CreatorMode = "mock" | "creator";

function isMockFlagEnabled(): boolean {
  return String(import.meta.env.VITE_USE_CREATOR_MOCK ?? "").toLowerCase() === "true";
}

function getCreatorPublishApi(): ZohoCreatorPublishApi | null {
  if (typeof window === "undefined") return null;
  return window.ZOHO?.CREATOR?.PUBLISH ?? null;
}

export function getCreatorMode(): CreatorMode {
  if (isMockFlagEnabled()) return "mock";
  if (!getCreatorPublishApi()) {
    if (isDev) {
      console.warn("[creatorService] window.ZOHO not available - falling back to mock mode.");
    }
    return "mock";
  }
  return "creator";
}

// ---------------------------------------------------------------------------
// Logging (development only)
// ---------------------------------------------------------------------------

function devLog(...args: unknown[]): void {
  if (isDev) console.info("[creatorService]", ...args);
}

// ---------------------------------------------------------------------------
// Mock implementation
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockRecordId(): string {
  return `MOCK_${Math.floor(100000 + Math.random() * 900000)}`;
}

async function mockCreateRecord(payload: DealResponseRecordPayload): Promise<CreateRecordResult> {
  devLog("MOCK addRecords", { app_name: APP_LINK_NAME, form_name: FORM_LINK_NAME, payload: { data: payload } });
  await sleep(MOCK_DELAY_MS);
  const recordId = mockRecordId();
  devLog("MOCK addRecords -> recordId", recordId);
  return { success: true, recordId };
}

async function mockUploadFile(recordId: string, file: File): Promise<UploadFileResult> {
  devLog("MOCK uploadFile", {
    app_name: APP_LINK_NAME,
    report_name: REPORT_LINK_NAME,
    id: recordId,
    field_name: UPLOAD_FIELD_LINK_NAME,
    file: { name: file.name, size: file.size, type: file.type },
  });
  await sleep(MOCK_DELAY_MS);
  devLog("MOCK uploadFile -> ok");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Zoho Creator implementation
// ---------------------------------------------------------------------------

let initPromise: Promise<void> | null = null;

async function ensureCreatorInitialised(): Promise<ZohoCreatorPublishApi> {
  const api = getCreatorPublishApi();
  if (!api) {
    throw new CreatorServiceError("Zoho Creator SDK is not available.", "config");
  }
  if (!APP_LINK_NAME) {
    devLog("VITE_CREATOR_APP_NAME is not set; SDK v2 calls require the app link name.");
    throw new CreatorServiceError("Zoho Creator application name is not configured.", "config");
  }
  const init = window.ZOHO?.CREATOR?.init;
  if (init && !initPromise) {
    initPromise = Promise.resolve(init()).then(() => undefined);
  }
  if (initPromise) await initPromise;
  return api;
}

function isSuccessfulResponse(res: ZohoCreatorResponse | undefined): boolean {
  if (!res) return false;
  return res.code === 3000 || res.code === 200 || (res.code === undefined && !res.error);
}

async function creatorCreateRecord(payload: DealResponseRecordPayload): Promise<CreateRecordResult> {
  const api = await ensureCreatorInitialised();
  devLog("addRecords", { app_name: APP_LINK_NAME, form_name: FORM_LINK_NAME });

  let res: ZohoCreatorResponse;
  try {
    res = await api.addRecords({
      app_name: APP_LINK_NAME,
      form_name: FORM_LINK_NAME,
      payload: { data: { ...payload } },
    });
  } catch (err) {
    devLog("addRecords threw", err);
    throw new CreatorServiceError("Unable to create the response record.", "create");
  }

  const id = res?.data?.ID;
  if (!isSuccessfulResponse(res) || id === undefined || id === null) {
    devLog("addRecords failed", res);
    throw new CreatorServiceError("Unable to create the response record.", "create");
  }
  return { success: true, recordId: String(id) };
}

async function creatorUploadFile(recordId: string, file: File): Promise<UploadFileResult> {
  const api = await ensureCreatorInitialised();
  devLog("uploadFile", {
    app_name: APP_LINK_NAME,
    report_name: REPORT_LINK_NAME,
    id: recordId,
    field_name: UPLOAD_FIELD_LINK_NAME,
  });

  let res: ZohoCreatorResponse;
  try {
    res = await api.uploadFile({
      app_name: APP_LINK_NAME,
      report_name: REPORT_LINK_NAME,
      id: recordId,
      field_name: UPLOAD_FIELD_LINK_NAME,
      file,
    });
  } catch (err) {
    devLog("uploadFile threw", err);
    throw new CreatorServiceError("Unable to upload the file.", "upload", recordId);
  }

  if (!isSuccessfulResponse(res)) {
    devLog("uploadFile failed", res);
    throw new CreatorServiceError("Unable to upload the file.", "upload", recordId);
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Widget parameters (Creator Page -> widget)
// ---------------------------------------------------------------------------

/**
 * Reads parameters that a Creator Page passes to the widget through the SDK.
 * Returns an empty object when the SDK is unavailable, so callers can fall
 * back to the URL query string.
 */
export async function getCreatorWidgetParams(): Promise<Record<string, string>> {
  const util = typeof window === "undefined" ? undefined : window.ZOHO?.CREATOR?.UTIL;
  if (!util) return {};

  const init = window.ZOHO?.CREATOR?.init;
  if (init && !initPromise) {
    initPromise = Promise.resolve(init()).then(() => undefined);
  }
  try {
    if (initPromise) await initPromise;
  } catch (err) {
    devLog("ZOHO.CREATOR.init failed while reading widget params", err);
  }

  const getters: ParamGetter[] = [util.getQueryParams, util.getWidgetParams, util.getInitParams].filter(
    (fn): fn is ParamGetter => typeof fn === "function",
  );

  const merged: Record<string, string> = {};
  for (const getter of getters) {
    try {
      const result = await Promise.resolve(getter.call(util));
      if (result && typeof result === "object") {
        for (const [key, value] of Object.entries(result)) {
          if (value !== undefined && value !== null && merged[key] === undefined) {
            merged[key] = String(value);
          }
        }
      }
    } catch (err) {
      devLog("widget param getter failed", err);
    }
  }
  devLog("widget params", Object.keys(merged));
  return merged;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Creates the "Deal Response Form" record and returns its Creator ID. */
export async function createDealResponseRecord(
  payload: DealResponseRecordPayload,
): Promise<CreateRecordResult> {
  return getCreatorMode() === "mock" ? mockCreateRecord(payload) : creatorCreateRecord(payload);
}

/** Uploads a file into the `Upload_File` field of an existing record. */
export async function uploadDealResponseFile(recordId: string, file: File): Promise<UploadFileResult> {
  return getCreatorMode() === "mock" ? mockUploadFile(recordId, file) : creatorUploadFile(recordId, file);
}

/**
 * Full submission: create record, then upload the file into the same record.
 * Throws CreatorServiceError with `stage` = "create" | "upload" | "config".
 */
export async function submitDealResponse(
  payload: DealResponseRecordPayload,
  file: File,
): Promise<SubmitDealResponseResult> {
  devLog(`submitDealResponse (mode: ${getCreatorMode()})`);

  const { recordId } = await createDealResponseRecord(payload);

  try {
    await uploadDealResponseFile(recordId, file);
  } catch (err) {
    if (err instanceof CreatorServiceError) throw err;
    throw new CreatorServiceError("Unable to upload the file.", "upload", recordId);
  }

  return { success: true, recordId };
}
