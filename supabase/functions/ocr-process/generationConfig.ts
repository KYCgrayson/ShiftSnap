export type RecognitionMode = 'accurate' | undefined;

/**
 * First-pass OCR uses thinkingLevel 'low': ops #51 bench (2026-11-08) showed
 * gemini-3.6-flash + low reads the roster with 0 cell errors in ~7-8 s, while
 * the model default (dynamic/high thinking) took 14-49 s and sometimes used up
 * maxOutputTokens, truncating the JSON. The accurate mode is intentionally
 * opt-in for a user-led re-analysis only.
 */
export function buildGenerationConfig(maxOutputTokens: number, recognitionMode?: RecognitionMode) {
  const defaultConfig = {
    temperature: 0.1,
    topK: 32,
    topP: 1,
    maxOutputTokens,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingLevel: 'low' },
  };

  if (recognitionMode !== 'accurate') return defaultConfig;

  return {
    ...defaultConfig,
    thinkingConfig: { thinkingLevel: 'high' },
    mediaResolution: 'MEDIA_RESOLUTION_HIGH',
  };
}
