// src/lib/promptTemplate.ts
// Utilities for extracting and substituting {{placeholder}} tokens in prompt bodies.
// Kept as pure functions with no React or store dependencies so they can be reused
// from any screen and are trivial to unit-test.

/**
 * Matches {{snake_case_identifier}} with optional whitespace inside the braces.
 * Examples that match: {{topic}}, {{ cold_email }}, {{hours_per_week}}
 * Examples that do not match: { topic }, {{topic, {topic}}, {{123abc}} (must start with a letter or underscore)
 */
const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Extract the ordered, deduplicated list of placeholder variable names from a prompt body.
 * First occurrence wins for ordering — so the fill modal renders fields in the order the
 * user sees them in the prompt, which matches reading order.
 */
export function extractPlaceholders(body: string): string[] {
  if (!body) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  // Reset lastIndex because regex with /g flag is stateful across calls on the same instance.
  PLACEHOLDER_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_PATTERN.exec(body)) !== null) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }
  return ordered;
}

/**
 * Substitute {{placeholder}} tokens in a prompt body with the values from `values`.
 * Unknown placeholders (keys not present in `values`, or whose value is undefined) are
 * left in place so the user can see what was missing and fill it manually if they wish.
 */
export function substitutePlaceholders(body: string, values: Record<string, string>): string {
  if (!body) return body;
  return body.replace(PLACEHOLDER_PATTERN, (full, name: string) => {
    const v = values[name];
    if (v === undefined || v === null) return full;
    return String(v);
  });
}

/**
 * Convenience: returns true iff the body contains at least one placeholder.
 * Used by the library screen to decide whether to open the fill modal or jump
 * straight to the composer.
 */
export function hasPlaceholders(body: string): boolean {
  if (!body) return false;
  PLACEHOLDER_PATTERN.lastIndex = 0;
  return PLACEHOLDER_PATTERN.test(body);
}

/**
 * Produce a human-friendly label from a placeholder variable name.
 * Used to generate the field label in the fill modal without requiring
 * the prompt author to supply a separate label for each variable.
 *
 *   positioning_sentence -> "Positioning sentence"
 *   hours_per_week       -> "Hours per week"
 *   topic                -> "Topic"
 */
export function humanizePlaceholder(name: string): string {
  if (!name) return '';
  const words = name.replace(/_+/g, ' ').trim().split(/\s+/);
  if (words.length === 0) return '';
  const first = words[0];
  const rest = words.slice(1).map((w) => w.toLowerCase());
  const firstCap = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return [firstCap, ...rest].join(' ');
}