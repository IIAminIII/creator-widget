import { Check } from "lucide-react";

interface SuccessStateProps {
  onClose?: () => void;
}

export function SuccessState({ onClose }: SuccessStateProps) {
  return (
    <div className="state-screen" role="status" aria-live="polite">
      <div className="state-screen__icon state-screen__icon--success" aria-hidden="true">
        <Check size={26} strokeWidth={2.5} />
      </div>
      <h2 className="state-screen__title">Response submitted</h2>
      <p className="state-screen__message">Thank you. Your response has been submitted successfully.</p>
      {onClose && (
        <button type="button" className="secondary-button" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  );
}
