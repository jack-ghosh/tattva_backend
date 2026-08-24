import { eq, and, sql, notInArray } from "drizzle-orm";
import { questions } from "../lib/schema";
import { db } from "../lib/db";
import TestAttempt from "../lib/models/TestAttempt";
import { connectToMongodb } from "../lib/mongodb";

export type Subject = "Mathematics" | "Reasoning" | "General Knowledge";
export type BlueprintKey = "RRB_NTPC" | "RRB_GROUP_D" | "RRB_JE" | "RRB_ALP";
export type ExamMode = "15MIN" | "MOCK_MINI" | "MOCK_MAIN";

const STATUS = "ACTIVE";

// ---------------------------------------------------------------------------
// Blueprint table — per-subject quotas for the *main* mock, mirroring the
// official RRB CBT1 patterns. Difficulty is never a selection axis.
// ---------------------------------------------------------------------------
interface BlueprintDef {
    label: string;
    totalQuestions: number;
    durationMinutes: number;
    subjects: Record<Subject, number>;
}

export const BLUEPRINTS: Record<BlueprintKey, BlueprintDef> = {
    RRB_NTPC: {
        label: "RRB NTPC",
        totalQuestions: 100,
        durationMinutes: 90,
        subjects: { Mathematics: 30, Reasoning: 30, "General Knowledge": 40 },
    },
    RRB_GROUP_D: {
        label: "RRB Group D",
        totalQuestions: 100,
        durationMinutes: 90,
        subjects: { Mathematics: 25, Reasoning: 30, "General Knowledge": 45 },
    },
    RRB_JE: {
        label: "RRB JE",
        totalQuestions: 100,
        durationMinutes: 90,
        subjects: { Mathematics: 30, Reasoning: 25, "General Knowledge": 45 },
    },
    RRB_ALP: {
        // NOTE: RRB revised the real CBT1 pattern in 2026 (GA dropped, reweighted to
        // Math/Reasoning/GS only). This is the OLDER 4-subject split, kept because the
        // ~827 tagged ALP PYQs in the DB were sourced under that older pattern. Flag to
        // the user if it matters for launch timing — do not silently "fix" it.
        label: "RRB ALP",
        totalQuestions: 75,
        durationMinutes: 60,
        subjects: { Mathematics: 20, Reasoning: 25, "General Knowledge": 30 },
    },
};

const MOCK_MINI_TOTAL = 50;
const MOCK_MINI_DURATION = 30;

const SCORE_PER_QUESTION = 2; // matches +2/-0.67 marking scheme elsewhere in the app

// ---------------------------------------------------------------------------
// Largest-remainder apportionment: distribute `total` across `weights` (which
// need not sum to 1) so the resulting integer quotas sum exactly to `total`.
// ---------------------------------------------------------------------------
function largestRemainder(total: number, weights: Record<string, number>): Record<string, number> {
    const keys = Object.keys(weights);
    const weightSum = keys.reduce((s, k) => s + weights[k], 0);

    if (weightSum <= 0 || total <= 0) {
        return Object.fromEntries(keys.map((k) => [k, 0]));
    }

    const raw: Record<string, number> = {};
    const floor: Record<string, number> = {};
    const remainder: Record<string, number> = {};

    for (const k of keys) {
        raw[k] = (weights[k] / weightSum) * total;
        floor[k] = Math.floor(raw[k]);
        remainder[k] = raw[k] - floor[k];
    }

    const allocated = keys.reduce((s, k) => s + floor[k], 0);
    const short = total - allocated;

    // Hand out the leftover one-by-one to the largest fractional remainders.
    const order = [...keys].sort((a, b) => remainder[b] - remainder[a]);
    const result: Record<string, number> = { ...floor };
    for (let i = 0; i < short; i++) {
        const k = order[i % order.length];
        result[k] += 1;
    }

    return result;
}

