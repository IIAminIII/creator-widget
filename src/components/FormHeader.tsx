import { MessageSquareText } from "lucide-react";

interface FormHeaderProps {
  title: string;
  subtitle: string;
}

export function FormHeader({ title, subtitle }: FormHeaderProps) {
  return (
    <header className="form-header">
      <div className="form-header__icon" aria-hidden="true">
        <MessageSquareText size={18} strokeWidth={2} />
      </div>
      <div className="form-header__text">
        <h1 className="form-header__title">{title}</h1>
        <p className="form-header__subtitle">{subtitle}</p>
      </div>
    </header>
  );
}
