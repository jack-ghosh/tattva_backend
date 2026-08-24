import { sql, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { questions } from "../lib/schema";

// Cleans up question.examType (47 messy raw values from PDF/OCR extraction) into
// question.examTypeCanonical, one of: RRB_NTPC | RRB_GROUP_D | RRB_ALP | RRB_JE | null.
// Everything that doesn't confidently match one of the 4 supported blueprints stays null —
// those questions remain usable in the general/topic pool, just not in a named mock blueprint.
//
// DRY RUN by default — prints the mapping and exits without touching the DB.
// Run for real with:
//   RUN=1 npx tsx scripts/normalizeExamTypes.ts

const DRY_RUN = process.env.RUN !== "1";

type Canonical = "RRB_NTPC" | "RRB_GROUP_D" | "RRB_ALP" | "RRB_JE" | null;

// Ordered rules — first match wins. Match against the raw examType, case-insensitive,
// after stripping OCR junk characters (—, -, _, ., *, extra spaces) for comparison.
const RULES: { test: (cleaned: string) => boolean; canonical: Canonical }[] = [
    // NTPC
    { test: (s) => /\bntpc\b/i.test(s) || /\bntfpc\b/i.test(s), canonical: "RRB_NTPC" },

    // Group D — covers "Group-D", "Group D", "Group 'D'", and the garbled trailing-dash variants
    { test: (s) => /group[\s-]*['\u2018\u2019]?\s*d\b/i.test(s), canonical: "RRB_GROUP_D" },

    // ALP — covers "RRB ALP", "RRB ALP & Tee.", "RRB ALP CBT"
    { test: (s) => /\balp\b/i.test(s), canonical: "RRB_ALP" },

    // JE — covers "RRB JE", "RRB J.E.", "RRB-JE", "RRB JE CBT-II"
    // Deliberately NOT matching "RPF JE" — RPF is a different cadre, not the RRB JE exam.
    { test: (s) => /^rrb[\s.-]*j\.?e\.?\b/i.test(s), canonical: "RRB_JE" },
];

// Everything else (RPF SI, RPF Constable, RRB RPF SI/Constable, Technicians Grade-*,
// Paramedical, Constable, Minis. & Iso. Category (...), garbled single-question entries,
// untagged) intentionally maps to null — "other exams don't matter" per spec.
function classify(raw: string | null): Canonical {
    if (!raw) return null;
    const cleaned = raw.trim();
    for (const rule of RULES) {
        if (rule.test(cleaned)) return rule.canonical;
    }
    return null;
}

async function main() {
    const rows = await db
        .select({
            examType: questions.examType,
            count: sql<number>`count(*)::int`,
        })
        .from(questions)
        .groupBy(questions.examType);

    const buckets: Record<string, { total: number; raw: { examType: string | null; count: number }[] }> = {
        RRB_NTPC: { total: 0, raw: [] },
        RRB_GROUP_D: { total: 0, raw: [] },
        RRB_ALP: { total: 0, raw: [] },
        RRB_JE: { total: 0, raw: [] },
        "(unmapped — stays null)": { total: 0, raw: [] },
    };

    for (const r of rows) {
        const canonical = classify(r.examType);
        const key = canonical ?? "(unmapped — stays null)";
        buckets[key].total += r.count;
        buckets[key].raw.push({ examType: r.examType, count: r.count });
    }

    console.log(`\n=== Exam type normalization (${DRY_RUN ? "DRY RUN — no changes made" : "LIVE — writing to DB"}) ===\n`);
    for (const [key, b] of Object.entries(buckets)) {
        console.log(`── ${key} — ${b.total} questions from ${b.raw.length} raw value(s)`);
        for (const r of b.raw.sort((a, b2) => b2.count - a.count)) {
            console.log(`   • "${r.examType}" — ${r.count}`);
        }
        console.log("");
    }

    if (DRY_RUN) {
        console.log("Dry run only. Review the mapping above, then run:");
        console.log("  RUN=1 npx tsx scripts/normalizeExamTypes.ts\n");
        process.exit(0);
    }

    // Live: one UPDATE per distinct raw examType value (small number of statements, exact match).
    let updated = 0;
    for (const r of rows) {
        const canonical = classify(r.examType);
        if (!canonical) continue; // leave null rows untouched
        const where = r.examType === null ? sql`exam_type IS NULL` : eq(questions.examType, r.examType);
        const result = await db
            .update(questions)
            .set({ examTypeCanonical: canonical })
            .where(where);
        updated += r.count;
        console.log(`Updated "${r.examType}" -> ${canonical} (${r.count} rows)`);
    }

    console.log(`\nDone. ${updated} rows tagged with a canonical exam type.`);
    process.exit(0);
}

main().catch((e) => {
    console.error("[normalizeExamTypes] failed:", e);
    process.exit(1);
});