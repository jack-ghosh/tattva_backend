import { z } from "zod";

export const QuestionSchema = z.object({
    id: z.uuid().optional(),
    subject: z.string(),
    topic: z.string(),
    question: z.string(),
    options: z.object({
        a: z.string(),
        b: z.string(),
        c: z.string(),
        d: z.string(),
    }),
    correctAns: z.enum(["a", "b", "c", "d"]),
    explanation: z.string(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    status: z.enum([
        "PENDING", "VETTED", "FAILED", "ACTIVE"
    ]).optional(),
    hash: z.string().optional(),
    createdAt: z.string().optional(),
});

export type Question = z.infer<typeof QuestionSchema>;