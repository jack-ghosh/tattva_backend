import fs from "fs";

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Page → { topic, subtopic } map ───────────────────────────────────────────
// Built from the TOC of the 2026 YCT RRB Mathematics PDF (1024 pages).
// On every page boundary we update currentTopic + currentSubtopic from this map.
// This is more reliable than Type markers because page boundaries are guaranteed.

const PAGE_SUBTOPIC: Record<number, { topic: string; subtopic: string }> = {
  // Number System
  9:   { topic: "Number System", subtopic: "Problems based on Divisibility and Remainder" },
  21:  { topic: "Number System", subtopic: "Problems based on specificity of digits" },
  24:  { topic: "Number System", subtopic: "Problems based on composite and prime numbers" },
  26:  { topic: "Number System", subtopic: "Problems based on basic notion of numbers" },
  38:  { topic: "Number System", subtopic: "Problems based on Rational and Irrational numbers" },
  41:  { topic: "Number System", subtopic: "Problems based on unit digit and factorization of numbers" },
  43:  { topic: "Number System", subtopic: "Problems based on place value and numerical value" },
  45:  { topic: "Number System", subtopic: "Miscellaneous" },
  // Decimal Fractions
  48:  { topic: "Decimal Fractions", subtopic: "Problems based on finding the smallest and largest fraction" },
  52:  { topic: "Decimal Fractions", subtopic: "Problems based on ascending and descending order of fraction" },
  54:  { topic: "Decimal Fractions", subtopic: "Problems based on Terminating and recurring decimal values of fraction" },
  56:  { topic: "Decimal Fractions", subtopic: "Problems based on Bar of Decimal Numbers" },
  63:  { topic: "Decimal Fractions", subtopic: "Problems based on the value of fractions" },
  68:  { topic: "Decimal Fractions", subtopic: "Problems based on addition of fraction and its reciprocal" },
  70:  { topic: "Decimal Fractions", subtopic: "Problems based on sum and difference of fraction" },
  76:  { topic: "Decimal Fractions", subtopic: "Miscellaneous" },
  // Surds and Indices
  79:  { topic: "Indices and Surds", subtopic: "Problems based on finding square, square root and surds" },
  95:  { topic: "Indices and Surds", subtopic: "Problems based on Indices" },
  102: { topic: "Indices and Surds", subtopic: "Miscellaneous" },
  // Simplification
  103: { topic: "Simplification", subtopic: "Simple Problems based on Simplification" },
  112: { topic: "Simplification", subtopic: "Problems based on the rule of BODMAS" },
  128: { topic: "Simplification", subtopic: "Problems based on Formulas" },
  132: { topic: "Simplification", subtopic: "Problems based on finding the value of a term of an expression" },
  138: { topic: "Simplification", subtopic: "Miscellaneous" },
  // LCM & HCF
  140: { topic: "Lowest Common Multiple", subtopic: "Simple problems related to LCM" },
  145: { topic: "Lowest Common Multiple", subtopic: "Remainder problems related to LCM" },
  148: { topic: "Lowest Common Multiple", subtopic: "Common problems related to HCF" },
  154: { topic: "Lowest Common Multiple", subtopic: "Remainder problems related to HCF" },
  156: { topic: "Lowest Common Multiple", subtopic: "Combined problems of LCM and HCF" },
  165: { topic: "Lowest Common Multiple", subtopic: "Problems related to square tiles / Alarm/Bell/Light etc." },
  168: { topic: "Lowest Common Multiple", subtopic: "Divisibility problems based on LCM and HCF" },
  // Percentage
  174: { topic: "Percentage", subtopic: "Problems based on Basic concept of percentage" },
  189: { topic: "Percentage", subtopic: "Problems based on Exam and Students" },
  194: { topic: "Percentage", subtopic: "Problems based on Income, Expenditure and Savings" },
  202: { topic: "Percentage", subtopic: "Problems based on Population" },
  209: { topic: "Percentage", subtopic: "Problems based on Percentage change" },
  215: { topic: "Percentage", subtopic: "Problems based on investment and business" },
  217: { topic: "Percentage", subtopic: "Problems based on percentage change in area and volume" },
  220: { topic: "Percentage", subtopic: "Problems based on voting" },
  // Profit & Loss
  224: { topic: "Profit & Loss", subtopic: "Problems based on finding the percentage of profit and loss" },
  235: { topic: "Profit & Loss", subtopic: "Problems based on finding the cost price" },
  241: { topic: "Profit & Loss", subtopic: "Problems based on finding the selling price" },
  248: { topic: "Profit & Loss", subtopic: "Problems based on finding the amount of profit and loss" },
  250: { topic: "Profit & Loss", subtopic: "Problems based on finding the ratio of values" },
  251: { topic: "Profit & Loss", subtopic: "Problems based on profit or loss of cost/sale of two articles" },
  254: { topic: "Profit & Loss", subtopic: "Problems based on goods bought and sold at a particular rate" },
  261: { topic: "Profit & Loss", subtopic: "Problems based on dishonest shopkeeper" },
  262: { topic: "Profit & Loss", subtopic: "Miscellaneous" },
  // Discount (no type breakdown in TOC)
  268: { topic: "Discount", subtopic: "" },
  // Ratio & Proportion
  295: { topic: "Ratio & Proportion", subtopic: "Problems based on ratio of two parts" },
  302: { topic: "Ratio & Proportion", subtopic: "Problems based on ratio of three parts" },
  307: { topic: "Ratio & Proportion", subtopic: "Problems based on new ratio due to increase or decrease in original ratio" },
  313: { topic: "Ratio & Proportion", subtopic: "Problems based on consecutive ratio and proportion" },
  320: { topic: "Ratio & Proportion", subtopic: "Problems based on Coins/balls etc." },
  322: { topic: "Ratio & Proportion", subtopic: "Miscellaneous" },
  // Partnership
  329: { topic: "Partnership", subtopic: "Problems based on finding capital in partnership" },
  335: { topic: "Partnership", subtopic: "Problems based on sharing of profits in partnership" },
  341: { topic: "Partnership", subtopic: "Miscellaneous" },
  // Work & Time
  343: { topic: "Work & Time", subtopic: "Problems based on the involvement of two persons in the work" },
  349: { topic: "Work & Time", subtopic: "Problems based on the involvement of three persons in the work" },
  359: { topic: "Work & Time", subtopic: "Problems based on the involvement of a group of persons in the work" },
  367: { topic: "Work & Time", subtopic: "Problems based on part of work and remaining work etc." },
  370: { topic: "Work & Time", subtopic: "Problems based on leaving and joining in the middle of the work" },
  380: { topic: "Work & Time", subtopic: "Problems based on work efficiency and wages etc." },
  386: { topic: "Work & Time", subtopic: "Miscellaneous" },
  // Alligation
  390: { topic: "Alligation", subtopic: "Problems based on the value and quantity of substances in a mixture" },
  396: { topic: "Alligation", subtopic: "Problems based on finding ratio of substances in a mixture" },
  401: { topic: "Alligation", subtopic: "Miscellaneous" },
  // Pipe & Cistern
  405: { topic: "Pipe & Cistern", subtopic: "General Problems based on Pipe and Cistern" },
  408: { topic: "Pipe & Cistern", subtopic: "When one Pipe fills and the other Pipe empties" },
  413: { topic: "Pipe & Cistern", subtopic: "When more than two Pipes work together" },
  422: { topic: "Pipe & Cistern", subtopic: "When a Pipe is turned on or off in the middle" },
  431: { topic: "Pipe & Cistern", subtopic: "When the Pipe is opened alternately" },
  434: { topic: "Pipe & Cistern", subtopic: "Problems based on capacity" },
  435: { topic: "Pipe & Cistern", subtopic: "Miscellaneous" },
  // Simple Interest
  439: { topic: "Simple Interest", subtopic: "Problems based on finding simple interest" },
  449: { topic: "Simple Interest", subtopic: "Problems based on finding the Principal" },
  461: { topic: "Simple Interest", subtopic: "Problems based on finding the amount" },
  465: { topic: "Simple Interest", subtopic: "Problems based on finding the rate" },
  475: { topic: "Simple Interest", subtopic: "Problems based on finding the time" },
  481: { topic: "Simple Interest", subtopic: "Miscellaneous" },
  // Compound Interest
  484: { topic: "Compound Interest", subtopic: "Problems based on finding the Principle" },
  490: { topic: "Compound Interest", subtopic: "Problems based on finding the Amount" },
  495: { topic: "Compound Interest", subtopic: "Problems based on finding the Compound Interest" },
  506: { topic: "Compound Interest", subtopic: "Problems based on Simple and Compound Interest" },
  514: { topic: "Compound Interest", subtopic: "Problems based on the difference between simple and compound interest" },
  519: { topic: "Compound Interest", subtopic: "Problems based on finding the rate" },
  523: { topic: "Compound Interest", subtopic: "Problems based on finding the time" },
  530: { topic: "Compound Interest", subtopic: "Miscellaneous" },
  // Problems Based on Age
  533: { topic: "Problems Based on Age", subtopic: "Problems based on finding the present age of a person" },
  549: { topic: "Problems Based on Age", subtopic: "Problems based on finding the age of two persons" },
  553: { topic: "Problems Based on Age", subtopic: "Problems based on finding the sum and difference of ages" },
  559: { topic: "Problems Based on Age", subtopic: "Problems based on ratio of ages" },
  563: { topic: "Problems Based on Age", subtopic: "Problems based on finding the age at a particular time" },
  565: { topic: "Problems Based on Age", subtopic: "Miscellaneous" },
  // Average
  569: { topic: "Average", subtopic: "Simple Problems based on Average" },
  577: { topic: "Average", subtopic: "Problems based on Average of Consecutive Numbers" },
  581: { topic: "Average", subtopic: "Problems based on Examination and Students" },
  586: { topic: "Average", subtopic: "Problems based on Average age/Weight/Height etc." },
  591: { topic: "Average", subtopic: "Problems based on Runs Scored in Matches" },
  592: { topic: "Average", subtopic: "Miscellaneous" },
  // Speed, Time & Distance
  600: { topic: "Speed", subtopic: "Problems based on finding speed" },
  608: { topic: "Speed", subtopic: "Problems based on finding time" },
  616: { topic: "Speed", subtopic: "Problems based on finding distance" },
  626: { topic: "Speed", subtopic: "Problems based on Average speed" },
  638: { topic: "Speed", subtopic: "Problems based on ratio of speed/time/distance" },
  // Train
  639: { topic: "Train", subtopic: "Simple problems related to train" },
  641: { topic: "Train", subtopic: "When the train crosses a person or a pole" },
  643: { topic: "Train", subtopic: "When the train crosses another moving person" },
  646: { topic: "Train", subtopic: "When the train crosses a platform or bridge" },
  652: { topic: "Train", subtopic: "When the train crosses a platform and a person or a pole etc." },
  653: { topic: "Train", subtopic: "Problems based on two trains having same direction" },
  657: { topic: "Train", subtopic: "When two trains start in opposite directions from two places" },
  664: { topic: "Train", subtopic: "Problems based on average speed of trains" },
  666: { topic: "Train", subtopic: "Miscellaneous" },
  // Boat & Stream
  670: { topic: "Boat & Stream", subtopic: "Problems based on finding the speed of stream" },
  675: { topic: "Boat & Stream", subtopic: "Problems based on finding the speed of boat/person etc." },
  678: { topic: "Boat & Stream", subtopic: "Problems based on finding the average speed" },
  679: { topic: "Boat & Stream", subtopic: "Problems based on finding the ratio of the speeds / distance and time" },
  // Mensuration
  683: { topic: "Mensuration", subtopic: "Problems based on Triangles" },
  693: { topic: "Mensuration", subtopic: "Problems based on Quadrilateral" },
  697: { topic: "Mensuration", subtopic: "Problems based on Circle" },
  702: { topic: "Mensuration", subtopic: "Problems based on Square" },
  708: { topic: "Mensuration", subtopic: "Problems based on Rectangle" },
  718: { topic: "Mensuration", subtopic: "Problems based on Cube" },
  721: { topic: "Mensuration", subtopic: "Problems based on Cuboid" },
  728: { topic: "Mensuration", subtopic: "Problems based on Cylinder" },
  738: { topic: "Mensuration", subtopic: "Problems based on Cone" },
  745: { topic: "Mensuration", subtopic: "Problems based on Sphere/Hemisphere" },
  757: { topic: "Mensuration", subtopic: "Problems based on Prism/Pyramid / Miscellaneous" },
  // Algebra
  768: { topic: "Algebra", subtopic: "Problems based on Linear Equations" },
  771: { topic: "Algebra", subtopic: "Problems based on Algebraic expressions and formulas" },
  786: { topic: "Algebra", subtopic: "Problems based on Divisibility of Polynomials" },
  788: { topic: "Algebra", subtopic: "Problems based on Factors of Polynomials" },
  790: { topic: "Algebra", subtopic: "Problems based on Quadratic Equation and its Discriminant" },
  800: { topic: "Algebra", subtopic: "Problems based on Arithmetic and Geometric Progression" },
  805: { topic: "Algebra", subtopic: "Problems based on LCM and HCF of Algebraic Expressions" },
  806: { topic: "Algebra", subtopic: "Problems based on Sets" },
  809: { topic: "Algebra", subtopic: "Miscellaneous" },
  // Trigonometry
  810: { topic: "Trigonometry", subtopic: "Problems based on Trigonometric Functions and Identities" },
  831: { topic: "Trigonometry", subtopic: "Problems based on Angular value of Trigonometric Functions" },
  838: { topic: "Trigonometry", subtopic: "Problems based on Height and Distance" },
  849: { topic: "Trigonometry", subtopic: "Miscellaneous" },
  // Co-ordinate Geometry
  851: { topic: "Co-ordinate Geometry", subtopic: "Problems based on finding the coordinate point" },
  855: { topic: "Co-ordinate Geometry", subtopic: "Problems based on part made up of Dots" },
  857: { topic: "Co-ordinate Geometry", subtopic: "Problems based on finding the Equation" },
  859: { topic: "Co-ordinate Geometry", subtopic: "Miscellaneous" },
  // Geometry
  862: { topic: "Geometry", subtopic: "Problems based on Lines and angles" },
  873: { topic: "Geometry", subtopic: "Problems based on Triangles" },
  886: { topic: "Geometry", subtopic: "Problems based on Quadrilateral" },
  890: { topic: "Geometry", subtopic: "Problems based on Rhombus" },
  893: { topic: "Geometry", subtopic: "Problems based on Parallelogram" },
  895: { topic: "Geometry", subtopic: "Problems based on Trapezium" },
  898: { topic: "Geometry", subtopic: "Problems based on Circle" },
  906: { topic: "Geometry", subtopic: "Problems based on tangent to circle" },
  912: { topic: "Geometry", subtopic: "Problems based on Polygons" },
  920: { topic: "Geometry", subtopic: "Miscellaneous" },
  // Elementary Statistics
  923: { topic: "Elementary Statistics", subtopic: "Problems based on Mean of Data" },
  932: { topic: "Elementary Statistics", subtopic: "Problems based on Median of Data" },
  942: { topic: "Elementary Statistics", subtopic: "Problems based on Mode of Data" },
  945: { topic: "Elementary Statistics", subtopic: "Problems based on Variance and Standard Deviation" },
  948: { topic: "Elementary Statistics", subtopic: "Problems based on Range" },
  949: { topic: "Elementary Statistics", subtopic: "Problems based on Probability/Sets" },
  953: { topic: "Elementary Statistics", subtopic: "Miscellaneous" },
  // Data Interpretation
  962: { topic: "Data Interpretation", subtopic: "Problems based on Pie-Chart" },
  971: { topic: "Data Interpretation", subtopic: "Problems based on Table" },
  984: { topic: "Data Interpretation", subtopic: "Problems based on Bar Graph" },
  997: { topic: "Data Interpretation", subtopic: "Problems based on Line Graph" },
  // Miscellaneous
  1004: { topic: "Miscellaneous", subtopic: "" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSourceLine(source: string): {
  examType: string;
  examStage: string;
  examDate: string;
  examShift: string;
} {
  const examTypeMatch = source.match(
    /^(RRB\s+[\w\s-]+?)(?:\s*\(Stage|\s+\d{2}[./\-]\d{2}|\s+Stage|\s*[-\u2013]\s*\d|\s*[:(])/i
  );
  const rawExamType = examTypeMatch
    ? examTypeMatch[1].trim()
    : source.split(/\d/)[0].trim();

  const examType = rawExamType
    .replace(/GROUP\s*-\s*D/gi, "Group-D")
    .replace(/Group\s+'D'/gi, "Group-D")
    .replace(/RPF\s*-?\s*SI\b/gi, "RPF SI")
    .replace(/RPF\s*-?\s*Constable\b/gi, "RPF Constable")
    .replace(/ALP\s*&\s*Tec\.\s*/gi, "ALP")
    .replace(/ALP\s*CBT-\d/gi, "ALP")
    .replace(/[-\u2013\s(]+$/, "") // strip trailing hyphens, spaces, open-paren
    .trim();

  const stageMatch = source.match(/Stage[-\s]*(I{1,3}|1st|2nd|3rd)/i);
  const examStage = stageMatch ? stageMatch[0].trim() : "";

  const dateMatch = source.match(/\d{2}[./]\d{2}[./]\d{4}/);
  const examDate = dateMatch ? dateMatch[0] : "";

  const shiftMatch = source.match(/Shift[-\s]*(I{1,3}|\d)/i);
  const examShift = shiftMatch ? shiftMatch[0].trim() : "";

  return { examType, examStage, examDate, examShift };
}

// ── Main parser ───────────────────────────────────────────────────────────────

function parseRawText(raw: string): { questions: ParsedQuestion[]; failed: number } {
  // Strip everything before actual questions start (pie chart page = page 8)
  const contentStart = raw.indexOf("-- 8 of 1024 --");
  const content = contentStart !== -1 ? raw.slice(contentStart) : raw;

  const lines = content.split("\n");

  let currentTopic = "";
  let currentSubtopic = "";

  const questions: ParsedQuestion[] = [];
  let failed = 0;

  let blockLines: string[] = [];
  let blockTopic = "";
  let blockSubtopic = "";

  function flushBlock() {
    if (blockLines.length === 0) return;
    const block = blockLines.join("\n").trim();
    const parsed = parseBlock(block, blockTopic, blockSubtopic);
    if (parsed) {
      questions.push(parsed);
    } else {
      failed++;
      // Uncomment to debug failures:
      // console.error("FAILED BLOCK:\n", block.slice(0, 200), "\n---");
    }
    blockLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // ── Page boundary: update topic/subtopic from PAGE_SUBTOPIC map ──────────
const pageMarkerMatch = trimmed.match(/^-- (\d+) of \d+ --$/);
if (pageMarkerMatch) {
  const pageNum = parseInt(pageMarkerMatch[1]);
  if (PAGE_SUBTOPIC[pageNum]) {
    currentTopic = PAGE_SUBTOPIC[pageNum].topic;
    currentSubtopic = PAGE_SUBTOPIC[pageNum].subtopic;
  }
  continue;
}

    // ── Page header e.g. "Number System  YCT  10" — skip, topic already set ──
    if (/^.+\s+YCT\s+\d+$/.test(trimmed)) continue;

    // ── Section opener e.g. "Number System" on its own line — reinforce topic ─
    if (
      /^(Number System|Decimal Fractions|Indices and Surds|Simplification|Lowest Common Multiple|Percentage|Profit & Loss|Discount|Ratio & Proportion|Partnership|Work & Time|Alligation|Pipe & Cistern|Simple Interest|Compound Interest|Problems Based on Age|Average|Speed|Train|Boat & Stream|Mensuration|Algebra|Trigonometry|Co-ordinate Geometry|Geometry|Elementary Statistics|Data Interpretation|Miscellaneous)$/.test(
        trimmed
      )
    ) {
      currentTopic = trimmed;
      continue;
    }

    // ── Type marker e.g. "Type - 1 Problems based on Divisibility" ───────────
    // Inline description overrides PAGE_SUBTOPIC for finer granularity
const typeMatch = trimmed.match(/^Type\s*-\s*\d+(?:\s+(.+))?$/);
if (typeMatch) {
  const inlineDesc = typeMatch[1]?.trim();
  // Only override if inline desc is meaningfully longer than current
  if (inlineDesc && inlineDesc.length > (currentSubtopic?.length ?? 0)) {
    currentSubtopic = inlineDesc;
  }
  continue;
}

    // ── New question start e.g. "1. Which of the following..." ───────────────
    const questionStartMatch = trimmed.match(/^(\d{1,3})\.\s+\S/);
    if (questionStartMatch) {
      flushBlock();
      blockTopic = currentTopic;
      blockSubtopic = currentSubtopic;
      blockLines = [trimmed];
      continue;
    }

    // ── Accumulate into current block ─────────────────────────────────────────
    if (blockLines.length > 0) {
      blockLines.push(line);
    }
  }

  flushBlock();

  return { questions, failed };
}

function parseBlock(
  block: string,
  topic: string,
  subtopic: string
): ParsedQuestion | null {
  // Question number + text
  const numberMatch = block.match(/^(\d{1,3})\.\s+([\s\S]+?)(?=\n\s*\(a\)|\(a\))/i);
  if (!numberMatch) return null;

  const number = parseInt(numberMatch[1]);
  const question = numberMatch[2].replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  // Options — terminates at RRB source line or Ans.
  const optionsMatch = block.match(
    /\(a\)\s*([\s\S]+?)\s*\(b\)\s*([\s\S]+?)\s*\(c\)\s*([\s\S]+?)\s*\(d\)\s*([\s\S]+?)(?=\nRRB|\nAns[\s.:]|RRB\s+[A-Z])/i
  );
  if (!optionsMatch) return null;

  const cleanOpt = (s: string) => s.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  // RRB source line — first occurrence
  const sourceMatch = block.match(/(RRB[^\n]+(?:Shift[\s:]+(?:I{1,3}|\d)|Stage[^\n]+)?)/i);
  const sourceRaw = sourceMatch ? sourceMatch[1].trim() : "";

  // Answer
const ansMatch = block.match(/Ans[\s.:]+\(\s*([a-dA-D])\s*\)/i);
  if (!ansMatch) return null;
  const correctAns = ansMatch[1].toLowerCase();

  // Explanation
const explanationMatch = block.match(/Ans[\s.:]+\(\s*[a-dA-D]\s*\)\s*:?\s*([\s\S]+)/i);
  const explanation = explanationMatch
    ? explanationMatch[1].replace(/\n/g, " ").replace(/\s+/g, " ").trim()
    : "";

  const { examType, examStage, examDate, examShift } = parseSourceLine(sourceRaw);

  return {
    number,
    subject: "Mathematics",
    topic: topic || "Unknown",
    subtopic: subtopic || "",
    question,
    options: {
      a: cleanOpt(optionsMatch[1]),
      b: cleanOpt(optionsMatch[2]),
      c: cleanOpt(optionsMatch[3]),
      d: cleanOpt(optionsMatch[4]),
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

// ── Run ───────────────────────────────────────────────────────────────────────

const inputPath = process.argv[2] ?? "raw_output.txt";
const outputPath = process.argv[3] ?? "questions.json";

const raw = fs.readFileSync(inputPath, "utf-8");
const { questions, failed } = parseRawText(raw);

fs.writeFileSync(outputPath, JSON.stringify(questions, null, 2), "utf-8");

console.log(`\n✅ Parsed:  ${questions.length}`);
console.log(`❌ Failed:  ${failed}`);
console.log(`📄 Output:  ${outputPath}`);

// Sanity check — print first 3
console.log("\n── First 3 questions ──────────────────────────────");
questions.slice(0, 3).forEach((q) => {
  console.log(`\n[${q.number}] ${q.topic} > ${q.subtopic}`);
  console.log(`Q: ${q.question.slice(0, 80)}...`);
  console.log(`Ans: (${q.correctAns}) | Source: ${q.sourceRaw}`);
  console.log(`examType: ${q.examType} | date: ${q.examDate} | shift: ${q.examShift}`);
});