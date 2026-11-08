#!/usr/bin/env python3
"""ops #51 — iShift scan speed bench.

Calls the Gemini API directly from this Mac with the SAME prompt, image
handling and generationConfig as supabase/functions/ocr-process (first pass:
no existingCodes, no hint), varying only model and thinkingLevel.

Safety:
- The API key is read from the macOS keychain at runtime
  (`security find-generic-password -s gemini-shiftsnap -w`). It is sent in the
  `x-goog-api-key` header, never printed, never written to disk.
- Photos (input/) and raw model output (output/) contain coworkers' names and
  are gitignored. Only anonymised aggregate numbers go into reports.

Usage:
  python3 scripts/bench/ocr_bench.py --list-models
  python3 scripts/bench/ocr_bench.py --images input/a.jpg --runs 3
  python3 scripts/bench/ocr_bench.py --images input/a.jpg --truth truth/a.json
  python3 scripts/bench/ocr_bench.py --score output/<run>/   # re-score saved runs
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import re
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
API = "https://generativelanguage.googleapis.com/v1beta"
MAX_TOKENS = 16384  # ocr-process DEFAULT_MAX_TOKENS; production app_config.gemini_max_tokens is seeded as 8192 (use --max-tokens 8192)
TIMEOUT_S = 300  # bench-only safety net; ocr-process has no timeout

DEFAULT_MODELS = ["gemini-3-flash-preview", "gemini-3.6-flash", "gemini-3.8-flash",
                  "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]
DEFAULT_THINKING = ["default", "low", "minimal"]

# ---- Prompt: copied verbatim from ocr-process/index.ts (existingCodes=[], hint=undefined)
PROMPT = """You are an expert at reading printed work shift schedule tables, especially those used in Taiwanese workplaces.

**Table format**:
- TOP ROW = dates (day numbers 1–31)
- LEFT COLUMN = employee names (Chinese or English)
- Each CELL = a shift code for that person on that date

