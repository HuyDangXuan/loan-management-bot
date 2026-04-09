const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

export function getGeminiModel() {
  const configuredModel = process.env.GEMINI_MODEL?.trim();
  return configuredModel || DEFAULT_GEMINI_MODEL;
}
