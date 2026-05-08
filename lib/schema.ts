import { pgTable, text, varchar, uuid, jsonb, char, timestamp } from "drizzle-orm/pg-core";

export const questions = pgTable('question', {
    id: uuid('id').defaultRandom().primaryKey(),
    subject: varchar('subject', { length: 50 }).notNull(),
    topic: varchar('topic', { length: 100 }).notNull(),
    question: text('question').notNull(),
    options: jsonb('options').notNull(),
    correctAns: char('correct_ans', { length: 1 }).notNull(),
    explanation: text('explanation').notNull(),
    difficulty: varchar('difficulty', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    hash: text('hash').unique(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    displayName: varchar('displayName', { length: 40 }).notNull(),
    username: varchar('username', { length: 40 }).notNull(),
    createdAt: timestamp('created_at').defaultNow(),
})