// ---------------------------------------------------------------------------
// Redistribute a shortfall proportionally across the other buckets in a group.
// `capacity` is each bucket's ceiling (e.g. its available pool size). Clips
// each quota to its capacity, then hands the shortfall out to buckets with
// remaining headroom, largest headroom first, repeating until either the
// shortfall is absorbed or every bucket is saturated.
// ---------------------------------------------------------------------------
function redistributeShortfall(
    quotas: Record<string, number>,
    capacity: Record<string, number>
): { quotas: Record<string, number>; unfilled: number } {
    const result = { ...quotas };
    let pending = 0;

    for (const k of Object.keys(result)) {
        const cap = capacity[k] ?? 0;
        if (result[k] > cap) {
            pending += result[k] - cap;
            result[k] = cap;
        }
    }

    while (pending > 0) {
        const headroom = Object.keys(result)
            .map((k) => ({ k, room: (capacity[k] ?? 0) - result[k] }))
            .filter((x) => x.room > 0)
            .sort((a, b) => b.room - a.room);

        if (headroom.length === 0) break;

        const give = Math.min(pending, headroom.length);
        for (let i = 0; i < give; i++) {
            result[headroom[i].k] += 1;
        }
        pending -= give;
    }

    return { quotas: result, unfilled: pending };
}

// ---------------------------------------------------------------------------
// Topic pool counts for a subject, optionally filtered to a canonical exam type.
// ---------------------------------------------------------------------------
async function getTopicCounts(subject: Subject, examTypeCanonical: BlueprintKey | null) {
    const clauses = [eq(questions.status, STATUS), eq(questions.hasVisual, false), eq(questions.subject, subject)];
    if (examTypeCanonical) {
        clauses.push(eq(questions.examTypeCanonical, examTypeCanonical));
    }

    const rows = await db
        .select({ topic: questions.topic, count: sql<number>`count(*)::int` })
        .from(questions)
        .where(and(...clauses))
        .groupBy(questions.topic);

    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.topic] = r.count;
    return counts;
}

// ---------------------------------------------------------------------------
// Fetch `limit` random questions for a (subject, topic[, examTypeCanonical])
// bucket, excluding `excludeIds`. Returns whatever it can find, up to `limit`.
// ---------------------------------------------------------------------------
async function fetchRandomForTopic(
    subject: Subject,
    topic: string,
    examTypeCanonical: BlueprintKey | null,
    limit: number,
    excludeIds: string[]
) {
    if (limit <= 0) return [];

    const clauses = [
        eq(questions.status, STATUS),
        eq(questions.hasVisual, false),
        eq(questions.subject, subject),
        eq(questions.topic, topic),
    ];
    if (examTypeCanonical) {
        clauses.push(eq(questions.examTypeCanonical, examTypeCanonical));
    }
    if (excludeIds.length > 0) {
        clauses.push(notInArray(questions.id, excludeIds));
    }

    return db
        .select()
        .from(questions)
        .where(and(...clauses))
        .orderBy(sql`RANDOM()`)
        .limit(limit);
}

// ---------------------------------------------------------------------------
// Given a subject quota and the topic pool for that subject, compute
// per-topic quotas via largest-remainder weighting, then redistribute any
// shortfall (a topic whose available pool is smaller than its quota)
// proportionally across the other topics in the subject.
// ---------------------------------------------------------------------------
function computeTopicQuotas(subjectQuota: number, topicCounts: Record<string, number>) {
    const initial = largestRemainder(subjectQuota, topicCounts);
    const { quotas, unfilled } = redistributeShortfall(initial, topicCounts);
    return { quotas, unfilled }; // unfilled > 0 means the whole subject pool is short
}

