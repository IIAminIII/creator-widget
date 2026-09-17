import { useId, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import { useDealResponseForm } from "../hooks/useDealResponseForm";
import { RESPONSE_CHOICES, type ResponseChoice } from "../types/form";
import { ChoiceCard } from "./ChoiceCard";
import { FileDropzone } from "./FileDropzone";
import { FormHeader } from "./FormHeader";
import { SubmitButton } from "./SubmitButton";
import { SuccessState } from "./SuccessState";

interface DealResponseFormProps {
  crmDealId: string;
  onClose?: () => void;
}

export function DealResponseForm({ crmDealId, onClose }: DealResponseFormProps) {
  const form = useDealResponseForm({ crmDealId });
  const baseId = useId();

  const ids = {
    responseText: `${baseId}-response`,
    responseTextError: `${baseId}-response-error`,
    choiceGroup: `${baseId}-choice`,
    choiceError: `${baseId}-choice-error`,
    file: `${baseId}-file`,
    fileError: `${baseId}-file-error`,
    formError: `${baseId}-form-error`,
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void form.submit();
  };

  if (form.isSuccess) {
    return (
      <div className="card">
        <SuccessState onClose={onClose} />
      </div>
    );
  }

  const disabled = form.isSubmitting;

  return (
    <div className="card">
      <FormHeader title="Deal Response" subtitle="Please provide your response and supporting document below." />
      <hr className="card__divider" />

      <form className="form" onSubmit={handleSubmit} noValidate>
        {form.formError && (
          <div className="form-alert" role="alert" id={ids.formError}>
            <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
            <span>{form.formError}</span>
          </div>
        )}

        {/* Field 1: Response text */}
        <div className="field">
          <label className="field__label" htmlFor={ids.responseText}>
            Response <span className="field__required" aria-hidden="true">*</span>
          </label>
          <textarea
            id={ids.responseText}
            className={["textarea", form.errors.responseText ? "textarea--invalid" : ""].filter(Boolean).join(" ")}
            placeholder="Enter your response..."
            value={form.values.responseText}
            onChange={(e) => form.setResponseText(e.target.value)}
            disabled={disabled}
            required
            aria-required="true"
            aria-invalid={form.errors.responseText ? true : undefined}
            aria-describedby={form.errors.responseText ? ids.responseTextError : undefined}
            rows={4}
          />
          {form.errors.responseText && (
            <p className="field__error" id={ids.responseTextError}>
              {form.errors.responseText}
            </p>
          )}
        </div>

        {/* Field 2: Response choice */}
        <fieldset
          className="field"
          disabled={disabled}
          aria-describedby={form.errors.responseChoice ? ids.choiceError : undefined}
        >
          <legend className="field__label">
            Response Choice <span className="field__required" aria-hidden="true">*</span>
          </legend>
          <div className="choice-grid" role="radiogroup" aria-label="Response Choice">
            {RESPONSE_CHOICES.map((choice) => (
              <ChoiceCard
                key={choice}
                id={`${ids.choiceGroup}-${choice.replace(/\s+/g, "-").toLowerCase()}`}
                name={ids.choiceGroup}
                value={choice}
                label={choice}
                checked={form.values.responseChoice === choice}
                disabled={disabled}
                invalid={Boolean(form.errors.responseChoice)}
                describedBy={form.errors.responseChoice ? ids.choiceError : undefined}
                onChange={(value) => form.setResponseChoice(value as ResponseChoice)}
              />
            ))}
          </div>
          {form.errors.responseChoice && (
            <p className="field__error" id={ids.choiceError}>
              {form.errors.responseChoice}
            </p>
          )}
        </fieldset>

        {/* Field 3: File upload */}
        <div className="field">
          <label className="field__label" htmlFor={ids.file}>
            Upload supporting document <span className="field__required" aria-hidden="true">*</span>
          </label>
          <FileDropzone
            id={ids.file}
            file={form.values.file}
            disabled={disabled}
            invalid={Boolean(form.errors.file)}
            describedBy={form.errors.file ? ids.fileError : undefined}
            onFileSelected={form.setFile}
          />
          {form.errors.file && (
            <p className="field__error" id={ids.fileError}>
              {form.errors.file}
            </p>
          )}
        </div>

        <SubmitButton isSubmitting={form.isSubmitting} />
      </form>
    </div>
  );
}
