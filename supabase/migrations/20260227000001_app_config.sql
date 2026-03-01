-- Dynamic app configuration (key-value store)
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Default: Gemini 3 Flash
INSERT INTO app_config (key, value) VALUES
  ('gemini_model', 'gemini-3-flash-preview'),
  ('gemini_max_tokens', '8192');

-- Allow edge functions (service role) to read config
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read config" ON app_config FOR SELECT USING (true);
