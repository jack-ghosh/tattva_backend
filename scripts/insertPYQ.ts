// scripts/insertPYQ.ts
// Usage: tsx scripts/insertPYQ.ts audited_questions.json

import fs from "fs";
import crypto from "crypto";
import "dotenv/config";
import { db } from "../lib/db";
import { questions } from "../lib/schema";
import { findSimilarQuestion } from "../lib/vectorStore";
import { eq } from "drizzle-orm";

interface AuditedQuestion {
  number: number;
  subject: string;
  topic: string;
  subtopic: string;
  question: string;
  options: { a: string; b: string; c: string; d: string };
  correctAns: string;
  explanation: string;
  difficulty: number;
  status: string;
  sourceRaw: string;
  examType: string;
  examStage: string;
  examDate: string;
  examShift: string;
  isPyq: boolean;
  corrected_question: string | null;
  corrected_options: { a: string; b: string; c: string; d: string } | null;
  corrected_explanation: string | null;
  audit_status: string;
}

function getDifficultyLabel(score: number): "EASY" | "MEDIUM" | "HARD" {
  if (score >= 0.75) return "HARD";
  if (score >= 0.55) return "MEDIUM";
  return "EASY";
}

function buildEmbeddingText(
  q: AuditedQuestion,
  finalQuestion: string,
  finalOptions: { a: string; b: string; c: string; d: string }
): string {
  const optsText = Object.values(finalOptions).join(" | ");
  return `${q.subject} > ${q.topic} > ${q.subtopic}\n${finalQuestion}\nOptions: ${optsText}`;
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function insertPYQ(inputPath: string) {
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File not found: ${inputPath}`);
    process.exit(1);
  }

  const raw: AuditedQuestion[] = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const toInsert = raw.filter(q => q.status === "ACTIVE");
  const skipped = raw.length - toInsert.length;

  console.log(`\n📋 Total in file      : ${raw.length}`);
  console.log(`✅ To insert          : ${toInsert.length}`);
  console.log(`⏭️  Skipped (inactive) : ${skipped}\n`);

  let inserted = 0;
  let hashDuplicates = 0;
  let semanticDuplicates = 0;
  let failed = 0;

  for (const q of toInsert) {
    try {
      const finalQuestion    = q.corrected_question    ?? q.question;
      const finalOptions     = q.corrected_options     ?? q.options;
      const finalExplanation = q.corrected_explanation ?? q.explanation;

      const hash = crypto
        .createHash("sha256")
        .update(finalQuestion.trim().toLowerCase())
        .digest("hex");

      // 🔍 Cheap DB check FIRST — no API cost, catches reruns instantly
      const existing = await db
        .select({ id: questions.id })
        .from(questions)
        .where(eq(questions.hash, hash))
        .limit(1);

      if (existing.length > 0) {
        console.log(`  ⏭️  Already in DB, skipped: Q${q.number}`);
        hashDuplicates++;
        continue; // no embedding call spent
      }

      const embedText = buildEmbeddingText(q, finalQuestion, finalOptions);
      const { embedding, match } = await findSimilarQuestion(embedText);

      if (match===1) {
        console.log(`  🧠 Semantic duplicate skipped: Q${q.number} (similarity=${match.similarity?.toFixed(3)})`);
        semanticDuplicates++;
        continue;
      }

      const result = await db.insert(questions).values({
        subject:        q.subject,
        topic:          q.topic,
        question:       finalQuestion,
        options:        finalOptions,
        correctAns:     q.correctAns,
        explanation:    finalExplanation,
        difficulty:     getDifficultyLabel(q.difficulty),
        status:         "ACTIVE",
        hash,
        embedding,

        subtopic:       q.subtopic      || null,
        difficultyScore: q.difficulty,
        isPyq:          true,
        sourceRaw:      q.sourceRaw     || null,
        examType:       q.examType      || null,
        examStage:      q.examStage     || null,
        examDate:       q.examDate      || null,
        examShift:      q.examShift     || null,
      }).onConflictDoNothing().returning({ id: questions.id });

      if (result.length === 0) {
        console.log(`  ⏭️  Hash duplicate skipped: Q${q.number}`);
        hashDuplicates++;
      } else {
        console.log(`  ✅ Inserted Q${q.number} | ${q.topic} | score=${q.difficulty.toFixed(2)}`);
        inserted++;
      }

      await sleep(250);
    } catch (err) {
      console.error(`  ❌ Failed Q${q.number}:`, err);
      failed++;
    }
  }

  console.log("\n══════════════════════════════════════════");
  console.log("  INSERT SUMMARY");
  console.log("══════════════════════════════════════════");
  console.log(`  ✅ Inserted           : ${inserted}`);
  console.log(`  🧠 Semantic duplicates: ${semanticDuplicates}`);
  console.log(`  ⏭️  Hash duplicates    : ${hashDuplicates}`);
  console.log(`  ❌ Failed             : ${failed}`);
  console.log("══════════════════════════════════════════\n");
}

const inputPath = process.argv[2] ?? "audited_questions.json";
insertPYQ(inputPath).catch(console.error);