**Your task**: Extract the EXACT content of every cell.

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
}"""


def generation_config(thinking: str, max_tokens: int = MAX_TOKENS) -> dict:
    """ocr-process buildGenerationConfig(maxTokens) default branch, plus an
    optional thinkingConfig for the variant under test."""
    cfg = {
        "temperature": 0.1,
        "topK": 32,
        "topP": 1,
        "maxOutputTokens": max_tokens,
        "responseMimeType": "application/json",
    }
    if thinking != "default":
        cfg["thinkingConfig"] = {"thinkingLevel": thinking}
    return cfg


def api_key() -> str:
    try:
        out = subprocess.run(
            ["security", "find-generic-password", "-s", "gemini-shiftsnap", "-w"],
            capture_output=True, text=True, check=True,
        )
    except subprocess.CalledProcessError:
        sys.exit("Keychain item 'gemini-shiftsnap' not found. Ask the owner to run:\n"
                 "  security add-generic-password -s gemini-shiftsnap -a bench -w")
    key = out.stdout.strip()
    if not key:
        sys.exit("Keychain item 'gemini-shiftsnap' is empty.")
    return key


def mime_for(path: Path) -> str:
    # scan.tsx getImageMimeType: '.png' anywhere in uri → png, else jpeg
    return "image/png" if ".png" in str(path).lower() else "image/jpeg"


def post(url: str, key: str, body: bytes) -> tuple[int, dict | str]:
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "x-goog-api-key": key})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:500]
    except Exception as e:  # timeout / network
        return 0, f"{type(e).__name__}: {e}"


# ---- Parsing: same strategy order as ocr-process
def repair_truncated(text: str):
    try:
        return json.loads(text)
    except Exception:
        pass
    r = re.sub(r',\s*(?:"[^"]*"\s*:\s*)?(?:"[^"]*)?$', "", text)
    r = re.sub(r",\s*\{[^}]*$", "", r)
    r = re.sub(r",\s*$", "", r)
    braces = brackets = 0
    in_str = esc = False
    for ch in r:
        if esc:
            esc = False; continue
        if ch == "\\":
            esc = True; continue
        if ch == '"':
            in_str = not in_str; continue
        if in_str:
            continue
        braces += (ch == "{") - (ch == "}")
        brackets += (ch == "[") - (ch == "]")
    r += "]" * max(brackets, 0) + "}" * max(braces, 0)
    p = json.loads(r)
    if isinstance(p.get("rows"), list) and p["rows"]:
        return p
    raise ValueError("repair failed")


def parse(text: str):
    """Returns (parsed, strategy) or (None, None)."""
    def block(pat):
        m = re.search(pat, text)
        if not m:
            raise ValueError
        return json.loads(m.group(1))

    def braces():
        s, e = text.find("{"), text.rfind("}")
        if s == -1 or e == -1:
            raise ValueError
        return json.loads(text[s:e + 1])

    for name, fn in [
        ("direct", lambda: json.loads(text)),
        ("json_block", lambda: block(r"```json\s*([\s\S]*?)\s*```")),
        ("code_block", lambda: block(r"```\s*([\s\S]*?)\s*```")),
        ("braces", braces),
        ("repair_truncated", lambda: repair_truncated(text)),
    ]:
        try:
            return fn(), name
        except Exception:
            continue
    return None, None


def to_grid(parsed: dict) -> dict:
    """{'detected_month','detected_year','rows':[(name,{date:int -> code:str})]}"""
    rows = []
    for row in parsed.get("rows") or []:
        shifts = row.get("shifts") or {}
        if isinstance(shifts, list):
            cells = {int(s["date"]): str(s["code"]).strip() for s in shifts if "date" in s}
        else:
            cells = {int(k): str(v).strip() for k, v in shifts.items() if str(k).strip().isdigit()}
        cells = {d: c for d, c in cells.items() if c != ""}
        rows.append(((row.get("name") or "").strip(), cells))
    return {"detected_month": parsed.get("detected_month"),
            "detected_year": parsed.get("detected_year"), "rows": rows}


def norm_name(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def score(pred: dict, truth: dict) -> dict:
    """Cell errors vs truth. Rows matched by exact name first, then by order
    among the leftovers. A cell counts as wrong if missing, extra or different."""
    # Rows with no shifts (e.g. a blank name row) are ignored on both sides.
    t_rows = [r for r in truth["rows"] if r[1]]
    p_rows = [r for r in pred["rows"] if r[1]]
    used, pairs = set(), []
    for ti, (tn, _) in enumerate(t_rows):
        for pi, (pn, _) in enumerate(p_rows):
            if pi not in used and norm_name(pn) == norm_name(tn):
                pairs.append((ti, pi)); used.add(pi); break
    matched_t = {t for t, _ in pairs}
    left_p = [i for i in range(len(p_rows)) if i not in used]
    for ti in range(len(t_rows)):
        if ti not in matched_t and left_p:
            pairs.append((ti, left_p.pop(0)))
    pairs_d = dict(pairs)

    wrong = missing = extra = name_err = 0
    truth_cells = sum(len(c) for _, c in t_rows)
    for ti, (tn, tc) in enumerate(t_rows):
        pi = pairs_d.get(ti)
        if pi is None:
            missing += len(tc); name_err += 1; continue
        pn, pc = p_rows[pi]
        if norm_name(pn) != norm_name(tn):
            name_err += 1
        for d in set(tc) | set(pc):
            if d in tc and d not in pc:
                missing += 1
            elif d in pc and d not in tc:
                extra += 1
            elif tc[d] != pc[d]:
                wrong += 1
    unmatched_p = [i for i in range(len(p_rows)) if i not in pairs_d.values()]
    extra += sum(len(p_rows[i][1]) for i in unmatched_p)
    month_ok = (pred["detected_month"] == truth.get("detected_month")
                and pred["detected_year"] == truth.get("detected_year"))
    return {"cell_errors": wrong + missing + extra, "wrong": wrong, "missing": missing,
            "extra": extra, "truth_cells": truth_cells, "name_errors": name_err,
            "extra_rows": len(unmatched_p), "month_ok": month_ok}


def load_truth(path: Path) -> dict:
    """Truth file = same JSON shape the model returns (compact format)."""
    return to_grid(json.loads(path.read_text("utf-8")))


def run_one(key, model, thinking, img: Path, max_tokens: int = MAX_TOKENS) -> dict:
    data = base64.b64encode(img.read_bytes()).decode()
    body = json.dumps({
        "contents": [{"parts": [
            {"text": PROMPT},
            {"inline_data": {"mime_type": mime_for(img), "data": data}},
        ]}],
        "generationConfig": generation_config(thinking, max_tokens),
    }).encode()
    t0 = time.monotonic()
    status, resp = post(f"{API}/models/{model}:generateContent", key, body)
    secs = time.monotonic() - t0
    rec = {"model": model, "thinking": thinking, "max_tokens": max_tokens, "image": img.name,
           "image_kb": round(img.stat().st_size / 1024), "status": status,
           "seconds": round(secs, 2)}
    if status != 200 or not isinstance(resp, dict):
        rec["error"] = resp if isinstance(resp, str) else json.dumps(resp)[:500]
        return rec
    um = resp.get("usageMetadata", {})
    rec.update({
        "prompt_tokens": um.get("promptTokenCount"),
        "output_tokens": um.get("candidatesTokenCount"),
        "thinking_tokens": um.get("thoughtsTokenCount", 0),
        "finish_reason": (resp.get("candidates") or [{}])[0].get("finishReason"),
        "model_version": resp.get("modelVersion"),
    })
    parts = ((resp.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    text = next((p["text"] for p in parts if "text" in p and not p.get("thought")), "")
    rec["raw_text"] = text
    parsed, strategy = parse(text) if text else (None, None)
    rec["parse"] = strategy or "FAILED"
    if parsed is not None:
        rec["grid"] = to_grid(parsed)
    return rec


def summarize(records: list[dict], truth: dict[str, dict], prices: dict) -> list[dict]:
    groups: dict[tuple, list] = {}
    for r in records:
        groups.setdefault((r["model"], r["thinking"]), []).append(r)
    out = []
    for (model, thinking), rs in groups.items():
        ok = [r for r in rs if r.get("status") == 200]
        secs = [r["seconds"] for r in ok]
        outs = [(r.get("output_tokens") or 0) + (r.get("thinking_tokens") or 0) for r in ok]
        errs = []
        for r in ok:
            t = truth.get(r["image"])
            if t and "grid" in r:
                r["score"] = score(r["grid"], t)
                errs.append(r["score"]["cell_errors"])
            elif t:
                errs.append(None)  # parse failed
        p = prices.get(model)
        costs = []
        if p:
            for r in ok:
                costs.append((r.get("prompt_tokens") or 0) / 1e6 * p["input"]
                             + ((r.get("output_tokens") or 0) + (r.get("thinking_tokens") or 0)) / 1e6 * p["output"])
        out.append({
            "model": model, "thinking": thinking, "runs": len(rs), "ok": len(ok),
            "http_errors": sorted({r["status"] for r in rs if r.get("status") != 200}),
            "median_s": round(statistics.median(secs), 1) if secs else None,
            "max_s": round(max(secs), 1) if secs else None,
            "median_out_tokens": int(statistics.median([r.get("output_tokens") or 0 for r in ok])) if ok else None,
            "median_thinking_tokens": int(statistics.median([r.get("thinking_tokens") or 0 for r in ok])) if ok else None,
            "median_total_out": int(statistics.median(outs)) if outs else None,
            "parse_ok": sum(1 for r in ok if r.get("parse") not in (None, "FAILED")),
            "parse_strategies": sorted({r.get("parse") for r in ok}),
            "finish_reasons": sorted({str(r.get("finish_reason")) for r in ok}),
            "cell_errors": errs,
            "usd_per_scan": round(statistics.median(costs), 5) if costs else None,
        })
    return out


def print_table(summary: list[dict]):
    hdr = ["model", "thinking", "ok", "median_s", "max_s", "median_out_tokens",
           "median_thinking_tokens", "parse_ok", "cell_errors", "usd_per_scan"]
    print("| " + " | ".join(hdr) + " |")
    print("|" + "---|" * len(hdr))
    for s in summary:
        print("| " + " | ".join(str(s.get(h)) for h in hdr) + " |")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list-models", action="store_true")
    ap.add_argument("--images", nargs="*", default=[])
    ap.add_argument("--models", nargs="*", default=DEFAULT_MODELS)
    ap.add_argument("--thinking", nargs="*", default=DEFAULT_THINKING,
                    help="'default' = no thinkingConfig (current production)")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--max-tokens", type=int, default=MAX_TOKENS,
                    help="maxOutputTokens; production app_config seeds 8192")
    ap.add_argument("--truth", nargs="*", default=[], help="truth JSON per image; same basename stem")
    ap.add_argument("--prices", default=str(HERE / "prices.json"))
    ap.add_argument("--score", help="re-score an existing output dir without calling the API")
    a = ap.parse_args()

    prices = json.loads(Path(a.prices).read_text()) if Path(a.prices).exists() else {}
    truth = {}
    for t in a.truth:
        tp = Path(t)
        for ext in (".jpg", ".jpeg", ".png", ".JPG", ".JPEG", ".PNG", ".heic"):
            truth[tp.stem + ext] = load_truth(tp)

    if a.score:
        d = Path(a.score)
        records = [json.loads(l) for l in (d / "records.jsonl").read_text().splitlines() if l.strip()]
        for r in records:
            if "grid" in r:
                r["grid"]["rows"] = [tuple(x) for x in r["grid"]["rows"]]
                r["grid"]["rows"] = [(n, {int(k): v for k, v in c.items()}) for n, c in r["grid"]["rows"]]
        summary = summarize(records, truth, prices)
        (d / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
        (d / "scores.json").write_text(json.dumps(
            [{k: r.get(k) for k in ("model", "thinking", "image", "seconds", "score")} for r in records],
            ensure_ascii=False, indent=1))
        print_table(summary)
        return

    key = api_key()
    if a.list_models:
        req = urllib.request.Request(f"{API}/models?pageSize=200", headers={"x-goog-api-key": key})
        with urllib.request.urlopen(req, timeout=60) as r:
            for m in json.loads(r.read()).get("models", []):
                if "flash" in m["name"] or "pro" in m["name"]:
                    print(m["name"], "| thinking:", m.get("thinking"), "| out:", m.get("outputTokenLimit"))
        return

    if not a.images:
        sys.exit("--images required")
    imgs = [Path(i) for i in a.images]
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir = HERE / "output" / stamp
    out_dir.mkdir(parents=True, exist_ok=True)
    rec_path = out_dir / "records.jsonl"
    records = []
    # Interleave configs per round so time-of-day drift hits every config equally.
    for run in range(a.runs):
        for img in imgs:
            for model in a.models:
                for th in a.thinking:
                    r = run_one(key, model, th, img, a.max_tokens)
                    r["run"] = run + 1
                    records.append(r)
                    with rec_path.open("a") as f:
                        f.write(json.dumps(r, ensure_ascii=False) + "\n")
                    print(f"[{run+1}] {img.name} {model} {th}: status={r['status']} "
                          f"{r['seconds']}s out={r.get('output_tokens')} think={r.get('thinking_tokens')} "
                          f"parse={r.get('parse')} finish={r.get('finish_reason')}"
                          + (f" err={r['error'][:160]}" if "error" in r else ""), flush=True)
    summary = summarize(records, truth, prices)
    (out_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1))
    print(f"\nSaved to {out_dir}")
    print_table(summary)


if __name__ == "__main__":
    main()
