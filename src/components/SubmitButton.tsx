import { Loader2 } from "lucide-react";

interface SubmitButtonProps {
  isSubmitting: boolean;
  disabled?: boolean;
  label?: string;
  submittingLabel?: string;
}

export function SubmitButton({
  isSubmitting,
  disabled = false,
  label = "Submit",
  submittingLabel = "Submitting...",
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className="submit-button"
      disabled={disabled || isSubmitting}
      aria-busy={isSubmitting || undefined}
    >
      {isSubmitting ? (
        <>
          <Loader2 className="submit-button__spinner" size={18} strokeWidth={2.25} aria-hidden="true" />
          <span>{submittingLabel}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}
