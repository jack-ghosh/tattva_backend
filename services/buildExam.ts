import { eq, and } from "drizzle-orm";
import { questions } from "../lib/schema";
import { db } from "../lib/db";

export const buildExamQuestion = async () => {
    const easyQuestion = await db.select()
        .from(questions)
        .where(and(eq(questions.difficulty, "EASY"), eq(questions.status, "ACTIVE")))
        .limit(20);

    const mediumQuestion = await db.select()
        .from(questions)
        .where(eq(questions.difficulty, "MEDIUM"))
        .limit(50);

    const hardQuestion = await db.select()
        .from(questions)
        .where(eq(questions.difficulty, "HARD"))
        .limit(30);

    return [...easyQuestion, ...mediumQuestion, ...hardQuestion];
}