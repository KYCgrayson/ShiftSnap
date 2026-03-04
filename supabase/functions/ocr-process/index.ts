// ShiftSnap OCR Processing Edge Function
// Uses Google Gemini for schedule recognition with dynamic model config

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_MAX_TOKENS = 16384;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OCRRequest {
  imageBase64: string;
  imageMimeType?: string;
  existingCodes?: Array<{
    code: string;
    meaning: string;
    startTime: string | null;
    isDayOff: boolean;
  }>;
  hint?: string;
}

interface OCRResult {
  success: boolean;
  confidence: number;
  detected_month: number | null;
  detected_year: number | null;
  rows: Array<{
    name: string | null;
    shifts: Array<{
      date: number;
      code: string;
      confidence: number;
    }>;
  }>;
  unknown_codes: string[];
  raw_response?: string;
}

async function getModelConfig(): Promise<{ modelId: string; maxTokens: number }> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: rows } = await supabase
      .from("app_config")
      .select("key, value")
      .in("key", ["gemini_model", "gemini_max_tokens"]);

    const config: Record<string, string> = {};
    if (rows) {
      for (const row of rows) {
        config[row.key] = row.value;
      }
    }

    return {
      modelId: config["gemini_model"] || DEFAULT_MODEL,
      maxTokens: parseInt(config["gemini_max_tokens"] || String(DEFAULT_MAX_TOKENS), 10),
    };
  } catch (err) {
    console.error("Failed to read model config, using defaults:", err);
    return { modelId: DEFAULT_MODEL, maxTokens: DEFAULT_MAX_TOKENS };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: OCRRequest = await req.json();
    const { imageBase64, imageMimeType = "image/jpeg", existingCodes = [], hint } = body;

    if (!imageBase64) {
      throw new Error("Missing imageBase64");
    }

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    console.log(`Processing image: ${(imageBase64.length * 0.75 / 1024).toFixed(0)}KB, mime: ${imageMimeType}`);

    // Read model config from DB
    const { modelId, maxTokens } = await getModelConfig();
    console.log(`Using model: ${modelId}, maxTokens: ${maxTokens}`);

    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

    // Build the prompt
    const existingCodesInfo = existingCodes.length > 0
      ? `\nThe user has previously defined these shift codes:\n${existingCodes.map(c =>
          `- "${c.code}" = ${c.meaning}${c.startTime ? ` (starts at ${c.startTime})` : ''}${c.isDayOff ? ' [Day Off]' : ''}`
        ).join('\n')}\n`
      : '';

    const hintInfo = hint ? `\n**Additional instruction**: ${hint}\n` : '';

    const prompt = `You are an expert at reading printed work shift schedule tables, especially those used in Taiwanese workplaces.

**Table format**:
- TOP ROW = dates (day numbers 1–31)
- LEFT COLUMN = employee names (Chinese or English)
- Each CELL = a shift code for that person on that date

**Your task**: Extract the EXACT content of every cell.
${existingCodesInfo}${hintInfo}
Rules:
1. Read EVERY row (person) and EVERY column (date)
2. Preserve codes EXACTLY as printed — including Chinese characters (小年, 除夕, 初一, 初二, etc.), letters (A, B, C), symbols (/, X, O), or time strings
3. Skip empty cells (do NOT include them)
4. If a title/header contains month/year, extract it
5. List any codes NOT in the user's existing codes in unknown_codes

**IMPORTANT**: Use this COMPACT format — map date number directly to shift code string. Do NOT use arrays of objects for shifts.
Respond ONLY with JSON (no markdown, no explanation):
{
  "detected_month": 2,
  "detected_year": 2025,
  "rows": [
    {"name": "Employee Name", "shifts": {"1": "A", "5": "B", "10": "/"}}
  ],
  "unknown_codes": ["小年", "除夕"]
}`;

    const geminiRequestBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: imageMimeType,
                data: imageBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        topK: 32,
        topP: 1,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
      },
    });

    // Call Gemini API with retry
    const MAX_RETRIES = 2;
    let geminiData;
    let lastError = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
        console.log(`Retry attempt ${attempt}/${MAX_RETRIES}...`);
      }

      try {
        const geminiResponse = await fetch(`${geminiApiUrl}?key=${GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: geminiRequestBody,
        });

        if (geminiResponse.ok) {
          geminiData = await geminiResponse.json();
          break;
        }

        const errorText = await geminiResponse.text();
        lastError = `Gemini API ${geminiResponse.status}: ${errorText.slice(0, 500)}`;
        console.error(`Gemini attempt ${attempt + 1} failed:`, lastError);

        // Only retry on transient errors
        const retryable = [429, 500, 502, 503].includes(geminiResponse.status);
        if (!retryable || attempt === MAX_RETRIES) {
          throw new Error(lastError);
        }
      } catch (fetchErr) {
        if (fetchErr instanceof Error && fetchErr.message.startsWith("Gemini API")) {
          throw fetchErr;
        }
        lastError = `Network error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
        console.error(`Gemini attempt ${attempt + 1} network error:`, lastError);
        if (attempt === MAX_RETRIES) throw new Error(lastError);
      }
    }

    if (!geminiData) {
      throw new Error(lastError || "Gemini API returned no data");
    }

    // Extract the text response
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      console.error("Unexpected Gemini response:", JSON.stringify(geminiData).slice(0, 1000));
      throw new Error("No response from Gemini");
    }

    // Parse the JSON from the response — try multiple strategies
    let parsedResult;
    const parseAttempts = [
      // 1. Direct parse
      () => JSON.parse(responseText),
      // 2. Extract from ```json ... ``` blocks
      () => {
        const m = responseText.match(/```json\s*([\s\S]*?)\s*```/);
        if (!m) throw new Error("no json block");
        return JSON.parse(m[1]);
      },
      // 3. Extract from ``` ... ``` blocks
      () => {
        const m = responseText.match(/```\s*([\s\S]*?)\s*```/);
        if (!m) throw new Error("no code block");
        return JSON.parse(m[1]);
      },
      // 4. Find first { ... } in the response
      () => {
        const start = responseText.indexOf('{');
        const end = responseText.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error("no braces");
        return JSON.parse(responseText.slice(start, end + 1));
      },
      // 5. Repair truncated JSON (output exceeded maxOutputTokens)
      () => {
        const repaired = tryRepairTruncatedJson(responseText);
        if (!repaired) throw new Error("repair failed");
        console.warn("Used truncated JSON repair — partial results returned");
        return repaired;
      },
    ];

    for (const attempt of parseAttempts) {
      try {
        parsedResult = attempt();
        break;
      } catch (_) {
        continue;
      }
    }

    if (!parsedResult) {
      console.error("Failed to parse Gemini response:", responseText.slice(0, 2000));
      throw new Error("PARSE_FAILED:" + responseText.slice(0, 500));
    }

    // Normalize rows: convert compact {"1":"A","2":"B"} format to [{date,code,confidence}]
    const normalizedRows = normalizeRows(parsedResult.rows || []);

    const result: OCRResult = {
      success: true,
      confidence: calculateOverallConfidence(normalizedRows),
      detected_month: typeof parsedResult.detected_month === 'number' ? parsedResult.detected_month : null,
      detected_year: parsedResult.detected_year,
      rows: normalizedRows,
      unknown_codes: parsedResult.unknown_codes || [],
      raw_response: responseText,
    };

    console.log(`OCR success: ${result.rows.length} rows, confidence: ${result.confidence.toFixed(2)}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("OCR processing error:", error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult: OCRResult = {
      success: false,
      confidence: 0,
      detected_month: null,
      detected_year: null,
      rows: [],
      unknown_codes: [],
      raw_response: errorMessage,
    };

    return new Response(JSON.stringify(errorResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});

/**
 * Normalize rows from either format to the standard array-of-objects format.
 * Compact format:  { "shifts": {"1": "A", "2": "B"} }
 * Standard format: { "shifts": [{"date": 1, "code": "A", "confidence": 1.0}] }
 */
function normalizeRows(rows: any[]): any[] {
  if (!rows || rows.length === 0) return [];

  return rows.map((row) => {
    // Already in array format
    if (Array.isArray(row.shifts)) return row;

    // Compact object format — convert to array
    if (row.shifts && typeof row.shifts === "object") {
      const shiftsArray = Object.entries(row.shifts).map(([date, code]) => ({
        date: parseInt(date, 10),
        code: String(code),
        confidence: 1.0,
      }));
      // Sort by date for consistency
      shiftsArray.sort((a, b) => a.date - b.date);
      return { ...row, shifts: shiftsArray };
    }

    return row;
  });
}

/**
 * Try to repair truncated JSON (when Gemini output exceeds maxOutputTokens).
 * Strips the last incomplete entry and closes all open brackets/braces.
 */
function tryRepairTruncatedJson(text: string): any | null {
  try {
    // Already valid
    return JSON.parse(text);
  } catch (_) {
    // Continue with repair
  }

  // Remove trailing incomplete value after last comma
  let repaired = text.replace(/,\s*(?:"[^"]*"\s*:\s*)?(?:"[^"]*)?$/, "");
  repaired = repaired.replace(/,\s*\{[^}]*$/, "");
  repaired = repaired.replace(/,\s*$/, "");

  // Count unclosed brackets/braces and close them
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (const char of repaired) {
    if (escaped) { escaped = false; continue; }
    if (char === "\\") { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === "{") braces++;
    if (char === "}") braces--;
    if (char === "[") brackets++;
    if (char === "]") brackets--;
  }

  while (brackets > 0) { repaired += "]"; brackets--; }
  while (braces > 0) { repaired += "}"; braces--; }

  try {
    const parsed = JSON.parse(repaired);
    // Sanity check: must have rows array
    if (parsed.rows && Array.isArray(parsed.rows) && parsed.rows.length > 0) {
      return parsed;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function calculateOverallConfidence(rows: any[]): number {
  if (!rows || rows.length === 0) return 0;

  let totalConfidence = 0;
  let count = 0;

  for (const row of rows) {
    if (row.shifts) {
      for (const shift of row.shifts) {
        totalConfidence += shift.confidence || 0;
        count++;
      }
    }
  }

  return count > 0 ? totalConfidence / count : 0;
}
