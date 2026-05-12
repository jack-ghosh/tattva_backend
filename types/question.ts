import { z } from "zod";

export const QuestionSchema = z.object({
    id: z.uuid().optional(),
    subject: z.string(),
    topic: z.string(),
    question: z.string(),
    options: z.object({
        a: z.string().min(1),
        b: z.string().min(1),
        c: z.string().min(1),
        d: z.string().min(1),
    }).strict(),
    correctAns: z.enum(["a", "b", "c", "d"]),
    explanation: z.string(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
    status: z.enum([
        "PENDING", "VETTED", "FAILED", "ACTIVE"
    ]).optional(),
    hash: z.string().optional(),
    createdAt: z.string().optional(),
}).strict();

export type Question = z.infer<typeof QuestionSchema>;