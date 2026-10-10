import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGenerationConfig } from './generationConfig.ts';

test('default OCR generation config preserves the first-pass settings', () => {
  assert.deepEqual(buildGenerationConfig(16384), {
    temperature: 0.1,
    topK: 32,
    topP: 1,
    maxOutputTokens: 16384,
    responseMimeType: 'application/json',
  });
});

test('accurate OCR generation config adds high-resolution thinking only', () => {
  const config = buildGenerationConfig(16384, 'accurate');

  assert.equal(config.temperature, 0.1);
  assert.equal(config.topK, 32);
  assert.equal(config.topP, 1);
  assert.equal(config.maxOutputTokens, 16384);
  assert.equal(config.responseMimeType, 'application/json');
  assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'high' });
  assert.equal(config.mediaResolution, 'MEDIA_RESOLUTION_HIGH');
});
