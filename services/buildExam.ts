import { eq, and, sql } from "drizzle-orm";
import { questions } from "../lib/schema";
import { db } from "../lib/db";

export const buildExamQuestion = async () => {
    const [easyQuestion, mediumQuestion, hardQuestion] = await Promise.all([
        db.select()
            .from(questions)
            .where(and(
                eq(questions.difficulty, "EASY"),
                eq(questions.status, "ACTIVE")
            ))
            .orderBy(sql`RANDOM()`)
            .limit(20),
        db.select()
            .from(questions)
            .where(and(
                eq(questions.difficulty, "MEDIUM"),
                eq(questions.status, "ACTIVE")
            ))
            .orderBy(sql`RANDOM()`)
            .limit(20),
        db.select()
            .from(questions)
            .where(and(
                eq(questions.difficulty, "HARD"),
                eq(questions.status, "ACTIVE")
            ))
            .orderBy(sql`RANDOM()`)
            .limit(20),
    ])

    return [...easyQuestion, ...mediumQuestion, ...hardQuestion];
}