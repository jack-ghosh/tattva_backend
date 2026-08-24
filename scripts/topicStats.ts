import { sql, eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { questions } from "../lib/schema";

// Reports the USABLE question pool — status=ACTIVE and hasVisual=false by default —
// broken down by subject/topic/subtopic, difficulty, and (new) the cleaned
// examTypeCanonical buckets (RRB_NTPC / RRB_GROUP_D / RRB_ALP / RRB_JE). This mirrors
// exactly what buildExam.ts will query once blueprints are wired up.
//
// Run with:
//   npx tsx scripts/topicStats.ts
// Options (env vars):
//   STATUS=ALL          include non-ACTIVE rows too
//   INCLUDE_VISUAL=1    include hasVisual=true rows too (to compare before/after suppression)

const STATUS_FILTER = process.env.STATUS === "ALL" ? undefined : "ACTIVE";
const INCLUDE_VISUAL = process.env.INCLUDE_VISUAL === "1";

function buildWhere() {
    const clauses = [];
    if (STATUS_FILTER) clauses.push(eq(questions.status, STATUS_FILTER));
    if (!INCLUDE_VISUAL) clauses.push(eq(questions.hasVisual, false));
    if (clauses.length === 0) return undefined;
    if (clauses.length === 1) return clauses[0];
    return and(...clauses);
}

async function main() {
    const where = buildWhere();

    // 1) subject -> topic -> subtopic counts
    const rows = await db
        .select({
            subject: questions.subject,
            topic: questions.topic,
            subtopic: questions.subtopic,
            count: sql<number>`count(*)::int`,
        })
        .from(questions)
        .where(where)
        .groupBy(questions.subject, questions.topic, questions.subtopic);

    // 2) subject -> difficulty counts (kept separate since it's metadata, not a build axis)
    const diffRows = await db
        .select({
            subject: questions.subject,
            difficulty: questions.difficulty,
            count: sql<number>`count(*)::int`,
        })
        .from(questions)
        .where(where)
        .groupBy(questions.subject, questions.difficulty);

    // 3) examTypeCanonical -> subject counts — THE number that matters for blueprints now
    const canonicalRows = await db
        .select({
            examTypeCanonical: questions.examTypeCanonical,
            subject: questions.subject,
            count: sql<number>`count(*)::int`,
        })
        .from(questions)
        .where(where)
        .groupBy(questions.examTypeCanonical, questions.subject);

    // ---- shape into nested structure ----
    type SubtopicCount = { subtopic: string | null; count: number };
    type TopicNode = { topic: string; total: number; subtopics: SubtopicCount[] };
    type SubjectNode = {
        subject: string;
        total: number;
        topics: Map<string, TopicNode>;
        difficulty: Record<string, number>;
    };

    const subjects = new Map<string, SubjectNode>();

    for (const r of rows) {
        if (!subjects.has(r.subject)) {
            subjects.set(r.subject, { subject: r.subject, total: 0, topics: new Map(), difficulty: {} });
        }
        const s = subjects.get(r.subject)!;
        s.total += r.count;

        if (!s.topics.has(r.topic)) {
            s.topics.set(r.topic, { topic: r.topic, total: 0, subtopics: [] });
        }
        const t = s.topics.get(r.topic)!;
        t.total += r.count;
        t.subtopics.push({ subtopic: r.subtopic, count: r.count });
    }

    for (const d of diffRows) {
        if (!subjects.has(d.subject)) {
            subjects.set(d.subject, { subject: d.subject, total: 0, topics: new Map(), difficulty: {} });
        }
        subjects.get(d.subject)!.difficulty[d.difficulty] = d.count;
    }

    // ---- shape canonical exam-type report ----
    type CanonicalNode = { key: string; total: number; subjects: Record<string, number> };
    const canonicalBuckets = new Map<string, CanonicalNode>();

    for (const r of canonicalRows) {
        const key = r.examTypeCanonical ?? "(unmapped)";
        if (!canonicalBuckets.has(key)) {
            canonicalBuckets.set(key, { key, total: 0, subjects: {} });
        }
        const b = canonicalBuckets.get(key)!;
        b.total += r.count;
        b.subjects[r.subject] = (b.subjects[r.subject] ?? 0) + r.count;
    }

    // ---- print report ----
    const grandTotal = [...subjects.values()].reduce((sum, s) => sum + s.total, 0);
    const filterDesc = `status=${STATUS_FILTER ?? "ALL"}, hasVisual=${INCLUDE_VISUAL ? "ALL" : "false only"}`;
    console.log(`\n=== Question bank report (${filterDesc}) ===`);
    console.log(`Grand total: ${grandTotal} questions across ${subjects.size} subject(s)\n`);

    for (const s of [...subjects.values()].sort((a, b) => b.total - a.total)) {
        console.log(`── ${s.subject} — ${s.total} questions, ${s.topics.size} topics`);
        const diffStr = Object.entries(s.difficulty)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `${k}:${v}`)
            .join(", ");
        console.log(`   difficulty split: ${diffStr || "n/a"}`);

        const sortedTopics = [...s.topics.values()].sort((a, b) => b.total - a.total);
        for (const t of sortedTopics) {
            const pct = ((t.total / s.total) * 100).toFixed(1);
            console.log(`   • ${t.topic} — ${t.total} (${pct}%), ${t.subtopics.length} subtopic rows`);
        }
        console.log("");
    }

    // ---- print canonical exam-type report (the blueprint-relevant one) ----
    console.log(`=== Canonical exam types (usable pool, matches buildExam blueprint inputs) ===\n`);
    const order = ["RRB_NTPC", "RRB_GROUP_D", "RRB_ALP", "RRB_JE", "(unmapped)"];
    for (const key of order) {
        const b = canonicalBuckets.get(key);
        if (!b) {
            console.log(`── ${key} — 0 questions\n`);
            continue;
        }
        console.log(`── ${key} — ${b.total} questions total`);
        const bySubject = Object.entries(b.subjects).sort((a, b2) => b2[1] - a[1]);
        for (const [subj, count] of bySubject) {
            const pct = ((count / b.total) * 100).toFixed(1);
            console.log(`   • ${subj} — ${count} (${pct}%)`);
        }
        console.log("");
    }

    // ---- machine-readable summary ----
    const summary = [...subjects.values()].map((s) => ({
        subject: s.subject,
        total: s.total,
        topics: [...s.topics.values()]
            .sort((a, b) => b.total - a.total)
            .map((t) => ({ topic: t.topic, count: t.total })),
    }));
    const canonicalSummary = order
        .map((key) => canonicalBuckets.get(key))
        .filter((b): b is CanonicalNode => !!b)
        .map((b) => ({ key: b.key, total: b.total, subjects: b.subjects }));

    console.log("=== JSON summary ===");
    console.log(JSON.stringify({ subjects: summary, canonicalExamTypes: canonicalSummary }, null, 2));

    process.exit(0);
}

main().catch((e) => {
    console.error("[topicStats] failed:", e);
    process.exit(1);
});