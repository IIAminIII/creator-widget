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
const APP_LINK_NAME: string =
  import.meta.env.VITE_CREATOR_APP_NAME || __CREATOR_APP_NAME__ || "external-deal-response";
const FORM_LINK_NAME: string =
  import.meta.env.VITE_CREATOR_FORM_LINK_NAME || __CREATOR_FORM_LINK_NAME__ || "Deal_Response_Form";
const UPLOAD_FIELD_LINK_NAME = "Upload_File";
/** Set after a successful upload so Creator's "Edited" workflow can sync the file to CRM. */
const FILE_SYNC_STATUS_FIELD = "CRM_File_Sync_Status";
const FILE_SYNC_PENDING_VALUE = "Pending";
/** Report link name used by uploadFile (Creator's uploadFile requires a report context). */
const REPORT_LINK_NAME: string =
  import.meta.env.VITE_CREATOR_REPORT_LINK_NAME || __CREATOR_REPORT_LINK_NAME__ || "All_Responses";

/**
 * Publish keys ("private links") of the published form and report.
 * When BOTH are set the PUBLISH API is used (anonymous/external users).
 * When unset the DATA/FILE API is used (logged-in Creator users).
 * These keys already appear in the public publish URLs, so they are not secrets.
 */
const FORM_PRIVATE_LINK: string =
  import.meta.env.VITE_CREATOR_FORM_PRIVATE_LINK || __CREATOR_FORM_PRIVATE_LINK__ || "";
const REPORT_PRIVATE_LINK: string =
  import.meta.env.VITE_CREATOR_REPORT_PRIVATE_LINK || __CREATOR_REPORT_PRIVATE_LINK__ || "";

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
  updateRecordById?(config: ZohoCreatorUpdateRecordConfig): Promise<SdkResult>;
  updateRecords?(config: ZohoCreatorUpdateRecordsConfig): Promise<SdkResult>;
}

interface ZohoCreatorUpdateRecordConfig {
  app_name: string;
  report_name: string;
  id: string;
  payload: { data: Record<string, unknown> };
}

/** Bulk update by criteria. The only update call available in PUBLISH mode. */
interface ZohoCreatorUpdateRecordsConfig {
  app_name: string;
  report_name: string;
  payload: { criteria: string; data: Record<string, unknown> };
  process_until_limit?: boolean;
  private_link?: string;
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
  const flag = import.meta.env.VITE_USE_CREATOR_MOCK || __CREATOR_USE_MOCK__ || "";
  return String(flag).toLowerCase() === "true";
}

function getCreatorSdk(): ZohoCreatorSdk | null {
  if (typeof window === "undefined") return null;
  return window.ZOHO?.CREATOR ?? null;
}

/**
 * Creator appends `serviceOrigin` to the widget URL when it loads the widget
 * through a Page's Widget element. The SDK needs it to reach its parent frame;
 * without it every SDK call waits forever.
 */
function isInsideCreatorFrame(): boolean {
  if (typeof window === "undefined") return false;
  return window.parent !== window && /[?&]serviceOrigin=/.test(window.location.href);
}

function assertInsideCreatorFrame(stage: "create" | "upload"): void {
  if (isInsideCreatorFrame()) return;
  logFailure(
    "Not running inside a Zoho Creator widget frame",
    "The URL has no serviceOrigin parameter. Open the Creator Page that contains the Widget element; " +
      "do not open the hosted URL directly or embed it with an iframe/embed element.",
  );
  throw new CreatorServiceError("Zoho Creator connection is not available.", stage === "create" ? "config" : "upload");
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
  console.error(`[creatorService] ${label}`, detail, {
    api: shouldUsePublishApi() ? "PUBLISH (anonymous)" : "DATA/FILE (requires Zoho login)",
    formKeySet: FORM_PRIVATE_LINK.length > 0,
    reportKeySet: REPORT_PRIVATE_LINK.length > 0,
    app: APP_LINK_NAME,
    form: FORM_LINK_NAME,
    report: REPORT_LINK_NAME,
  });
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
  assertInsideCreatorFrame("create");
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

/**
 * Tells the Creator backend that the file is now in place.
 *
 * The form's "Created" workflow runs BEFORE the file exists (the record has to
 * be created first), and a file upload does not fire workflows. This small
 * record update fires the form's "Edited > On Success" workflow, which is where
 * the Deluge script transfers Upload_File to the CRM Deal.
 *
 * Best effort only: the user's submission is already complete, so a failure
 * here is logged and never surfaced. A Creator Schedule can sweep up any
 * record left without a file sync status.
 *
 * PUBLISH mode has no update-by-id call, so it uses the bulk update-by-criteria
 * call narrowed to this one record ID.
 */
async function creatorMarkFileReady(recordId: string): Promise<void> {
  const sdk = getCreatorSdk();
  const publish = shouldUsePublishApi();
  const data = { [FILE_SYNC_STATUS_FIELD]: FILE_SYNC_PENDING_VALUE };

  let call: Promise<SdkResult> | null = null;
  if (publish) {
    const api = sdk?.PUBLISH;
    if (api?.updateRecords) {
      call = api.updateRecords({
        app_name: APP_LINK_NAME,
        report_name: REPORT_LINK_NAME,
        payload: { criteria: `ID == ${recordId}`, data },
        process_until_limit: false,
        private_link: REPORT_PRIVATE_LINK,
      });
    }
  } else {
    const api = sdk?.DATA;
    if (api?.updateRecordById) {
      call = api.updateRecordById({
        app_name: APP_LINK_NAME,
        report_name: REPORT_LINK_NAME,
        id: recordId,
        payload: { data },
      });
    }
  }
  if (!call) return;

  try {
    const res = parseSdkResult(await withTimeout(call, ADD_RECORD_TIMEOUT_MS, "file-ready update"));
    if (!isSuccessfulResponse(res)) logFailure("file-ready update returned an error (non-fatal)", res);
  } catch (err) {
    logFailure("file-ready update failed (non-fatal)", err);
  }
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
  if (!util || !isInsideCreatorFrame()) return {};

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

  if (getCreatorMode() === "creator") {
    await creatorMarkFileReady(recordId);
  } else {
    devLog("MOCK updateRecordById", { id: recordId, [FILE_SYNC_STATUS_FIELD]: FILE_SYNC_PENDING_VALUE });
  }

  return { success: true, recordId };
}