// ---------------------------------------------------------------------------
// Pull a full subject's worth of questions: topic-weighted quotas, unseen-first
// with per-bucket repeat fallback if a topic's unseen pool can't fill its quota.
// ---------------------------------------------------------------------------
async function fillSubject(
    subject: Subject,
    subjectQuota: number,
    examTypeCanonical: BlueprintKey | null,
    seenIds: string[]
) {
    if (subjectQuota <= 0) return [] as (typeof questions.$inferSelect)[];

    // Weight topic quotas off the TOTAL pool (seen + unseen) so quotas reflect
    // the real topic distribution, not just what's currently unseen.
    const totalCounts = await getTopicCounts(subject, examTypeCanonical);
    const { quotas: topicQuotas } = computeTopicQuotas(subjectQuota, totalCounts);

    // Unseen pool per topic, for capacity-aware redistribution of the no-repeat pass.
    const unseenClauses = [
        eq(questions.status, STATUS),
        eq(questions.hasVisual, false),
        eq(questions.subject, subject),
    ];
    if (examTypeCanonical) unseenClauses.push(eq(questions.examTypeCanonical, examTypeCanonical));
    if (seenIds.length > 0) unseenClauses.push(notInArray(questions.id, seenIds));

    const unseenCountsRows = await db
        .select({ topic: questions.topic, count: sql<number>`count(*)::int` })
        .from(questions)
        .where(and(...unseenClauses))
        .groupBy(questions.topic);

    const unseenCounts: Record<string, number> = {};
    for (const r of unseenCountsRows) unseenCounts[r.topic] = r.count;
    for (const topic of Object.keys(topicQuotas)) {
        if (!(topic in unseenCounts)) unseenCounts[topic] = 0;
    }

    // Redistribute the no-repeat shortfall (unseen capacity vs topic quota)
    // across other topics first — same shape as the general topic-quota logic.
    const { quotas: unseenQuotas } = redistributeShortfall(topicQuotas, unseenCounts);

    const picked: (typeof questions.$inferSelect)[] = [];
    const pickedIds = new Set<string>();

    for (const topic of Object.keys(unseenQuotas)) {
        const need = unseenQuotas[topic];
        if (need <= 0) continue;
        const rows = await fetchRandomForTopic(subject, topic, examTypeCanonical, need, seenIds);
        for (const r of rows) {
            picked.push(r);
            pickedIds.add(r.id);
        }
    }

    // If some quota couldn't be filled unseen anywhere in the subject, allow
    // repeats for just the shortfall, per-bucket, proportionally — better a
    // repeat than a broken exam.
    let stillNeeded = subjectQuota - picked.length;
    if (stillNeeded > 0) {
        const shortfallByTopic: Record<string, number> = {};
        for (const topic of Object.keys(topicQuotas)) {
            const gotFromTopic = picked.filter((p) => p.topic === topic).length;
            const want = topicQuotas[topic];
            if (want > gotFromTopic) shortfallByTopic[topic] = want - gotFromTopic;
        }

        for (const topic of Object.keys(shortfallByTopic)) {
            if (stillNeeded <= 0) break;
            const need = Math.min(shortfallByTopic[topic], stillNeeded);
            if (need <= 0) continue;
            const excludeIds = [...pickedIds]; // avoid duplicating within this exam
            const rows = await fetchRandomForTopic(subject, topic, examTypeCanonical, need, excludeIds);
            for (const r of rows) {
                if (pickedIds.has(r.id)) continue;
                picked.push(r);
                pickedIds.add(r.id);
                stillNeeded--;
            }
        }
    }

    return picked;
}

// ---------------------------------------------------------------------------
// Fill a single topic's quota (used when the 15-min test is scoped to one
// topic instead of the whole subject): unseen-first, repeat fallback if the
// topic's unseen pool is short.
// ---------------------------------------------------------------------------
async function fillTopic(subject: Subject, topic: string, quota: number, seenIds: string[]) {
    if (quota <= 0) return [] as (typeof questions.$inferSelect)[];

    const picked = await fetchRandomForTopic(subject, topic, null, quota, seenIds);
    const pickedIds = new Set(picked.map((p) => p.id));

    const stillNeeded = quota - picked.length;
    if (stillNeeded > 0) {
        // Topic's unseen pool is short — allow repeats for just the shortfall.
        const more = await fetchRandomForTopic(subject, topic, null, stillNeeded, [...pickedIds]);
        for (const r of more) {
            if (pickedIds.has(r.id)) continue;
            picked.push(r);
            pickedIds.add(r.id);
        }
    }

    return picked;
}

