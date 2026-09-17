/**
 * Creator service layer.
 *
 * ALL Zoho Creator SDK interaction lives in this file. Visual components and
 * hooks never touch `window.ZOHO` directly.
 *
 * Modes:
 *  1. Mock mode - VITE_USE_CREATOR_MOCK=true, or window.ZOHO unavailable.
 *  2. Creator   - Widget SDK v2.
 *       - Logged-in users:          ZOHO.CREATOR.DATA.addRecords + ZOHO.CREATOR.FILE.uploadFile
 *       - External/anonymous users: ZOHO.CREATOR.PUBLISH.addRecords + PUBLISH.uploadFile
 *         (requires the publish keys, see FORM_PRIVATE_LINK / REPORT_PRIVATE_LINK)
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

/**
 * Creator application link name. SDK v2 fills it in from the hosting app when
 * omitted, but being explicit avoids surprises.
 */
const APP_LINK_NAME: string = import.meta.env.VITE_CREATOR_APP_NAME || "external-deal-response";
const FORM_LINK_NAME: string = import.meta.env.VITE_CREATOR_FORM_LINK_NAME || "Deal_Response_Form";
const UPLOAD_FIELD_LINK_NAME = "Upload_File";
/** Report link name used by uploadFile (Creator's uploadFile requires a report context). */
const REPORT_LINK_NAME: string = import.meta.env.VITE_CREATOR_REPORT_LINK_NAME || "All_Deal_Responses";

/**
 * Publish keys ("private links") of the published form and report.
 * When BOTH are set the PUBLISH API is used (anonymous/external users).
 * When unset the DATA/FILE API is used (logged-in Creator users).
 * These keys already appear in the public publish URLs, so they are not secrets.
 */
const FORM_PRIVATE_LINK: string = import.meta.env.VITE_CREATOR_FORM_PRIVATE_LINK || "";
const REPORT_PRIVATE_LINK: string = import.meta.env.VITE_CREATOR_REPORT_PRIVATE_LINK || "";

const MOCK_DELAY_MS = 900;
const ADD_RECORD_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;
const PARAMS_TIMEOUT_MS = 5_000;
const isDev = import.meta.env.DEV;

// ---------------------------------------------------------------------------
// Minimal typing for the parts of the Creator Widget SDK v2 we call.
// https://static.zohocdn.com/creator/widgets/version/2.0/widgetsdk-min.js
// v2 has no init(); every call waits internally for the parent "Load" event.
// ---------------------------------------------------------------------------

interface ZohoCreatorAddRecordsConfig {
  app_name: string;
  form_name: string;
  payload: { data: Record<string, unknown> };
  private_link?: string;
}

interface ZohoCreatorUploadFileConfig {
  app_name: string;
  report_name: string;
  id: string;
  field_name: string;
  file: File;
  private_link?: string;
}

interface ZohoCreatorResponse {
  code?: number;
  data?: { ID?: string | number; [key: string]: unknown };
  message?: string;
  error?: unknown;
}

type SdkResult = ZohoCreatorResponse | string | undefined;

interface ZohoCreatorRecordsApi {
  addRecords?(config: ZohoCreatorAddRecordsConfig): Promise<SdkResult>;
  uploadFile?(config: ZohoCreatorUploadFileConfig): Promise<SdkResult>;
}

type ParamGetter = () => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;

interface ZohoCreatorUtilApi {
  getQueryParams?: ParamGetter;
  getWidgetParams?: ParamGetter;
  getInitParams?: ParamGetter;
}

interface ZohoCreatorSdk {
  DATA?: ZohoCreatorRecordsApi;
  FILE?: ZohoCreatorRecordsApi;
  PUBLISH?: ZohoCreatorRecordsApi;
  UTIL?: ZohoCreatorUtilApi;
}

declare global {
  interface Window {
    ZOHO?: { CREATOR?: ZohoCreatorSdk };
  }
}

// ---------------------------------------------------------------------------
// Mode detection
// ---------------------------------------------------------------------------

export type CreatorMode = "mock" | "creator";

function isMockFlagEnabled(): boolean {
  return String(import.meta.env.VITE_USE_CREATOR_MOCK ?? "").toLowerCase() === "true";
}

function getCreatorSdk(): ZohoCreatorSdk | null {
  if (typeof window === "undefined") return null;
  return window.ZOHO?.CREATOR ?? null;
}

/** The PUBLISH API is used only when both publish keys are configured. */
function shouldUsePublishApi(): boolean {
  return FORM_PRIVATE_LINK.length > 0 && REPORT_PRIVATE_LINK.length > 0;
}

