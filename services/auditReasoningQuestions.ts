// services/auditReasoningQuestions.ts
// Usage: tsx services/auditReasoningQuestions.ts full_parsed_reasoning.json audited_reasoning.json
//
// Resume: if output file already exists, skips already-processed questions (by number).
// Re-run the same command tomorrow — it picks up exactly where it stopped.
// Add more keys to lib/providers.ts → script automatically uses them before stopping.
//
// Key differences from auditQuestions.ts (GK version):
// - Skips needsVisualRevisit=true questions (handled by separate vision script)
// - Topic-aware prompt: Direction Test / Seating → ASCII diagram instructions
//   Coding-Decoding / Series → letter-position table format
//   everything else → standard text fix
// - Preserves needsVisualRevisit / revisitReason / sourcePage fields on output

import fs from "fs";
import "dotenv/config";
import { getActiveGeminiKey, exhaustGeminiKey, getGeminiKeyName } from "../lib/providers";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Question {
  number: number;
  subject: string;
  topic: string;
  subtopic: string;
  question: string;
  options: { a: string; b: string; c: string; d: string };
  correctAns: string;
  explanation: string;
  sourceRaw: string;
  examType: string;
  examStage: string;
  examDate: string;
  examShift: string;
  isPyq: boolean;
  status: string;
  needsVisualRevisit: boolean;
  revisitReason: string | null;
  sourcePage: number;
}

interface AuditedQuestion extends Question {
  difficulty: number;
  corrected_question: string | null;
  corrected_options: Question["options"] | null;
  corrected_explanation: string | null;
  audit_issues: string;
  audit_status: "ok" | "corrected" | "error" | "skipped_visual";
}

