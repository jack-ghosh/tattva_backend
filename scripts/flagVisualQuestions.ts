import { sql, or, ilike, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import { questions } from "../lib/schema";

// Detects questions that likely depend on a figure/diagram/image the user can't see
// in a text-only quiz, and flags them via question.hasVisual so buildExam can exclude them.
//
// Two signals, EITHER of which flags a question (union, not AND):
//  1. Keyword match in the QUESTION TEXT ONLY (not explanation — explanation often mentions
//     "diagram" or "figure" purely as a solving technique, which isn't evidence the question
//     itself shows an image). Patterns require a referential phrase ("following figure",
//     "figure below"), not bare "figure"/"diagram", since those substrings also appear in
//     unrelated terms like "significant figures".
//  2. Topic membership in the 7 visual-heavy topics below — bulk-suppressed entirely per
//     explicit decision, since these topics are near-unanswerable without seeing the shape/
//     figure even when a given question happens to be phrased without a keyword hit.
//
// Idempotent: on a LIVE run, resets hasVisual=false for everything first, then re-flags only
// the current matches — safe to re-run after tuning patterns, won't leave stale flags from a
// previous pass.
//
// DRY RUN by default — prints counts and sample questions, does not write to the DB.
// Run for real with (PowerShell): $env:RUN="1"; npx tsx scripts/flagVisualQuestions.ts

const DRY_RUN = process.env.RUN !== "1";

const KEYWORD_PATTERNS = [
    "%following figure%", "%given figure%", "%figure below%", "%figure above%",
    "%in the figure%", "%in the given figure%", "%shown in the figure%",
    "%following diagram%", "%given diagram%", "%diagram below%", "%diagram above%",
    "%as shown%", "%shown below%", "%shown above%", "%in the image%",
    "%pie chart%", "%bar graph%", "%bar diagram%",
    "%mirror image%", "%water image%",
];

// Bulk-suppressed entirely — every question in these topics is flagged hasVisual=true
// regardless of wording.
const VISUAL_HEAVY_TOPICS = [
    "Problems based on Diagram",
    "Water and Mirror Image",
    "Formation and Division of figure",
    "Lines and Figures Counting",
    "Cube/Cuboid/Dice",
    "Missing Number/Letter/Term/Figure",
    "Venn Diagram",
];

async function main() {
    // Keyword pass — question text only (explanation excluded, see comment above)
    const keywordMatches = await db
        .select({
            id: questions.id,
            subject: questions.subject,
            topic: questions.topic,
            question: questions.question,
        })
        .from(questions)
        .where(or(...KEYWORD_PATTERNS.map((p) => ilike(questions.question, p))));

    // Topic-membership pass — bulk suppression, independent of wording
    const topicMatches = await db
        .select({
            id: questions.id,
            subject: questions.subject,
            topic: questions.topic,
            question: questions.question,
        })
        .from(questions)
        .where(inArray(questions.topic, VISUAL_HEAVY_TOPICS));

    // Union by id (a row can match both passes — dedupe)
    const allMatches = new Map<string, { subject: string; topic: string; question: string }>();
    for (const m of [...keywordMatches, ...topicMatches]) {
        allMatches.set(m.id, { subject: m.subject, topic: m.topic, question: m.question });
    }

    console.log(`\n=== Visual/diagram question detector (${DRY_RUN ? "DRY RUN" : "LIVE"}) ===\n`);
    console.log(`Keyword-pass matches: ${keywordMatches.length}`);
    console.log(`Topic-pass matches (bulk-suppressed topics): ${topicMatches.length}`);
    console.log(`Combined (deduped): ${allMatches.size}\n`);

    const bySubject: Record<string, number> = {};
    for (const m of allMatches.values()) bySubject[m.subject] = (bySubject[m.subject] ?? 0) + 1;
    for (const [subj, count] of Object.entries(bySubject).sort((a, b) => b[1] - a[1])) {
        console.log(`   • ${subj} — ${count}`);
    }

    console.log(`\nSample of 10 combined matches:`);
    let i = 0;
    for (const m of allMatches.values()) {
        if (i++ >= 10) break;
        console.log(`   [${m.topic}] ${m.question.slice(0, 100)}${m.question.length > 100 ? "..." : ""}`);
    }
    console.log("");

    if (DRY_RUN) {
        console.log("Dry run only — no rows updated. Review the samples above, then run:");
        console.log('  $env:RUN="1"; npx tsx scripts/flagVisualQuestions.ts\n');
        process.exit(0);
    }

    // Reset first so a stale flag from a previous pass gets corrected, not just left stale.
    await db.update(questions).set({ hasVisual: false }).where(sql`has_visual = true`);
    const ids = [...allMatches.keys()];
    if (ids.length > 0) {
        await db.update(questions).set({ hasVisual: true }).where(inArray(questions.id, ids));
    }
    console.log(`Done. ${ids.length} questions flagged hasVisual=true (keyword pass + 7 bulk-suppressed topics).`);
    process.exit(0);
}

main().catch((e) => {
    console.error("[flagVisualQuestions] failed:", e);
    process.exit(1);
});