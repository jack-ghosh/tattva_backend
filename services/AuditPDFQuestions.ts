// scripts/auditQuestions.ts
// Usage: npx ts-node scripts/auditQuestions.ts questions.json audited_questions.json

import fs from "fs";
import "dotenv/config";
import { getActiveGeminiKey, exhaustGeminiKey } from "../lib/providers";

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
const CONCURRENCY = 1;
const DELAY_MS = 5000;        // 3.5s per worker → ~2 req/3.5s = safe under 10 RPM per key
const DIFFICULTY_THRESHOLD = 0.3;

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// ── Gemini call ───────────────────────────────────────────────────────────────

async function auditWithGemini(
  q: Question,
  attempt = 0
): Promise<GeminiAuditResult | null> {
  if (attempt >= 2) {
    // Tried both keys, give up on this question
    return null;
  }

  let apiKey: string;
  try {
    apiKey = getActiveGeminiKey();
  } catch {
    console.error("\n  All Gemini keys exhausted");
    return null;
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
- 0.0–0.3: too basic, direct formula recall, single step
- 0.3–0.55: standard exam level, 1-2 steps, concept application
- 0.55–0.75: moderate difficulty, multi-step, requires solid understanding
- 0.75–1.0: hard, tricky logic, multi-concept, or complex calculation

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
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      }),
    });

    // Rate limit hit — exhaust this key and retry with the next one
if (res.status === 429) {
  console.log(`\n  ⚠️  429 on key ...${apiKey.slice(-6)} — waiting 60s`);
  await sleep(60000); // wait a full minute, then retry same key
  return auditWithGemini(q, attempt + 1);
}

    if (!res.ok) {
      const err = await res.text();
      console.error(`\n  API error ${res.status}:`, err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned) as GeminiAuditResult;

  } catch (err) {
    console.error(`\n  Parse/fetch error:`, err);
    return null;
  }
}

// ── Process single question ───────────────────────────────────────────────────

async function processQuestion(
  q: Question,
  index: number,
  total: number
): Promise<AuditedQuestion> {
  process.stdout.write(`[${index + 1}/${total}] Q${q.number} "${q.question.slice(0, 48)}..." `);

  const result = await auditWithGemini(q);

  if (!result) {
    console.log(`❌ error — keeping original`);
    return {
      ...q,
      difficulty: -1,
      corrected_question: null,
      corrected_options: null,
      corrected_explanation: null,
      audit_issues: "API call failed",
      audit_status: "error",
      status: "PENDING",
    };
  }

  const questionChanged    = result.question.trim()     !== q.question.trim();
  const explanationChanged = result.explanation.trim()  !== q.explanation.trim();
  const optionsChanged     =
    result.options.a !== q.options.a ||
    result.options.b !== q.options.b ||
    result.options.c !== q.options.c ||
    result.options.d !== q.options.d;

  const hadChanges = questionChanged || optionsChanged || explanationChanged;
  const difficulty = Math.max(0, Math.min(1, result.difficulty));
  const passed     = difficulty >= DIFFICULTY_THRESHOLD;

  console.log(`${passed ? "✅" : "🔴"} score=${difficulty.toFixed(2)}${hadChanges ? " [corrected]" : ""}`);
  if (result.issues) console.log(`     ↳ ${result.issues}`);

  return {
    ...q,
    difficulty,
    status: passed ? "ACTIVE" : "FAILED",
    corrected_question:    questionChanged    ? result.question    : null,
    corrected_options:     optionsChanged     ? result.options     : null,
    corrected_explanation: explanationChanged ? result.explanation : null,
    audit_issues:  result.issues ?? "",
    audit_status:  hadChanges ? "corrected" : "ok",
  };
}

// ── Concurrency runner ────────────────────────────────────────────────────────

async function runWithConcurrency(
  questions: Question[],
  concurrency: number,
  fn: (q: Question, i: number, total: number) => Promise<AuditedQuestion>
): Promise<AuditedQuestion[]> {
  const results: AuditedQuestion[] = new Array(questions.length);
  let cursor = 0;

async function worker(workerIndex: number) {
  await sleep(workerIndex * 4000); // worker 0 starts immediately, worker 1 starts after 4s
  while (cursor < questions.length) {
    const i = cursor++;
    results[i] = await fn(questions[i], i, questions.length);
    await sleep(DELAY_MS);
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  return results;
}

// ── Summary ───────────────────────────────────────────────────────────────────

function printSummary(results: AuditedQuestion[]) {
  const valid     = results.filter(r => r.difficulty >= 0);
  const passed    = valid.filter(r => r.status === "ACTIVE");
  const failed    = valid.filter(r => r.status === "FAILED");
  const errors    = results.filter(r => r.audit_status === "error");
  const corrected = valid.filter(r => r.audit_status === "corrected");

  const avg = valid.length
    ? (valid.reduce((s, r) => s + r.difficulty, 0) / valid.length).toFixed(3)
    : "N/A";

  const buckets: Record<string, number> = {
    "0.0–0.3  (FAILED)": 0,
    "0.3–0.55 (EASY)  ": 0,
    "0.55–0.75(MEDIUM)": 0,
    "0.75–1.0 (HARD)  ": 0,
  };
  valid.forEach(r => {
    if      (r.difficulty < 0.3)  buckets["0.0–0.3  (FAILED)"]++;
    else if (r.difficulty < 0.55) buckets["0.3–0.55 (EASY)  "]++;
    else if (r.difficulty < 0.75) buckets["0.55–0.75(MEDIUM)"]++;
    else                          buckets["0.75–1.0 (HARD)  "]++;
  });

  console.log("\n══════════════════════════════════════════");
  console.log("  AUDIT SUMMARY");
  console.log("══════════════════════════════════════════");
  console.log(`  Total      : ${results.length}`);
  console.log(`  ✅ ACTIVE  : ${passed.length}`);
  console.log(`  🔴 FAILED  : ${failed.length}`);
  console.log(`  ❌ Errors  : ${errors.length}`);
  console.log(`  🔧 Corrected: ${corrected.length}`);
  console.log(`  Avg score  : ${avg}`);
  console.log("\n  Distribution:");
  Object.entries(buckets).forEach(([range, count]) => {
    const bar = "█".repeat(Math.round(count / 2));
    console.log(`    ${range}: ${String(count).padStart(3)}  ${bar}`);
  });

  if (corrected.length > 0) {
    console.log("\n  Corrections made:");
    corrected.forEach(r => console.log(`    Q${r.number}: ${r.audit_issues}`));
  }

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

  const questions: Question[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  console.log(`\n📋 Loaded ${questions.length} questions`);
  console.log(`🤖 Model: ${GEMINI_MODEL} | Concurrency: ${CONCURRENCY} | Delay: ${DELAY_MS}ms | Threshold: ${DIFFICULTY_THRESHOLD}\n`);

  const start   = Date.now();
  const results = await runWithConcurrency(questions, CONCURRENCY, processQuestion);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\n💾 Written to ${outputPath} (${elapsed}s)`);

  printSummary(results);
}

main().catch(console.error);