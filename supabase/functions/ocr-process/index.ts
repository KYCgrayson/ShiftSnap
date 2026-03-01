// ShiftSnap OCR Processing Edge Function
// Uses Google Gemini for schedule recognition with dynamic model config

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_MAX_TOKENS = 8192;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OCRRequest {
  imageUrl?: string;
  imageBase64?: string;
  imageMimeType?: string;
  userId?: string;
  existingCodes?: Array<{
    code: string;
    meaning: string;
    startTime: string | null;
    isDayOff: boolean;
  }>;
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { imageUrl, imageBase64, imageMimeType, existingCodes = [] }: OCRRequest = await req.json();

    if (!imageUrl && !imageBase64) {
      throw new Error("Missing imageUrl or imageBase64");
    }

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // Read model config from DB
    const { modelId, maxTokens } = await getModelConfig();
    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;

    // Get image as base64 — either from request body or by fetching the URL
    let base64Image: string;
    let mimeType: string;

    if (imageBase64) {
      base64Image = imageBase64;
      mimeType = imageMimeType || "image/jpeg";
    } else {
      const imageResponse = await fetch(imageUrl!);
      if (!imageResponse.ok) {
        throw new Error("Failed to fetch image");
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
      mimeType = imageResponse.headers.get("content-type") || "image/jpeg";
    }

    // Build the prompt
    const existingCodesInfo = existingCodes.length > 0
      ? `\nThe user has previously defined these shift codes:\n${existingCodes.map(c =>
          `- "${c.code}" = ${c.meaning}${c.startTime ? ` (starts at ${c.startTime})` : ''}${c.isDayOff ? ' [Day Off]' : ''}`
        ).join('\n')}\n`
      : '';

    const prompt = `You are an expert at reading printed work shift schedule tables, especially those used in Taiwanese workplaces.

**Table format**:
- TOP ROW = dates (day numbers 1–31)
- LEFT COLUMN = employee names (Chinese or English)
- Each CELL = a shift code for that person on that date

**Your task**: Extract the EXACT content of every cell.
${existingCodesInfo}
Rules:
1. Read EVERY row (person) and EVERY column (date)
2. Preserve codes EXACTLY as printed — including Chinese characters (小年, 除夕, 初一, 初二, etc.), letters (A, B, C), symbols (/, X, O), or time strings
3. Skip empty cells
4. If a title/header contains month/year, extract it
5. Confidence: 1.0 for clearly legible text, lower for ambiguous/blurry
6. List any codes NOT in the user's existing codes in unknown_codes

Respond ONLY with JSON (no markdown, no explanation):
{
  "detected_month": 2,
  "detected_year": 2025,
  "rows": [
    {
      "name": "Employee Name",
      "shifts": [
        {"date": 1, "code": "A", "confidence": 0.95}
      ]
    }
  ],
  "unknown_codes": ["小年", "除夕"]
}`;

    // Call Gemini API with retry
    const geminiRequestBody = JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
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
      },
    });

    const MAX_RETRIES = 2;
    let geminiData;
    let lastError = "";

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Wait before retry: 1s, then 2s
        await new Promise((r) => setTimeout(r, attempt * 1000));
        console.log(`Retry attempt ${attempt}/${MAX_RETRIES}...`);
      }

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
    }

    if (!geminiData) {
      throw new Error(lastError || "Gemini API returned no data");
    }

    // Extract the text response
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error("No response from Gemini");
    }

    // Parse the JSON from the response
    let parsedResult;
    try {
      // Try to extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) ||
                        responseText.match(/```\n?([\s\S]*?)\n?```/) ||
                        [null, responseText];
      parsedResult = JSON.parse(jsonMatch[1] || responseText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", responseText);
      throw new Error("Failed to parse schedule data");
    }

    // Build the result
    const result: OCRResult = {
      success: true,
      confidence: calculateOverallConfidence(parsedResult.rows),
      detected_month: typeof parsedResult.detected_month === 'number' ? parsedResult.detected_month : null,
      detected_year: parsedResult.detected_year,
      rows: parsedResult.rows || [],
      unknown_codes: parsedResult.unknown_codes || [],
      raw_response: responseText,
    };

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

    // Return 200 with success:false so the client can read the actual error details
    return new Response(JSON.stringify(errorResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});

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
