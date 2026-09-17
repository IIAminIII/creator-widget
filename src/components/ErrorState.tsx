import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  title: string;
  message: string;
}

/** Full-card error screen (e.g. when the Deal reference is missing from the URL). */
export function ErrorState({ title, message }: ErrorStateProps) {
  return (
    <div className="state-screen" role="alert">
      <div className="state-screen__icon state-screen__icon--error" aria-hidden="true">
        <AlertCircle size={26} strokeWidth={2.25} />
      </div>
      <h2 className="state-screen__title">{title}</h2>
      <p className="state-screen__message">{message}</p>
    </div>
  );
}
