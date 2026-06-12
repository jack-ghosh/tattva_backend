import { eq, and, sql, inArray } from "drizzle-orm";
import { questions } from "../lib/schema";
import { db } from "../lib/db";

export type ExamType = "15MIN" | "30MIN" | "RRB";

interface ExamConfig {
    easy: number;
    medium: number;
    hard: number;
    totalQuestions: number;
    durationMinutes: number;
    maxScore: number;
}

export const EXAM_CONFIG: Record<ExamType, ExamConfig> = {
    "15MIN": {
        easy: 8,
        medium: 12,
        hard: 5,
        totalQuestions: 25,
        durationMinutes: 15,
        maxScore: 50,
    },
    "30MIN": {
        easy: 15,
        medium: 25,
        hard: 10,
        totalQuestions: 50,
        durationMinutes: 30,
        maxScore: 100,
    },
    "RRB": {
        easy: 30,
        medium: 50,
        hard: 20,
        totalQuestions: 100,
        durationMinutes: 90,
        maxScore: 200,
    },
};

export const buildExamQuestion = async (examType: ExamType) => {
    const config = EXAM_CONFIG[examType];
    const STATUS = "ACTIVE";

    // Step 1: check availability per bucket
    const counts = await db
        .select({
            difficulty: questions.difficulty,
            count: sql<number>`count(*)::int`,
        })
        .from(questions)
        .where(eq(questions.status, STATUS))
        .groupBy(questions.difficulty);

    const available: Record<string, number> = {};
    counts.forEach(r => available[r.difficulty] = r.count);

    const availableEasy   = available["EASY"]   ?? 0;
    const availableMedium = available["MEDIUM"]  ?? 0;
    const availableHard   = available["HARD"]    ?? 0;

    // Step 2: calculate how many to pull from each bucket
    // If a bucket is short, fill the gap from the next easier bucket
    let needEasy   = config.easy;
    let needMedium = config.medium;
    let needHard   = config.hard;

    const hardShortfall   = Math.max(0, needHard   - availableHard);
    const mediumShortfall = Math.max(0, needMedium - availableMedium);

    // Fill hard shortfall from medium
    needHard    = Math.min(needHard, availableHard);
    needMedium += hardShortfall;

    // Fill medium shortfall (including absorbed hard) from easy
    const totalMediumShortfall = Math.max(0, needMedium - availableMedium);
    needMedium  = Math.min(needMedium, availableMedium);
    needEasy   += totalMediumShortfall;
    needEasy    = Math.min(needEasy, availableEasy);

    console.log(`[buildExam] ${examType} — pulling easy:${needEasy} medium:${needMedium} hard:${needHard}`);

    // Step 3: fetch questions
    const fetches = await Promise.all([
        needEasy > 0
            ? db.select().from(questions)
                .where(and(eq(questions.difficulty, "EASY"), eq(questions.status, STATUS)))
                .orderBy(sql`RANDOM()`)
                .limit(needEasy)
            : Promise.resolve([]),

        needMedium > 0
            ? db.select().from(questions)
                .where(and(eq(questions.difficulty, "MEDIUM"), eq(questions.status, STATUS)))
                .orderBy(sql`RANDOM()`)
                .limit(needMedium)
            : Promise.resolve([]),

        needHard > 0
            ? db.select().from(questions)
                .where(and(eq(questions.difficulty, "HARD"), eq(questions.status, STATUS)))
                .orderBy(sql`RANDOM()`)
                .limit(needHard)
            : Promise.resolve([]),
    ]);

    const allQuestions = [...fetches[0], ...fetches[1], ...fetches[2]];

    // Shuffle so easy/medium/hard aren't grouped in order
    allQuestions.sort(() => Math.random() - 0.5);

    return {
        questions: allQuestions,
        config,
    };
};