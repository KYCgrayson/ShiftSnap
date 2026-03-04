-- Use Gemini 3 Flash
UPDATE app_config SET value = 'gemini-3-flash-preview', updated_at = now() WHERE key = 'gemini_model';
