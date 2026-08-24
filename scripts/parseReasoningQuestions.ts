// scripts/parseReasoningQuestions.ts
// Usage: tsx scripts/parseReasoningQuestions.ts full_reasoning_v2.txt parsed_reasoning.json

import { REASONING_PAGE_SUBTOPIC } from "@/data/RRB/topics/reasoningTopics";
import fs from "fs";
import path from "path";

// -- Types --------------------------------------------------------------------

interface ParsedQuestion {
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

// -- Granular Topic & Subtopic Mapping Lookup ---------------------------------
/**
 * Resolves the precise topic and subtopic using the REASONING_PAGE_SUBTOPIC registry.
 * Finds the largest registered page key that is less than or equal to the question's sourcePage.
 */
function getTopicMetadataForPage(page: number): { topic: string; subtopic: string } {
  const registeredPages = Object.keys(REASONING_PAGE_SUBTOPIC)
    .map(Number)
    .sort((a, b) => b - a); // Sort descending to find the largest matching boundary first

  const matchingPage = registeredPages.find(p => page >= p);

  if (matchingPage && REASONING_PAGE_SUBTOPIC[matchingPage]) {
    return {
      topic: REASONING_PAGE_SUBTOPIC[matchingPage].topic,
      subtopic: REASONING_PAGE_SUBTOPIC[matchingPage].subtopic,
    };
  }

  // Fallback if page falls before page 7 or mapping fails
  return { topic: "Miscellaneous", subtopic: "Miscellaneous" };
}

// -- Cleaning helpers -----------------------------------------------------------

function cleanText(text: string): string {
  return text.replace(/\\/gi, "").replace(/\s+/g, " ").trim();
}

function parseSourceLine(source: string): {
  examType: string;
  examStage: string;
  examDate: string;
  examShift: string;
} {
  const cleanSource = cleanText(source);

  const examTypeMatch = cleanSource.match(
    /^(RRB\s+[\w\s.-]+?|RRC\s+[\w\s.-]+?|RPF\s+[\w\s.-]+?)(?:\s*\(Stage|\s+\d|\s+Stage|\s*[-\u2013]\s*\d|\s*[:(]|$)/i
  );

  let examType = examTypeMatch ? examTypeMatch[1].trim() : cleanSource.split(/\d/)[0].trim();
  examType = examType
    .replace(/GROUP\s*-\s*D/gi, "Group-D")
    .replace(/RPF\s*-?\s*SI\b/gi, "RPF SI")
    .replace(/RPF\s*-?\s*Constable\b/gi, "RPF Constable")
    .replace(/ALP\s*&\s*Tec\.\s*/gi, "ALP")
    .replace(/[-\u2013\s(]+$/, "")
    .trim();

  const stageMatch = cleanSource.match(/(Stage[-\s]*(?:I{1,3}|1st|2nd|3rd|\bIst\b|\bIInd\b))/i);
  let examStage = stageMatch ? stageMatch[0].trim() : "";
  if (examStage.toLowerCase().endsWith("ist")) examStage = "Stage I";
  if (examStage.toLowerCase().endsWith("iind")) examStage = "Stage II";

  let examDate = "";
  const generalDateMatch = cleanSource.match(/\d{2}[./-]\d{2}[./-]\d{4}/);
  if (generalDateMatch) {
    examDate = generalDateMatch[0].replace(/-/g, ".");
  } else {
    const rawHyphenMatch = cleanSource.match(/(?:\D|^)(\d{2})(\d{2})(\d{4})(?:\D|$)/);
    if (rawHyphenMatch) {
      examDate = `${rawHyphenMatch[1]}.${rawHyphenMatch[2]}.${rawHyphenMatch[3]}`;
    }
  }

  const shiftMatch = cleanSource.match(/Shift[-\s]*(I{1,3}|\d)/i);
  const examShift = shiftMatch ? shiftMatch[0].trim() : "";

  return { examType, examStage, examDate, examShift };
}

// -- Revisit detection -----------------------------------------------------------

const ARROW_DIAGRAM_PATTERN = /[A-Z]\s*[-—'"]{1,3}\s*[+>0-9oO]{1,3}\s*[-—'">]{0,3}\s*[A-Z]/;
const STACKED_SINGLE_LETTER_PATTERN = /^\s*[A-Z]\s*$/m;
const ARROW_CHAR_PATTERN = /[→\u2192]/;

function detectRevisitNeeded(
  topic: string,
  explanation: string
): { needsVisualRevisit: boolean; revisitReason: string | null } {
  const reasons: string[] = [];

  if (ARROW_CHAR_PATTERN.test(explanation)) {
    reasons.push("contains arrow character");
  }
  if (ARROW_DIAGRAM_PATTERN.test(explanation)) {
    reasons.push("matches garbled shift-arrow pattern");
  }
  const stackedLetterLines = (explanation.match(STACKED_SINGLE_LETTER_PATTERN) || []).length;
  if (stackedLetterLines >= 2) {
    reasons.push("multiple stacked single-letter lines");
  }

  return {
    needsVisualRevisit: reasons.length > 0,
    revisitReason: reasons.length > 0 ? reasons.join("; ") : null,
  };
}

// -- Main parse -----------------------------------------------------------------

export function parseFullReasoningBook(rawText: string): ParsedQuestion[] {
  const lines = rawText.split("\n");
  const questions: ParsedQuestion[] = [];

  let currentPage = 1;
  let blockLines: string[] = [];
  let blockPage = currentPage;

  function flushBlock() {
    if (blockLines.length === 0) return;
    const block = blockLines.join("\n").trim();
    
    // Resolve precise metadata right here using the mapping table
    const { topic, subtopic } = getTopicMetadataForPage(blockPage);
    
    const parsed = parseReasoningBlock(block, topic, subtopic, blockPage);
    if (parsed) questions.push(parsed);
    blockLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    const pageMarkerMatch = trimmed.match(/^-- (\d+) of \d+ --$/);
    if (pageMarkerMatch) {
      currentPage = parseInt(pageMarkerMatch[1]);
      continue;
    }

    const questionStartMatch = trimmed.match(/^(\d{1,4})\.\s+\S/);
    if (questionStartMatch) {
      flushBlock();
      blockPage = currentPage;
      blockLines = [trimmed];
      continue;
    }

    if (blockLines.length > 0) {
      blockLines.push(line);
    }
  }
  flushBlock();

  return questions;
}

function parseReasoningBlock(
  block: string,
  topic: string,
  subtopic: string,
  sourcePage: number
): ParsedQuestion | null {
  const cleanBlock = block.split("\n").map(l => l.trim()).join("\n");

  const numberMatch = cleanBlock.match(/^(\d{1,4})\.\s+([\s\S]+?)(?=\n\s*\([aA]\)|\([aA]\))/i);
  if (!numberMatch) return null;

  const number = parseInt(numberMatch[1]);
  const question = cleanText(numberMatch[2]);

  const optionsMatch = cleanBlock.match(
    /\([aA]\)\s*([\s\S]+?)\s*\([bB]\)\s*([\s\S]+?)\s*\([cC]\)\s*([\s\S]+?)\s*\([dD]\)\s*([\s\S]+?)(?=\n(?:RRB|RRC|RPF|Ans))/i
  );
  if (!optionsMatch) return null;

  const sourceMatch = cleanBlock.match(/\n(RRB|RRC|RPF)[^\n]+/i);
  const sourceRaw = sourceMatch ? cleanText(sourceMatch[0]) : "";

  const ansMatch = cleanBlock.match(/Ans[\s.,:]*\(\s*([a-dA-D])\s*\)/i);
  if (!ansMatch) return null;
  const correctAns = ansMatch[1].toLowerCase();

  const explanationMatch = cleanBlock.match(/Ans[\s.,:]+\(\s*[a-dA-D]\s*\)\s*:?\s*([\s\S]+)/i);
  const explanation = explanationMatch ? cleanText(explanationMatch[1]) : "";

  const { examType, examStage, examDate, examShift } = parseSourceLine(sourceRaw);
  const { needsVisualRevisit, revisitReason } = detectRevisitNeeded(topic, explanation);

  return {
    number,
    subject: "Reasoning",
    topic,
    subtopic,
    question,
    options: {
      a: cleanText(optionsMatch[1]),
      b: cleanText(optionsMatch[2]),
      c: cleanText(optionsMatch[3]),
      d: cleanText(optionsMatch[4]),
    },
    correctAns,
    explanation,
    sourceRaw,
    examType,
    examStage,
    examDate,
    examShift,
    isPyq: true,
    status: "PENDING",
    needsVisualRevisit,
    revisitReason,
    sourcePage,
  };
}

// -- CLI entry --------------------------------------------------------------

if (require.main === module) {
  const inputPath = process.argv[2] ?? "./RAW_OUTPUT_FROM_PDF/full_reasoning_v2.txt";
  const outputPath = process.argv[3] ?? "./PARSED_QUESTIONS/reasoning_questions.json";

  const resolvedIn = path.resolve(inputPath);
  const resolvedOut = path.resolve(outputPath);

  if (fs.existsSync(resolvedIn)) {
    const rawData = fs.readFileSync(resolvedIn, "utf-8");
    const parsedQuestions = parseFullReasoningBook(rawData);

    const flagged = parsedQuestions.filter(q => q.needsVisualRevisit);

    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, JSON.stringify(parsedQuestions, null, 2), "utf-8");

    console.log(`\nParsed ${parsedQuestions.length} questions -> ${resolvedOut}`);
    console.log(`Flagged for vision revisit: ${flagged.length} (${((flagged.length / parsedQuestions.length) * 100).toFixed(1)}%)`);

    console.log(`\n  By Subtopic Breakdown:`);
    const bySubtopic: Record<string, { total: number; flagged: number }> = {};
    for (const q of parsedQuestions) {
      const uniqueKey = `${q.topic} -> ${q.subtopic}`;
      bySubtopic[uniqueKey] ??= { total: 0, flagged: 0 };
      bySubtopic[uniqueKey].total++;
      if (q.needsVisualRevisit) bySubtopic[uniqueKey].flagged++;
    }
    Object.entries(bySubtopic).forEach(([combined, { total, flagged }]) => {
      console.log(`    ${combined.padEnd(110)} ${String(total).padStart(5)} total, ${String(flagged).padStart(4)} flagged`);
    });
  } else {
    console.error(`Error: file not found at ${resolvedIn}`);
  }
}