/**
 * Canonical CSV Sanitization & Generation Module for Sahyak CRM
 * Implements OWASP CSV Injection Defense (SEC-03).
 * Neutralizes DDE / spreadsheet formula injection triggers across all export paths:
 * leads, analytics, and Google Search Console data.
 */

/**
 * Sanitizes an individual CSV cell value against spreadsheet formula execution.
 * Detects trigger characters (=, +, -, @, \t, \r, \n, |, %, and Unicode fullwidth equivalents).
 * Handles whitespace-prefixed formulas (e.g. "   =calc") by checking trimmed content.
 * Distinguishes legitimate numbers from untrusted text strings.
 */
export function sanitizeCsvCell(val: any): string {
  if (val === null || val === undefined) return '""';

  // Legitimate finite numbers do not execute formulas and must retain numeric formatting
  if (typeof val === 'number') {
    if (Number.isFinite(val)) return `"${val}"`;
    return '""';
  }

  const str = String(val);
  if (str.length === 0) return '""';

  // Check for formula triggers: =, +, -, @, tab, CR, LF, |, % or fullwidth equivalents (=, +, -, @)
  // Check both raw start and start after trimming leading whitespace/control chars
  const trimmed = str.replace(/^[\s\u0000-\u0020\u00A0\u2000-\u200B]+/, '');
  const triggerPattern = /^[=+\-@\t\r\n|%\uFF1D\uFF0B\uFF0D\uFF20]/;

  let needsPrefix = triggerPattern.test(str) || (trimmed.length > 0 && triggerPattern.test(trimmed));

  // Exception for pure negative/positive numbers passed as strings (e.g. "-42", "-12.5")
  if (needsPrefix && /^[+\-]\d+(\.\d+)?$/.test(trimmed)) {
    // If it's a pure number string, we don't need a single quote UNLESS it started with tabs/CR/LF
    if (!/^[\t\r\n]/.test(str)) {
      needsPrefix = false;
    }
  }

  let cleaned = str.replace(/"/g, '""');
  if (needsPrefix) {
    cleaned = "'" + cleaned;
  }

  return `"${cleaned}"`;
}
