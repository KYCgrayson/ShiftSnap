-- ops #51: switch first-pass roster OCR to gemini-3.6-flash (GA).
-- Bench 2026-11-08: 3.6-flash + thinkingLevel low = 0 cell errors, ~7-8 s per scan.
-- gemini_max_tokens stays as-is.
UPDATE public.app_config
SET value = 'gemini-3.6-flash', updated_at = now()
WHERE key = 'gemini_model';
