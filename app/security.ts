const SECRET_PATTERNS = [
  /(authorization\s*:\s*bearer\s+)[^\s,;]+/gi,
  /(api[_-]?key\s*[=:]\s*)[^\s,;]+/gi,
  /(password\s*[=:]\s*)[^\s,;]+/gi,
  /(mysql:\/\/[^:\s/]+:)[^@\s]+(@)/gi,
] as const;

export const DEFAULT_MAX_WORKBOOK_BYTES = 50 * 1024 * 1024;

export function redactSensitiveText(value: string): string {
  return SECRET_PATTERNS.reduce(
    (safe, pattern) => safe.replace(pattern, "$1[REDACTED]$2"),
    value,
  );
}

export function safeOperationalError(
  error: unknown,
  fallback = "The operation could not be completed safely.",
): string {
  if (!(error instanceof Error)) return fallback;
  const message = redactSensitiveText(error.message).trim();
  return message && message.length <= 240 ? message : fallback;
}

export function sanitizeSpreadsheetText(value: string): string {
  return /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
}

export function isSupportedWorkbookName(fileName: string): boolean {
  return /\.(xlsx|xls)$/i.test(fileName.trim());
}
