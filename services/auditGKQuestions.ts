// scripts/auditQuestions.ts
// Usage: tsx scripts/auditQuestions.ts questions.json audited_questions.json
//
// Resume: if output file already exists, skips already-processed questions (by number).
// Re-run the same command tomorrow — it picks up exactly where it stopped.
// Add more keys to lib/providers.ts → script automatically uses them before stopping.

import fs from "fs";
import "dotenv/config";
import { getActiveGeminiKey, exhaustGeminiKey, getGeminiKeyName  } from "../lib/providers";

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
}

interface AuditedQuestion extends Question {
  difficulty: number;
  corrected_question: string | null;
  corrected_options: Question["options"] | null;
  corrected_explanation: string | null;
  audit_issues: string;
  audit_status: "ok" | "corrected" | "error";
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
const FLUSH_EVERY  = 10;   // write to disk every N questions

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// ── Gemini call ───────────────────────────────────────────────────────────────

async function auditWithGemini(
  q: Question,
  attempt = 0,
  retryCount = 0
): Promise<GeminiAuditResult | null | "KEYS_EXHAUSTED"> {
  // if (attempt >= 2) return "KEYS_EXHAUSTED";

  let apiKey: string;
  let keyLabel: string;
  try {
    apiKey   = getActiveGeminiKey();
    keyLabel = getGeminiKeyName(apiKey); // → "gemini_1", "gemini_2", etc.
  } catch {
    return "KEYS_EXHAUSTED";
  }

  const prompt = `You are an exam quality auditor for Indian competitive exams (RRB NTPC, Group-D, ALP etc).

Given this MCQ from a Previous Year Question paper:
Question: ${q.question}
Options: a) ${q.options.a}  b) ${q.options.b}  c) ${q.options.c}  d) ${q.options.d}
Correct Answer: (${q.correctAns})
Explanation: ${q.explanation}

Your tasks:
1. Assign a difficulty score from 0.0 to 1.0
2. Fix any garbled text — broken fractions like "3 4" should be "3/4", "n2" should be "n²", split math expressions, OCR artifacts etc.
3. If the question/options/explanation are already clean, return them unchanged.

Difficulty scale (for Indian graduation-level competitive exam students):
- 0.0–0.3  : too basic, direct formula recall, single step
- 0.3–0.55 : standard exam level, 1-2 steps, concept application
- 0.55–0.75: moderate difficulty, multi-step, requires solid understanding
- 0.75–1.0 : hard, tricky logic, multi-concept, or complex calculation

Return ONLY a raw JSON object — no markdown, no backticks, no explanation outside the JSON:
{
  "difficulty": 0.45,
  "question": "question text here",
  "options": { "a": "...", "b": "...", "c": "...", "d": "..." },
  "explanation": "explanation text here",
  "issues": "brief description of what was fixed, or empty string if nothing changed"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
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
      const wait = (retryCount + 1) * 8000; // 8s, 16s, 24s
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
      console.log(`\n  ⚠️  ${err?.cause?.code ?? err?.code} on ${keyLabel} — retrying in ${wait / 1000}s (attempt ${retryCount + 1}/3)`);
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
  process.stdout.write(`[${index + 1}/${total}] Q${q.number} "${q.question.slice(0, 48)}..." `);

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
      status:        "ACTIVE",  // no concept of failing — still ACTIVE
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
  const valid     = results.filter(r => r.difficulty >= 0);
  const errors    = results.filter(r => r.audit_status === "error");
  const corrected = valid.filter(r => r.audit_status === "corrected");
  const clean     = valid.filter(r => r.audit_status === "ok");

  const avg = valid.length
    ? (valid.reduce((s, r) => s + r.difficulty, 0) / valid.length).toFixed(3)
    : "N/A";

  // Bucket keys must match what we increment below
  const buckets: Record<string, number> = {
    "0.0–0.3  (EASY)     ": 0,
    "0.3–0.55 (MEDIUM)   ": 0,
    "0.55–0.75(HARD)     ": 0,
    "0.75–1.0 (VERY HARD)": 0,
  };

  valid.forEach(r => {
    if      (r.difficulty < 0.3)  buckets["0.0–0.3  (EASY)     "]++;
    else if (r.difficulty < 0.55) buckets["0.3–0.55 (MEDIUM)   "]++;
    else if (r.difficulty < 0.75) buckets["0.55–0.75(HARD)     "]++;
    else                          buckets["0.75–1.0 (VERY HARD)"]++;
  });

  console.log("\n══════════════════════════════════════════");
  console.log("  AUDIT SUMMARY");
  console.log("══════════════════════════════════════════");
  console.log(`  Total       : ${results.length}`);
  console.log(`  ✅ ACTIVE   : ${results.length - errors.length}`);
  console.log(`  ❌ Errors   : ${errors.length}  (kept as ACTIVE, difficulty=-1)`);
  console.log(`  🔧 Corrected: ${corrected.length}`);
  console.log(`  ✨ Clean    : ${clean.length}`);
  console.log(`  Avg score   : ${avg}`);
  console.log("\n  Difficulty Distribution:");
  Object.entries(buckets).forEach(([range, count]) => {
    const bar = "█".repeat(Math.round(count / 2));
    console.log(`    ${range}: ${String(count).padStart(4)}  ${bar}`);
  });
  console.log("══════════════════════════════════════════\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const inputPath  = process.argv[2] ?? "questions.json";
  const outputPath = process.argv[3] ?? "audited_questions.json";

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File not found: ${inputPath}`);
    process.exit(1);
  }

  const allQuestions: Question[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

  // ── Resume: load already-done results ──────────────────────────────────────
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

  console.log(`\n📋 Total: ${allQuestions.length} | Done: ${doneKeys.size} | Remaining: ${remaining.length}`);
  console.log(`🤖 Model: ${GEMINI_MODEL} | Delay: ${DELAY_MS}ms\n`);

  if (remaining.length === 0) {
    console.log("✅ All questions already audited.");
    printSummary(doneResults);
    return;
  }

  // ── Sequential loop with flush + stop on keys exhausted ───────────────────
  const newResults: AuditedQuestion[] = [];

  for (let i = 0; i < remaining.length; i++) {
    const result = await processQuestion(remaining[i], i, remaining.length);

    if (result === "KEYS_EXHAUSTED") {
      console.log(`\n🛑 All API keys exhausted — stopped at Q${remaining[i].number}`);
      console.log(`   ${remaining.length - i} questions remaining`);
      console.log(`   Re-run the same command tomorrow (or add more keys) to continue\n`);
      break;
    }

    newResults.push(result);

    // Flush to disk every FLUSH_EVERY questions
    if (newResults.length % FLUSH_EVERY === 0) {
      const merged = [...doneResults, ...newResults];
      fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2), "utf-8");
      console.log(`  💾 Flushed ${merged.length} total to ${outputPath}`);
    }

    await sleep(DELAY_MS);
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