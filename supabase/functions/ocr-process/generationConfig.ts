export type RecognitionMode = 'accurate' | undefined;

/**
 * Keeps the first-pass OCR request byte-for-byte equivalent in meaning to the
 * existing config. The accurate mode is intentionally opt-in for a user-led
 * re-analysis only.
 */
export function buildGenerationConfig(maxOutputTokens: number, recognitionMode?: RecognitionMode) {
  const defaultConfig = {
    temperature: 0.1,
    topK: 32,
    topP: 1,
    maxOutputTokens,
    responseMimeType: 'application/json',
  };

  if (recognitionMode !== 'accurate') return defaultConfig;

  return {
    ...defaultConfig,
    thinkingConfig: { thinkingLevel: 'high' },
    mediaResolution: 'MEDIA_RESOLUTION_HIGH',
  };
}
