import { pgTable, text, varchar, uuid, jsonb, char, timestamp, customType,unique, real, boolean } from "drizzle-orm/pg-core";
import type { Question } from "../types/question";

const vector = customType<{ data: number[] }>({
    dataType() {
        return 'vector(3072)'
    }
});

export const questions = pgTable('question', {
    id: uuid('id').defaultRandom().primaryKey(),
    subject: varchar('subject', { length: 50 }).notNull(),
    topic: varchar('topic', { length: 100 }).notNull(),
    question: text('question').notNull(),
    options: jsonb('options').$type<Question["options"]>().notNull(),
    correctAns: char('correct_ans', { length: 1 }).notNull(),
    explanation: text('explanation').notNull(),
    difficulty: varchar('difficulty', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    hash: text('hash').unique(),
    embedding: vector('embedding'),
    createdAt: timestamp('created_at').defaultNow(),

        // ── PYQ fields (all nullable — existing rows unaffected) ──
    subtopic: varchar('subtopic', { length: 150 }),
    difficultyScore: real('difficulty_score'),        // 0.0–1.0 float
    isPyq: boolean('is_pyq').default(false),
    sourceRaw: text('source_raw'),
    examType: varchar('exam_type', { length: 50 }),
    examStage: varchar('exam_stage', { length: 20 }),
    examDate: varchar('exam_date', { length: 20 }),
    examShift: varchar('exam_shift', { length: 20 }),
});

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: varchar('displayName', { length: 40 }).notNull(),
    username: varchar('username', { length: 40 }).notNull().unique(),
    mobileNumber: varchar('mobileNumber', { length: 15 }).unique(),
    hashPassword: text('hashPassword').notNull(),
    role:varchar('role', { length: 20 }).notNull().default('STUDENT'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const corpus = pgTable("corpus", {
    id: uuid('id').defaultRandom().primaryKey(),
    subject: varchar('subject', { length: 50 }).notNull(),
    source: text("source"),
    chunkText: text("chunk_text"),
    embedding: vector('embedding'),
    createdAt: timestamp('created_at').defaultNow(),
})

//npx drizzle-kit push