export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILE_SIZE_LABEL = "10 MB";

export const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png"] as const;

/** Value for the hidden file input's accept attribute. */
export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.join(",");

/** Human readable list shown in the dropzone. */
export const ALLOWED_TYPES_LABEL = "PDF, DOC, DOCX, JPG, PNG";

export const FILE_ERROR_MESSAGES = {
  missing: "Please select a file.",
  tooLarge: `File size cannot exceed ${MAX_FILE_SIZE_LABEL}.`,
  unsupported: "This file type is not supported.",
} as const;

export function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1) return "";
  return fileName.slice(idx).toLowerCase();
}

export function isAllowedExtension(fileName: string): boolean {
  const ext = getFileExtension(fileName);
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

/** Returns an error message, or null when the file is acceptable. */
export function validateFile(file: File | null | undefined): string | null {
  if (!file) return FILE_ERROR_MESSAGES.missing;
  if (!isAllowedExtension(file.name)) return FILE_ERROR_MESSAGES.unsupported;
  if (file.size > MAX_FILE_SIZE_BYTES) return FILE_ERROR_MESSAGES.tooLarge;
  return null;
}
