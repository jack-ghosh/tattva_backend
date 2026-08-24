import fs from "fs";
import path from "path";

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
}

interface TocEntry {
  topic: string;
  subtopic: string;
  startPage: number;
}

function cleanCleanText(text: string): string {
  return text.replace(/\\/gi, "").replace(/\s+/g, " ").trim();
}

function parseSourceLine(source: string): {
  examType: string;
  examStage: string;
  examDate: string;
  examShift: string;
} {
  const cleanSource = cleanCleanText(source);
  
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

  // FIX: Absolute position-independent structural date identification matching engine
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

export function parseFullGkBook(rawText: string): ParsedQuestion[] {
  const lines = rawText.split("\n");
  const questions: ParsedQuestion[] = [];
  
  const tocMap: TocEntry[] = [];
  let trackingToc = false;

  let currentPage = 1;
  let currentTopic = "History";
  let currentSubtopic = "Ancient History > Stone age";
  let currentPeriodPrefix = "Ancient History";

  let blockLines: string[] = [];
  let blockTopic = currentTopic;
  let blockSubtopic = currentSubtopic;

  function flushBlock() {
    if (blockLines.length === 0) return;
    const block = blockLines.join("\n").trim();
    const parsed = parseGkBlock(block, "General Knowledge", blockTopic, blockSubtopic);
    if (parsed) questions.push(parsed);
    blockLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // 1. Page Boundary Sync Hook
    const pageMarkerMatch = trimmed.match(/^-- (\d+) of \d+ --$/);
    if (pageMarkerMatch) {
      currentPage = parseInt(pageMarkerMatch[1]);
      if (currentPage === 9) {
        trackingToc = false;
      }
      
      // FIX: Core Category syncing moved directly inside the page boundary context loop step
      if (tocMap.length > 0) {
        const matchedCategory = [...tocMap].reverse().find(entry => currentPage >= entry.startPage);
        if (matchedCategory) {
          currentTopic = matchedCategory.topic;
          currentSubtopic = matchedCategory.subtopic;
        }
      }
      continue;
    }

    // 2. Table of Contents Processing Pass
    if (trimmed.startsWith("Table of Contents")) {
      trackingToc = true;
      continue;
    }

    if (trackingToc) {
      const sectionMatch = trimmed.match(/^■\s+([\s\S]+?)\s*\.+/i);
      if (sectionMatch) {
        currentPeriodPrefix = sectionMatch[1].trim();
        continue;
      }

      const subtopicMatch = trimmed.match(/^◘\s+([\s\S]+?)\s*\.+\s*(\d+)/i);
      if (subtopicMatch) {
        tocMap.push({
          topic: currentPeriodPrefix.includes("Polity") ? "Indian Polity" : 
                 currentPeriodPrefix.includes("Geography") ? "Geography" :
                 currentPeriodPrefix.includes("Economics") ? "Economics" :
                 currentPeriodPrefix.includes("Traditional") ? "Traditional GK" : "History",
          subtopic: `${currentPeriodPrefix} > ${subtopicMatch[1].trim()}`,
          startPage: parseInt(subtopicMatch[2])
        });
        continue;
      }
    }

    // 3. Question Block Isolation Entry Point
    const questionStartMatch = trimmed.match(/^(\d{1,4})\.\s+\S/);
    if (questionStartMatch) {
      flushBlock();
      blockTopic = currentTopic;
      blockSubtopic = currentSubtopic;
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

function parseGkBlock(block: string, subject: string, topic: string, subtopic: string): ParsedQuestion | null {
  const cleanBlock = block.split("\n").map(l => l.trim()).join("\n");
  
  const numberMatch = cleanBlock.match(/^(\d{1,4})\.\s+([\s\S]+?)(?=\n\s*\(a\)|\(a\))/i);
  if (!numberMatch) return null;

  const number = parseInt(numberMatch[1]);
  const question = cleanCleanText(numberMatch[2]);

  const optionsMatch = cleanBlock.match(
    /\(a\)\s*([\s\S]+?)\s*\(b\)\s*([\s\S]+?)\s*\(c\)\s*([\s\S]+?)\s*\(d\)\s*([\s\S]+?)(?=\n(?:RRB|RRC|RPF|Ans))/i
  );
  if (!optionsMatch) return null;

  const sourceMatch = cleanBlock.match(/\n(RRB|RRC|RPF)[^\n]+/i);
  const sourceRaw = sourceMatch ? cleanCleanText(sourceMatch[0]) : "";

  const ansMatch = cleanBlock.match(/Ans[\s.:]*\(\s*([a-dA-D])\s*\)/i);
  if (!ansMatch) return null;
  const correctAns = ansMatch[1].toLowerCase();

  const explanationMatch = cleanBlock.match(/Ans[\s.:]+\(\s*[a-dA-D]\s*\)\s*:?\s*([\s\S]+)/i);
  let explanation = explanationMatch ? cleanCleanText(explanationMatch[1]) : "";
  
  explanation = explanation
    .replace(/settlementsbuildings/gi, "settlements buildings")
    .replace(/organpart/gi, "organ part")
    .replace(/foru Upveda/gi, "four Upvedas")
    .replace(/enlightenmenteducation/gi, "enlightenment education");

  const { examType, examStage, examDate, examShift } = parseSourceLine(sourceRaw);

  return {
    number,
    subject,
    topic,
    subtopic,
    question,
    options: {
      a: cleanCleanText(optionsMatch[1]),
      b: cleanCleanText(optionsMatch[2]),
      c: cleanCleanText(optionsMatch[3]),
      d: cleanCleanText(optionsMatch[4]),
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
  };
}

if (require.main === module) {
  const inputPath = process.argv[2] ?? "./RAW_OUTPUT_FROM_PDF/full_yct_rrb_gk.txt";
  const outputPath = process.argv[3] ?? "./PARSED_QUESTIONS/gk_questions.json";

  const resolvedIn = path.resolve(inputPath);
  const resolvedOut = path.resolve(outputPath);

  if (fs.existsSync(resolvedIn)) {
    const rawData = fs.readFileSync(resolvedIn, "utf-8");
    const parsedQuestions = parseFullGkBook(rawData);
    
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, JSON.stringify(parsedQuestions, null, 2), "utf-8");
    console.log(`\n🎉 Audit Clean Success: Processed ${parsedQuestions.length} Records down to production targets: ${resolvedOut}`);
  } else {
    console.error(`Error file target missing at: ${resolvedIn}`);
  }
}