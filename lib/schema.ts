import { pgTable, text, varchar, uuid, jsonb, char, timestamp, customType, unique, real, boolean } from "drizzle-orm/pg-core";
import type { Question } from "../types/question";

const vector1536 = customType<{ data: number[] }>({
    dataType() {
        return 'vector(1536)'
    },
    toDriver(value: number[]) {
        return `[${value.join(',')}]`;
    },
});

const vector3072 = customType<{ data: number[] }>({
    dataType() {
        return 'vector(3072)'
    },
    toDriver(value: number[]) {
        return `[${value.join(',')}]`;
    },
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
    embedding: vector1536('embedding'),
    createdAt: timestamp('created_at').defaultNow(),

    subtopic: varchar('subtopic', { length: 150 }),
    difficultyScore: real('difficulty_score'),
    isPyq: boolean('is_pyq').default(false),
    sourceRaw: text('source_raw'),
    examType: varchar('exam_type', { length: 150 }),
    examTypeCanonical: varchar('exam_type_canonical', { length: 20 }),
    hasVisual: boolean('has_visual').default(false),
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
    role: varchar('role', { length: 20 }).notNull().default('STUDENT'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const corpus = pgTable("corpus", {
    id: uuid('id').defaultRandom().primaryKey(),
    subject: varchar('subject', { length: 50 }).notNull(),
    source: text("source"),
    chunkText: text("chunk_text"),
    embedding: vector3072('embedding'),
    createdAt: timestamp('created_at').defaultNow(),
})

//npx drizzle-kit push