// ---------------------------------------------------------------------------
// Every questionId this user has ever been served (any attempt, any status —
// correct/wrong/unattempted — served is served). No new Postgres table needed;
// this data already exists in Mongo TestAttempt history.
// ---------------------------------------------------------------------------
async function getSeenQuestionIds(userId: string): Promise<string[]> {
    await connectToMongodb();
    const attempts = await TestAttempt.find({ userId }).select("responses.questionId").lean();
    const ids = new Set<string>();
    for (const a of attempts) {
        for (const r of a.responses ?? []) {
            if (r.questionId) ids.add(r.questionId);
        }
    }
    return [...ids];
}

// ---------------------------------------------------------------------------
// Topic Test (15MIN / 25 questions) — one subject, random across ALL its
// topics (not restricted to a single topic). No blueprint / examType filter.
// ---------------------------------------------------------------------------
export async function buildTopicTest(subject: Subject, userId: string, topic?: string) {
    const TOTAL = 25;
    const DURATION = 15;
    const MAX_SCORE = TOTAL * SCORE_PER_QUESTION;

    const seenIds = await getSeenQuestionIds(userId);
    const picked = topic
        ? await fillTopic(subject, topic, TOTAL, seenIds)
        : await fillSubject(subject, TOTAL, null, seenIds);

    // Final shuffle so topics aren't grouped in blocks.
    picked.sort(() => Math.random() - 0.5);

    return {
        questions: picked,
        config: {
            examMode: "15MIN" as const,
            subject,
            topic: topic ?? null,
            totalQuestions: TOTAL,
            durationMinutes: DURATION,
            maxScore: MAX_SCORE,
        },
    };
}

// ---------------------------------------------------------------------------
// Mock Test — main (exact blueprint pattern) or mini (always 50q/30min,
// blueprint subject ratios scaled down proportionally to sum to 50 via
// largest-remainder rounding, maxScore = half the main mock's maxScore).
// ---------------------------------------------------------------------------
export async function buildMockTest(blueprintKey: BlueprintKey, mode: "MOCK_MINI" | "MOCK_MAIN", userId: string) {
    const blueprint = BLUEPRINTS[blueprintKey];

    let subjectQuotas: Record<Subject, number>;
    let totalQuestions: number;
    let durationMinutes: number;
    let maxScore: number;

    if (mode === "MOCK_MAIN") {
        subjectQuotas = blueprint.subjects;
        totalQuestions = blueprint.totalQuestions;
        durationMinutes = blueprint.durationMinutes;
        maxScore = blueprint.totalQuestions * SCORE_PER_QUESTION;
    } else {
        subjectQuotas = largestRemainder(MOCK_MINI_TOTAL, blueprint.subjects) as Record<Subject, number>;
        totalQuestions = MOCK_MINI_TOTAL;
        durationMinutes = MOCK_MINI_DURATION;
        maxScore = (blueprint.totalQuestions * SCORE_PER_QUESTION) / 2;
    }

    const seenIds = await getSeenQuestionIds(userId);

    const subjects = Object.keys(subjectQuotas) as Subject[];
    const picked: (typeof questions.$inferSelect)[] = [];
    for (const subject of subjects) {
        const rows = await fillSubject(subject, subjectQuotas[subject], blueprintKey, seenIds);
        picked.push(...rows);
    }

    // Final shuffle so subjects aren't grouped in blocks.
    picked.sort(() => Math.random() - 0.5);

    return {
        questions: picked,
        config: {
            examMode: mode,
            blueprintKey,
            blueprintLabel: blueprint.label,
            subjectQuotas,
            totalQuestions,
            durationMinutes,
            maxScore,
        },
    };
}