/** Exact values stored in the Creator field `Response_Choice`. */
export const RESPONSE_CHOICES = ["Approved", "Needs Changes", "Rejected"] as const;
export type ResponseChoice = (typeof RESPONSE_CHOICES)[number];

/** Client-side form state (before mapping to Creator). */
export interface DealResponseFormValues {
  responseText: string;
  responseChoice: ResponseChoice | null;
  file: File | null;
}

/** Field-level validation errors keyed by form field. */
export interface DealResponseFormErrors {
  responseText?: string;
  responseChoice?: string;
  file?: string;
}

/** Payload that maps 1:1 onto the Creator form "Deal Response Form". */
export interface DealResponseRecordPayload {
  Response_Text: string;
  Response_Choice: ResponseChoice;
  CRM_Deal_ID: string;
}

export type SubmitStatus = "idle" | "submitting" | "success" | "error";

export interface CreateRecordResult {
  success: true;
  recordId: string;
}

export interface UploadFileResult {
  success: true;
}

export interface SubmitDealResponseResult {
  success: true;
  recordId: string;
}

export type CreatorErrorStage = "create" | "upload" | "config";

/**
 * Error thrown by the service layer. `stage` lets the UI distinguish
 * "record creation failed" from "record created but upload failed".
 */
export class CreatorServiceError extends Error {
  readonly stage: CreatorErrorStage;
  readonly recordId?: string;

  constructor(message: string, stage: CreatorErrorStage, recordId?: string) {
    super(message);
    this.name = "CreatorServiceError";
    this.stage = stage;
    this.recordId = recordId;
  }
}
