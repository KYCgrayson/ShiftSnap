-- Update Gemini model to stable version
UPDATE app_config SET value = 'gemini-2.0-flash', updated_at = now() WHERE key = 'gemini_model';