interface GeminiAuditResult {
  difficulty: number;
  question: string;
  options: { a: string; b: string; c: string; d: string };
  explanation: string;
  issues: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const DELAY_MS     = 5000;
const FLUSH_EVERY  = 10;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// ── Topic classification ───────────────────────────────────────────────────────
// Determines which prompt variant to use

type PromptVariant = "direction" | "seating" | "coding" | "series" | "standard";

function getPromptVariant(topic: string): PromptVariant {
  const t = topic.toLowerCase();
  if (t.includes("direction"))                      return "direction";
  if (t.includes("sitting") || t.includes("seating") || t.includes("sequence")) return "seating";
  if (t.includes("coding"))                         return "coding";
  if (t.includes("series") || t.includes("missing")) return "series";
  return "standard";
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(q: Question): string {
  const variant = getPromptVariant(q.topic);

  const base = `You are an exam quality auditor for Indian competitive exams (RRB NTPC, Group-D, ALP etc).

Given this MCQ from a Previous Year Question paper (Topic: ${q.topic}):
Question: ${q.question}
Options: a) ${q.options.a}  b) ${q.options.b}  c) ${q.options.c}  d) ${q.options.d}
Correct Answer: (${q.correctAns})
Explanation: ${q.explanation}

Your tasks:
1. Assign a difficulty score from 0.0 to 1.0
2. Fix garbled OCR text — broken fractions like "3 4" → "3/4", "n2" → "n²", collapsed math steps, garbled symbols
3. If the explanation references a diagram (direction path, seating layout, letter-shift table) that is missing or broken, RECONSTRUCT it as plain-text ASCII — see format rules below
4. If question/options/explanation are already clean, return them unchanged

Difficulty scale (for Indian graduation-level competitive exam students):
- 0.0–0.3  : too basic, direct recall, single step
- 0.3–0.55 : standard exam level, 1–2 steps, concept application
- 0.55–0.75: moderate, multi-step, requires solid understanding
- 0.75–1.0 : hard, tricky logic, multi-concept, complex calculation`;

  // Variant-specific diagram instructions
  const variantInstructions: Record<PromptVariant, string> = {

    direction: `
DIRECTION TEST — ASCII diagram rules:
- Use a compass cross:     N
                         W + E
                           S
- Show the path as a sequence of steps with turn labels:
  Start → [R] East → [L] North → [R] East  (final: East)
- Keep it compact, 5–8 lines max
- Example output in explanation field:
  "Path: Start(House) →[L] North →[R] East →[L] North →[R] East
        N
      W + E
        S
  Final direction: North"`,

    seating: `
SEATING / SEQUENCE ARRANGEMENT — ASCII rules:
- For a LINEAR row: show positions as a single line with names:
  Pos: 1   2   3   4   5   6
       Z   R   X   W   Q   Y   (facing North →)
- For a CIRCULAR table: show a ring with names at clock positions
- Number positions clearly; mark who is asked about with *asterisk*
- Keep it under 8 lines`,

    coding: `
CODING-DECODING — letter-shift table rules:
- If the explanation shows a letter-position shift (e.g. A→+4→E), format as a table:
  Letter | Position | +shift | Result | Position
    T    |    20    |   +4   |   X    |    24
    P    |    16    |   +4   |   T    |    20
- Use | column separators, align with spaces
- If it is a symbol/number substitution code, show as: A=26, B=25 … mapping
- Keep tables compact, one row per letter`,

    series: `
SERIES / MISSING TERM — step format rules:
- Show the pattern step-by-step under the series:
  Series:  4   7   12   19   28   ?
  Diff:     +3  +5   +7   +9  +11
  Next diff would be +11, so ? = 28 + 11 = 39
- For letter series show letter + position number side by side
- Keep it linear, no boxes needed`,

    standard: `
STANDARD QUESTIONS — text fix rules:
- Fix OCR artifacts: garbled symbols, split words, broken math
- For blood relation questions, you may show a short family tree using → and lines:
  Grandfather
      |
    Father — Mother
      |
    [Person]
- No boxes or heavy ASCII art needed for standard questions`,
  };

  const outputSpec = `

Return ONLY a raw JSON object — no markdown, no backticks, no text outside the JSON:
{
  "difficulty": 0.45,
  "question": "question text here",
  "options": { "a": "...", "b": "...", "c": "...", "d": "..." },
  "explanation": "explanation text here — include ASCII diagram inline if reconstructed",
  "issues": "brief description of what was fixed, or empty string if nothing changed"
}`;

  return base + variantInstructions[variant] + outputSpec;
}

// ── Gemini call ───────────────────────────────────────────────────────────────

async function auditWithGemini(
  q: Question,
  attempt = 0,
  retryCount = 0
): Promise<GeminiAuditResult | null | "KEYS_EXHAUSTED"> {
  let apiKey: string;
  let keyLabel: string;
  try {
    apiKey   = getActiveGeminiKey();
    keyLabel = getGeminiKeyName(apiKey);
  } catch {
    return "KEYS_EXHAUSTED";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(q) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1500 },
      }),
    });

    if (res.status === 429) {
      console.log(`\n  ⚠️  429 on ${keyLabel} — exhausting, trying next key`);
      exhaustGeminiKey(apiKey);
      return auditWithGemini(q, attempt + 1, retryCount);
    }

    if (res.status === 503 || res.status === 502 || res.status === 500) {
      if (retryCount >= 3) {
        console.error(`\n  ⚠️  ${res.status} after 3 retries on ${keyLabel} — skipping`);
        return null;
      }
      const wait = (retryCount + 1) * 8000;
      console.log(`\n  ⚠️  ${res.status} on ${keyLabel} — retrying in ${wait / 1000}s (attempt ${retryCount + 1}/3)`);
      await sleep(wait);
      return auditWithGemini(q, attempt, retryCount + 1);
    }

    if (!res.ok) {
      console.error(`\n  API error ${res.status} on ${keyLabel}:`, (await res.text()).slice(0, 200));
      return null;
    }

    const data    = await res.json();
    const raw     = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as GeminiAuditResult;

  } catch (err: any) {
    const isTransient =
      err?.code === "ECONNRESET" ||
      err?.code === "ECONNREFUSED" ||
      err?.cause?.code === "ECONNRESET";
    if (isTransient && retryCount < 3) {
      const wait = (retryCount + 1) * 8000;
      console.log(`\n  ⚠️  ${err?.cause?.code ?? err?.code} on ${keyLabel} — retrying in ${wait / 1000}s`);
      await sleep(wait);
      return auditWithGemini(q, attempt, retryCount + 1);
    }
    console.error(`\n  Parse/fetch error on ${keyLabel}:`, err);
    return null;
  }
}

