interface ChoiceCardProps {
  id: string;
  name: string;
  value: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}

/**
 * A radio option rendered as a selectable bordered card.
 * The real <input type="radio"> is visually hidden but remains focusable,
 * so keyboard navigation (arrow keys / space) works natively.
 */
export function ChoiceCard({
  id,
  name,
  value,
  label,
  checked,
  disabled = false,
  invalid = false,
  describedBy,
  onChange,
}: ChoiceCardProps) {
  const className = [
    "choice-card",
    checked ? "choice-card--checked" : "",
    disabled ? "choice-card--disabled" : "",
    invalid && !checked ? "choice-card--invalid" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label htmlFor={id} className={className}>
      <input
        id={id}
        className="choice-card__input"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={() => onChange(value)}
      />
      <span className="choice-card__radio" aria-hidden="true" />
      <span className="choice-card__label">{label}</span>
    </label>
  );
}
