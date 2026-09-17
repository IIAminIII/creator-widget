import { useCallback, useRef, useState } from "react";
import { submitDealResponse } from "../services/creatorService";
import {
  CreatorServiceError,
  RESPONSE_CHOICES,
  type DealResponseFormErrors,
  type DealResponseFormValues,
  type ResponseChoice,
  type SubmitStatus,
} from "../types/form";
import { validateFile } from "../utils/fileValidation";

const MIN_RESPONSE_LENGTH = 3;

export const FORM_MESSAGES = {
  responseRequired: "Please enter your response.",
  responseTooShort: `Your response must be at least ${MIN_RESPONSE_LENGTH} characters.`,
  choiceRequired: "Please select a response option.",
  dealMissing: "Unable to submit your response. The Deal reference is missing.",
  submitFailed: "Unable to submit your response. Please try again.",
  uploadFailed: "Your response was created, but the file could not be uploaded. Please contact support.",
} as const;

const INITIAL_VALUES: DealResponseFormValues = {
  responseText: "",
  responseChoice: null,
  file: null,
};

export function validateForm(values: DealResponseFormValues): DealResponseFormErrors {
  const errors: DealResponseFormErrors = {};

  const text = values.responseText.trim();
  if (text.length === 0) errors.responseText = FORM_MESSAGES.responseRequired;
  else if (text.length < MIN_RESPONSE_LENGTH) errors.responseText = FORM_MESSAGES.responseTooShort;

  if (!values.responseChoice || !RESPONSE_CHOICES.includes(values.responseChoice)) {
    errors.responseChoice = FORM_MESSAGES.choiceRequired;
  }

  const fileError = validateFile(values.file);
  if (fileError) errors.file = fileError;

  return errors;
}

export interface UseDealResponseFormOptions {
  crmDealId: string | null;
}

export function useDealResponseForm({ crmDealId }: UseDealResponseFormOptions) {
  const [values, setValues] = useState<DealResponseFormValues>(INITIAL_VALUES);
  const [errors, setErrors] = useState<DealResponseFormErrors>({});
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const isSubmitting = status === "submitting";

  const setResponseText = useCallback((responseText: string) => {
    setValues((v) => ({ ...v, responseText }));
    setErrors((e) => (e.responseText ? { ...e, responseText: undefined } : e));
  }, []);

  const setResponseChoice = useCallback((responseChoice: ResponseChoice) => {
    setValues((v) => ({ ...v, responseChoice }));
    setErrors((e) => (e.responseChoice ? { ...e, responseChoice: undefined } : e));
  }, []);

  /** Accepts a file after validating it; a rejected file sets an inline error and is not stored. */
  const setFile = useCallback((file: File | null) => {
    if (file) {
      const fileError = validateFile(file);
      if (fileError) {
        setErrors((e) => ({ ...e, file: fileError }));
        return;
      }
    }
    setValues((v) => ({ ...v, file }));
    setErrors((e) => (e.file ? { ...e, file: undefined } : e));
  }, []);

  const submit = useCallback(async () => {
    if (submittingRef.current) return; // prevent double submission
    setFormError(null);

    const validationErrors = validateForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    if (!crmDealId) {
      setFormError(FORM_MESSAGES.dealMissing);
      return;
    }

    submittingRef.current = true;
    setStatus("submitting");

    try {
      await submitDealResponse(
        {
          Response_Text: values.responseText.trim(),
          Response_Choice: values.responseChoice as ResponseChoice,
          CRM_Deal_ID: crmDealId,
        },
        values.file as File,
      );
      setStatus("success");
    } catch (err) {
      if (import.meta.env.DEV) console.error("[useDealResponseForm] submit failed", err);
      const message =
        err instanceof CreatorServiceError && err.stage === "upload"
          ? FORM_MESSAGES.uploadFailed
          : FORM_MESSAGES.submitFailed;
      setFormError(message);
      setStatus("error");
    } finally {
      submittingRef.current = false;
    }
  }, [values, crmDealId]);

  const reset = useCallback(() => {
    setValues(INITIAL_VALUES);
    setErrors({});
    setFormError(null);
    setStatus("idle");
  }, []);

  return {
    values,
    errors,
    status,
    formError,
    isSubmitting,
    isSuccess: status === "success",
    setResponseText,
    setResponseChoice,
    setFile,
    submit,
    reset,
  };
}