// ── Process single question ───────────────────────────────────────────────────

async function processQuestion(
  q: Question,
  index: number,
  total: number
): Promise<AuditedQuestion | "KEYS_EXHAUSTED"> {
  // Vision-flagged: skip entirely, mark for later vision revisit script
  if (q.needsVisualRevisit) {
    process.stdout.write(`[${index + 1}/${total}] Q${q.number} ⏭️  skipped (needsVisualRevisit)\n`);
    return {
      ...q,
      difficulty: -1,
      corrected_question:    null,
      corrected_options:     null,
      corrected_explanation: null,
      audit_issues:  "skipped — needs vision revisit",
      audit_status:  "skipped_visual",
    };
  }

  const variant = getPromptVariant(q.topic);
  process.stdout.write(`[${index + 1}/${total}] Q${q.number} [${variant}] "${q.question.slice(0, 45)}..." `);

  const result = await auditWithGemini(q);

  if (result === "KEYS_EXHAUSTED") {
    console.log("🛑 keys exhausted");
    return "KEYS_EXHAUSTED";
  }

  if (!result) {
    console.log(`❌ error — keeping original`);
    return {
      ...q,
      difficulty: -1,
      corrected_question:    null,
      corrected_options:     null,
      corrected_explanation: null,
      audit_issues:  "API call failed",
      audit_status:  "error",
      status:        "ACTIVE",
    };
  }

  const questionChanged    = result.question.trim()    !== q.question.trim();
  const explanationChanged = result.explanation.trim() !== q.explanation.trim();
  const optionsChanged     =
    result.options.a !== q.options.a ||
    result.options.b !== q.options.b ||
    result.options.c !== q.options.c ||
    result.options.d !== q.options.d;

  const hadChanges = questionChanged || optionsChanged || explanationChanged;
  const difficulty = Math.max(0, Math.min(1, result.difficulty));

  console.log(`score=${difficulty.toFixed(2)}${hadChanges ? " [corrected]" : ""}`);
  if (result.issues) console.log(`     ↳ ${result.issues}`);

  return {
    ...q,
    difficulty,
    status: "ACTIVE",
    corrected_question:    questionChanged    ? result.question    : null,
    corrected_options:     optionsChanged     ? result.options     : null,
    corrected_explanation: explanationChanged ? result.explanation : null,
    audit_issues:  result.issues ?? "",
    audit_status:  hadChanges ? "corrected" : "ok",
  };
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary(results: AuditedQuestion[]) {
  const skipped   = results.filter(r => r.audit_status === "skipped_visual");
  const processed = results.filter(r => r.audit_status !== "skipped_visual");
  const valid     = processed.filter(r => r.difficulty >= 0);
  const errors    = processed.filter(r => r.audit_status === "error");
  const corrected = valid.filter(r => r.audit_status === "corrected");
  const clean     = valid.filter(r => r.audit_status === "ok");

  const avg = valid.length
    ? (valid.reduce((s, r) => s + r.difficulty, 0) / valid.length).toFixed(3)
    : "N/A";

  const buckets: Record<string, number> = {
    "0.0–0.30 (EASY)     ": 0,
    "0.3–0.55 (MEDIUM)   ": 0,
    "0.55–0.75(HARD)     ": 0,
    "0.75–1.0 (VERY HARD)": 0,
  };
  valid.forEach(r => {
    if      (r.difficulty < 0.3)  buckets["0.0–0.30 (EASY)     "]++;
    else if (r.difficulty < 0.55) buckets["0.3–0.55 (MEDIUM)   "]++;
    else if (r.difficulty < 0.75) buckets["0.55–0.75(HARD)     "]++;
    else                          buckets["0.75–1.0 (VERY HARD)"]++;
  });

  // Per-topic corrected count
  const topicCorrections: Record<string, number> = {};
  corrected.forEach(r => {
    topicCorrections[r.topic] = (topicCorrections[r.topic] ?? 0) + 1;
  });

  console.log("\n══════════════════════════════════════════");
  console.log("  AUDIT SUMMARY — Reasoning");
  console.log("══════════════════════════════════════════");
  console.log(`  Total       : ${results.length}`);
  console.log(`  ⏭️  Skipped (vision) : ${skipped.length}`);
  console.log(`  ✅ Processed: ${processed.length}`);
  console.log(`  ❌ Errors   : ${errors.length}`);
  console.log(`  🔧 Corrected: ${corrected.length}`);
  console.log(`  ✨ Clean    : ${clean.length}`);
  console.log(`  Avg score   : ${avg}`);
  console.log("\n  Difficulty Distribution (processed only):");
  Object.entries(buckets).forEach(([range, count]) => {
    const bar = "█".repeat(Math.round(count / 10));
    console.log(`    ${range}: ${String(count).padStart(4)}  ${bar}`);
  });
  if (Object.keys(topicCorrections).length > 0) {
    console.log("\n  Corrections by Topic:");
    Object.entries(topicCorrections)
      .sort((a, b) => b[1] - a[1])
      .forEach(([topic, count]) => {
        console.log(`    ${topic.padEnd(35)}: ${count}`);
      });
  }
  console.log("══════════════════════════════════════════\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const inputPath  = process.argv[2] ?? "full_parsed_reasoning.json";
  const outputPath = process.argv[3] ?? "audited_reasoning.json";

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File not found: ${inputPath}`);
    process.exit(1);
  }

  const allQuestions: Question[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

  // ── Resume ─────────────────────────────────────────────────────────────────
  let doneResults: AuditedQuestion[] = [];
  const doneKeys = new Set<string>();
  if (fs.existsSync(outputPath)) {
    doneResults = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
    doneResults.forEach(r => doneKeys.add(`${r.number}::${r.question.slice(0, 40)}`));
    console.log(`\n♻️  Resuming — ${doneKeys.size} already done, skipping them`);
  }

  const remaining = allQuestions.filter(
    q => !doneKeys.has(`${q.number}::${q.question.slice(0, 40)}`)
  );

  const visualCount = remaining.filter(q => q.needsVisualRevisit).length;
  console.log(`\n📋 Total: ${allQuestions.length} | Done: ${doneKeys.size} | Remaining: ${remaining.length}`);
  console.log(`👁️  Of remaining: ${visualCount} will be auto-skipped (needsVisualRevisit)`);
  console.log(`🤖 Model: ${GEMINI_MODEL} | Delay: ${DELAY_MS}ms\n`);

  if (remaining.length === 0) {
    console.log("✅ All questions already audited.");
    printSummary(doneResults);
    return;
  }

  // ── Sequential loop ────────────────────────────────────────────────────────
  const newResults: AuditedQuestion[] = [];

  for (let i = 0; i < remaining.length; i++) {
    const result = await processQuestion(remaining[i], i, remaining.length);

    if (result === "KEYS_EXHAUSTED") {
      console.log(`\n🛑 All API keys exhausted — stopped at Q${remaining[i].number}`);
      console.log(`   ${remaining.length - i} questions remaining`);
      console.log(`   Re-run same command tomorrow (or add more keys) to continue\n`);
      break;
    }

    newResults.push(result);

    // Visual-skipped questions don't need a delay (no API call made)
    if (!remaining[i].needsVisualRevisit) {
      if (newResults.filter(r => r.audit_status !== "skipped_visual").length % FLUSH_EVERY === 0) {
        const merged = [...doneResults, ...newResults];
        fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2), "utf-8");
        console.log(`  💾 Flushed ${merged.length} total to ${outputPath}`);
      }
      await sleep(DELAY_MS);
    }
  }

  // ── Final save ─────────────────────────────────────────────────────────────
  const merged = [...doneResults, ...newResults];
  fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2), "utf-8");
  console.log(`\n💾 Saved ${merged.length} to ${outputPath}`);

  const stillRemaining = allQuestions.length - merged.length;
  if (stillRemaining > 0) {
    console.log(`⏸️  ${stillRemaining} questions not yet audited — re-run same command to continue`);
  }

  printSummary(merged);
}

main().catch(console.error);