export function getCreatorMode(): CreatorMode {
  if (isMockFlagEnabled()) return "mock";
  if (!getCreatorSdk()) {
    if (isDev) {
      console.warn("[creatorService] window.ZOHO not available - falling back to mock mode.");
    }
    return "mock";
  }
  return "creator";
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function devLog(...args: unknown[]): void {
  if (isDev) console.info("[creatorService]", ...args);
}

/** Logged in production too: without this a failed submission cannot be debugged. */
function logFailure(label: string, detail: unknown): void {
  console.error(`[creatorService] ${label}`, detail);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rejects if the SDK never answers, so the UI can never spin forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** The SDK may hand back a JSON string or an object depending on the operation. */
function parseSdkResult(result: SdkResult): ZohoCreatorResponse | undefined {
  if (typeof result === "string") {
    try {
      return JSON.parse(result) as ZohoCreatorResponse;
    } catch {
      return { message: result };
    }
  }
  return result;
}

function isSuccessfulResponse(res: ZohoCreatorResponse | undefined): boolean {
  if (!res) return false;
  return res.code === 3000 || res.code === 200 || (res.code === undefined && !res.error);
}

// ---------------------------------------------------------------------------
// Mock implementation
// ---------------------------------------------------------------------------

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
// Zoho Creator implementation (Widget SDK v2)
// ---------------------------------------------------------------------------

async function creatorCreateRecord(payload: DealResponseRecordPayload): Promise<CreateRecordResult> {
  const sdk = getCreatorSdk();
  const publish = shouldUsePublishApi();
  const api = publish ? sdk?.PUBLISH : sdk?.DATA;
  if (!api?.addRecords) {
    logFailure("addRecords unavailable", { publish });
    throw new CreatorServiceError("Zoho Creator SDK is not available.", "config");
  }

  const config: ZohoCreatorAddRecordsConfig = {
    app_name: APP_LINK_NAME,
    form_name: FORM_LINK_NAME,
    payload: { data: { ...payload } },
  };
  if (publish) config.private_link = FORM_PRIVATE_LINK;
  devLog(`addRecords via ${publish ? "PUBLISH" : "DATA"}`, { form_name: FORM_LINK_NAME });

  let res: ZohoCreatorResponse | undefined;
  try {
    res = parseSdkResult(await withTimeout(api.addRecords(config), ADD_RECORD_TIMEOUT_MS, "addRecords"));
  } catch (err) {
    logFailure("addRecords failed", err);
    throw new CreatorServiceError("Unable to create the response record.", "create");
  }

  const id = res?.data?.ID;
  if (!isSuccessfulResponse(res) || id === undefined || id === null) {
    logFailure("addRecords returned an error", res);
    throw new CreatorServiceError("Unable to create the response record.", "create");
  }
  return { success: true, recordId: String(id) };
}

async function creatorUploadFile(recordId: string, file: File): Promise<UploadFileResult> {
  const sdk = getCreatorSdk();
  const publish = shouldUsePublishApi();
  const api = publish ? sdk?.PUBLISH : sdk?.FILE;
  if (!api?.uploadFile) {
    logFailure("uploadFile unavailable", { publish });
    throw new CreatorServiceError("Zoho Creator SDK is not available.", "upload", recordId);
  }

  const config: ZohoCreatorUploadFileConfig = {
    app_name: APP_LINK_NAME,
    report_name: REPORT_LINK_NAME,
    id: recordId,
    field_name: UPLOAD_FIELD_LINK_NAME,
    file,
  };
  if (publish) config.private_link = REPORT_PRIVATE_LINK;
  devLog(`uploadFile via ${publish ? "PUBLISH" : "FILE"}`, { report_name: REPORT_LINK_NAME, id: recordId });

  let res: ZohoCreatorResponse | undefined;
  try {
    res = parseSdkResult(await withTimeout(api.uploadFile(config), UPLOAD_TIMEOUT_MS, "uploadFile"));
  } catch (err) {
    logFailure("uploadFile failed", err);
    throw new CreatorServiceError("Unable to upload the file.", "upload", recordId);
  }

  if (!isSuccessfulResponse(res)) {
    logFailure("uploadFile returned an error", res);
    throw new CreatorServiceError("Unable to upload the file.", "upload", recordId);
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Widget parameters (Creator Page -> widget)
// ---------------------------------------------------------------------------

/**
 * Reads parameters that a Creator Page passes to the widget through the SDK.
 * Returns an empty object when the SDK is unavailable or silent, so callers
 * can fall back to the URL query string.
 */
export async function getCreatorWidgetParams(): Promise<Record<string, string>> {
  const util = getCreatorSdk()?.UTIL;
  if (!util) return {};

  const getters: ParamGetter[] = [util.getQueryParams, util.getWidgetParams, util.getInitParams].filter(
    (fn): fn is ParamGetter => typeof fn === "function",
  );

  const merged: Record<string, string> = {};
  for (const getter of getters) {
    try {
      const result = await withTimeout(Promise.resolve(getter.call(util)), PARAMS_TIMEOUT_MS, "widget params");
      if (result && typeof result === "object") {
        for (const [key, value] of Object.entries(result)) {
          if (value !== undefined && value !== null && typeof value !== "object" && merged[key] === undefined) {
            merged[key] = String(value);
          }
        }
      }
    } catch (err) {
      devLog("widget param getter failed", err);
      break; // SDK is not answering (not inside Creator); stop waiting.
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
