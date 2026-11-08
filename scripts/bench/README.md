# OCR scan-speed bench (ops #51)

Local benchmark for `supabase/functions/ocr-process`. It calls the Gemini API
directly with the same prompt, image handling (original bytes, mime from file
extension), generationConfig and JSON parsing as the Edge Function first pass,
and only varies the model and `thinkingConfig.thinkingLevel`.

Nothing here touches Supabase or production.

## Setup (owner only)

```bash
security add-generic-password -s gemini-shiftsnap -a bench -w
```

The script reads the key from the keychain at runtime, sends it in the
`x-goog-api-key` header and never prints or saves it.

## Private data — never commit

`input/` (roster photos), `truth/` (answer keys) and `output/` (raw model
output) contain coworkers' names and are gitignored.

Truth file = the same compact JSON shape the model returns:
`{"detected_month":11,"detected_year":2026,"rows":[{"name":"…","shifts":{"1":"A"}}]}`.

## Run

```bash
cd scripts/bench
python3 ocr_bench.py --list-models
python3 ocr_bench.py --images input/x.jpg --truth truth/x.json --runs 3
python3 ocr_bench.py --images input/x.jpg --truth truth/x.json --runs 2 \
  --models gemini-3.6-flash --thinking low minimal
python3 ocr_bench.py --images input/x.jpg --truth truth/x.json --max-tokens 8192  # production app_config value
python3 ocr_bench.py --score output/<stamp> --truth truth/x.json   # re-score only
```

`--thinking default` = no thinkingConfig (current production behaviour).
Cell errors = missing + extra + wrong cells vs truth; rows with no shifts are
ignored. Costs use `prices.json` (paid tier, USD per 1M tokens).
