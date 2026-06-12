import { eq, and, sql } from "drizzle-orm";
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
        maxScore: 50,       // 25 * 2
    },
    "30MIN": {
        easy: 15,
        medium: 25,
        hard: 10,
        totalQuestions: 50,
        durationMinutes: 30,
        maxScore: 100,      // 50 * 2
    },
    "RRB": {
        easy: 30,
        medium: 50,
        hard: 20,
        totalQuestions: 100,
        durationMinutes: 90,
        maxScore: 200,      // 100 * 2
    },
};

export const buildExamQuestion = async (examType: ExamType) => {
    const config = EXAM_CONFIG[examType];

    // Using VETTED for testing — change to "ACTIVE" for production
    const STATUS = "ACTIVE";

    const [easyQuestions, mediumQuestions, hardQuestions] = await Promise.all([
        db.select()
            .from(questions)
            .where(and(
                eq(questions.difficulty, "EASY"),
                eq(questions.status, STATUS)
            ))
            .orderBy(sql`RANDOM()`)
            .limit(config.easy),

        db.select()
            .from(questions)
            .where(and(
                eq(questions.difficulty, "MEDIUM"),
                eq(questions.status, STATUS)
            ))
            .orderBy(sql`RANDOM()`)
            .limit(config.medium),

        db.select()
            .from(questions)
            .where(and(
                eq(questions.difficulty, "HARD"),
                eq(questions.status, STATUS)
            ))
            .orderBy(sql`RANDOM()`)
            .limit(config.hard),
    ]);

    return {
        questions: [...easyQuestions, ...mediumQuestions, ...hardQuestions],
        config,
    };
};