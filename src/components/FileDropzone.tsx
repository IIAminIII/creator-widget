import { useId, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { FileText, Image as ImageIcon, UploadCloud, X } from "lucide-react";
import { ACCEPT_ATTRIBUTE, ALLOWED_TYPES_LABEL, MAX_FILE_SIZE_LABEL, getFileExtension } from "../utils/fileValidation";
import { formatFileSize } from "../utils/formatFileSize";

interface FileDropzoneProps {
  id: string;
  file: File | null;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onFileSelected: (file: File | null) => void;
}

function FileIcon({ fileName }: { fileName: string }) {
  const ext = getFileExtension(fileName);
  const isImage = ext === ".jpg" || ext === ".jpeg" || ext === ".png";
  return isImage ? <ImageIcon size={20} strokeWidth={1.75} /> : <FileText size={20} strokeWidth={1.75} />;
}

export function FileDropzone({
  id,
  file,
  disabled = false,
  invalid = false,
  describedBy,
  onFileSelected,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const hintId = useId();

  const openBrowser = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    // Reset so selecting the same file again still fires onChange.
    e.target.value = "";
    if (selected) onFileSelected(selected);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current += 1;
    setIsDragging(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setIsDragging(false);
    if (disabled) return;
    const dropped = e.dataTransfer.files?.[0] ?? null;
    if (dropped) onFileSelected(dropped);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openBrowser();
    }
  };

  const handleRemove = () => {
    if (disabled) return;
    onFileSelected(null);
  };

  const describedByIds = [describedBy, hintId].filter(Boolean).join(" ") || undefined;

  const zoneClass = [
    "dropzone",
    isDragging ? "dropzone--dragging" : "",
    disabled ? "dropzone--disabled" : "",
    invalid ? "dropzone--invalid" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="dropzone-wrapper">
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="visually-hidden"
        accept={ACCEPT_ATTRIBUTE}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleInputChange}
      />

      {file ? (
        <div
          className={["file-chip", disabled ? "file-chip--disabled" : "", invalid ? "file-chip--invalid" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-describedby={describedByIds}
        >
          <div className="file-chip__icon" aria-hidden="true">
            <FileIcon fileName={file.name} />
          </div>
          <div className="file-chip__meta">
            <div className="file-chip__name" title={file.name}>
              {file.name}
            </div>
            <div className="file-chip__size">{formatFileSize(file.size)}</div>
          </div>
          <div className="file-chip__actions">
            <button
              type="button"
              className="file-chip__replace"
              onClick={openBrowser}
              disabled={disabled}
            >
              Replace
            </button>
            <button
              type="button"
              className="file-chip__remove"
              onClick={handleRemove}
              disabled={disabled}
              aria-label={`Remove ${file.name}`}
            >
              <X size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          className={zoneClass}
          aria-disabled={disabled || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedByIds}
          aria-label="Upload supporting document. Choose a file or drag it here."
          onClick={openBrowser}
          onKeyDown={handleKeyDown}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="dropzone__icon" aria-hidden="true">
            <UploadCloud size={26} strokeWidth={1.75} />
          </div>
          <p className="dropzone__title">
            <span className="dropzone__link">Choose a file</span> or drag it here
          </p>
          <p className="dropzone__hint" id={hintId}>
            {ALLOWED_TYPES_LABEL} · up to {MAX_FILE_SIZE_LABEL}
          </p>
        </div>
      )}
    </div>
  );
}
