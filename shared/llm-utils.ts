// Utility for cleaning LLM responses (Gemini often wraps JSON in markdown code blocks)

export function extractJson(text: string): string {
  // Strip ```json ... ``` or ``` ... ``` wrappers
  const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (match) return match[1].trim();
  // Try to find raw JSON object/array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) return jsonMatch[1].trim();
  return text.trim();
}

export function safeParseJson<T>(text: string, fallback: T): T {
  const extracted = extractJson(text);
  // Attempt 1: direct parse
  try { return JSON.parse(extracted) as T; } catch { /* continue */ }
  // Attempt 2: fix truncated JSON by closing open braces/brackets
  try {
    let fixed = extracted;
    const opens = (fixed.match(/\{/g) ?? []).length;
    const closes = (fixed.match(/\}/g) ?? []).length;
    if (opens > closes) {
      // Trim trailing incomplete value (e.g. truncated string)
      fixed = fixed.replace(/,?\s*"[^"]*"?\s*:?\s*"?[^"{}]*$/, "");
      for (let i = 0; i < opens - closes; i++) fixed += "}";
    }
    return JSON.parse(fixed) as T;
  } catch { /* continue */ }
  console.warn("[safeParseJson] All parse attempts failed. Raw:", text.slice(0, 300));
  return fallback;
}
