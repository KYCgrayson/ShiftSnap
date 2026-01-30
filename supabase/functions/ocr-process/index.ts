// ShiftSnap OCR Processing Edge Function
// Uses Google Gemini Flash for schedule recognition

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OCRRequest {
  imageUrl: string;
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
  detected_month: string | null;
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Parse request body
    const { imageUrl, existingCodes = [] }: OCRRequest = await req.json();

    if (!imageUrl) {
      throw new Error("Missing imageUrl");
    }

    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // Fetch image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error("Failed to fetch image");
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";

    // Build the prompt
    const existingCodesInfo = existingCodes.length > 0
      ? `The user has previously defined these shift codes:\n${existingCodes.map(c =>
          `- "${c.code}" = ${c.meaning}${c.startTime ? ` (starts at ${c.startTime})` : ''}${c.isDayOff ? ' [Day Off]' : ''}`
        ).join('\n')}\n\n`
      : '';

    const prompt = `You are an expert at reading work shift schedules. Analyze this image of a work schedule and extract the shift information.

${existingCodesInfo}
Please analyze the schedule image and respond with a JSON object in this exact format:
{
  "detected_month": "January" or "February" etc (or null if not visible),
  "detected_year": 2026 (or null if not visible),
  "rows": [
    {
      "name": "Employee name or null if this is the user's own row",
      "shifts": [
        {"date": 1, "code": "A", "confidence": 0.95},
        {"date": 2, "code": "/", "confidence": 0.90}
      ]
    }
  ],
  "unknown_codes": ["X", "Y"] // List any codes you found that are NOT in the user's existing codes
}

Important guidelines:
1. Extract ALL shift codes for ALL days in the schedule
2. Common shift codes include letters (A, B, C, D), symbols (/, X, O), or time patterns (9-5, 10:30)
3. "/" or "O" or "X" typically means day off
4. Include confidence scores (0-1) for each extracted code
5. If you see a row that appears to be the main/highlighted row, put it first and set name to null
6. List any codes that are NOT in the user's existing codes in the unknown_codes array
7. Respond ONLY with the JSON object, no other text`;

    // Call Gemini API
    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();

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
      detected_month: parsedResult.detected_month,
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

    const errorResult: OCRResult = {
      success: false,
      confidence: 0,
      detected_month: null,
      detected_year: null,
      rows: [],
      unknown_codes: [],
      raw_response: error.message,
    };

    return new Response(JSON.stringify(errorResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
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
