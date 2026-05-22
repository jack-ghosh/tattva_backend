import Groq from "groq-sdk";
import crypto from 'crypto';
import { db } from "../lib/db";
import { questions } from "../lib/schema.js";
import { QuestionSchema, type Question } from "../types/question";
import { auditGeneratedQuestions } from "./auditor";
import { getActiveGroqKey, exhaustGroqKey } from "../lib/providers.js";
import retriveContext from "./rag";

async function generateWithFallBack(prompt: string): Promise<string> {
    while (true) {
        const apiKey = getActiveGroqKey();
        try {
            const groqClient = new Groq({ apiKey });
            const response = await groqClient.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                max_tokens: 8000,
            });

            return response.choices[0].message.content || "";
        } catch (err: any) {
            if (err?.status === 429) {
                exhaustGroqKey(apiKey);
                continue;
            }
            throw err;
        }
    }
}

export async function generateQuestionBatch(
    topic: string,
    count: number = 25,
    subject: string = "General"
): Promise<Question[]> {
    const context = await retriveContext(topic, 20);
    const prompt = `You are an expert question setter for the RRB NTPC UG (Railway Recruitment Board Non-Technical Popular Categories Undergraduate) competitive exam in India.
Based on this curriculum content:

${context}

Generate exactly ${count} multiple choice questions for the topic: "${topic}" under the subject: "${subject}".

EXAM CONTEXT:
- Candidates are 12th pass / undergraduate level
- Questions test conceptual clarity and application, NOT advanced theory
- Difficulty mix: 30% EASY, 50% MEDIUM, 20% HARD
- EASY = direct fact or formula application
- MEDIUM = 2-step reasoning or application
- HARD = multi-step problem or tricky distractor

STRICT FORMAT:
- Return ONLY a valid JSON array, no preamble or markdown
- No code fences, no explanation before or after
- Each object must have: subject, topic, question, options {a,b,c,d}, correctAns (a/b/c/d), explanation, difficulty (EASY/MEDIUM/HARD)

CRITICAL DISTRACTORS: Make distractors plausible — off by 1 year, adjacent values, common misconceptions. Never use obviously wrong options.

Example:
{
  "subject": "General Awareness",
  "topic": "Freedom Struggle",
  "question": "In which year was the Quit India Movement launched?",
  "options": {"a": "1940", "b": "1942", "c": "1944", "d": "1945"},
  "correctAns": "b",
  "explanation": "The Quit India Movement was launched by Mahatma Gandhi on August 8, 1942.",
  "difficulty": "EASY"
}

Now generate exactly ${count} questions as a JSON array:`;

    const validated: Question[] = [];
    const failed: any[] = [];
    try {
        const content = await generateWithFallBack(prompt);

        let jsonString = content.trim();
        if (jsonString.startsWith("```json")) {
            jsonString = jsonString.slice(7);
        }
        if (jsonString.startsWith("```")) {
            jsonString = jsonString.slice(3);
        }
        if (jsonString.endsWith("```")) {
            jsonString = jsonString.slice(0, -3);
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonString);
        } catch (err) {
            console.error("Failed to parse JSON", err);
            return [];
        }

        let rawQuestionsForGemini: Record<number, {
            question: string;
            options: Question['options'];
            correctAns: string;
        }> = {};

        for (let i = 0; i < parsed.length; i++) {
            rawQuestionsForGemini[i] = {
                question: parsed[i].question,
                options: parsed[i].options,
                correctAns: parsed[i].correctAns,
            }
        }

        const auditResult: number[] = await auditGeneratedQuestions(rawQuestionsForGemini); //audit result will be expecting a array of faild questions index


        for (let i = 0; i < parsed.length; i++) {
            try {
                const valid = QuestionSchema.parse(parsed[i]);
                if (!auditResult.includes(i)) {
                    validated.push(valid);
                    await db.insert(questions).values({
                        subject: valid.subject,
                        topic: valid.topic,
                        question: valid.question,
                        options: valid.options,
                        correctAns: valid.correctAns,
                        explanation: valid.explanation,
                        difficulty: valid.difficulty,
                        status: "VETTED",
                        hash: crypto.createHash('sha256').update(valid.question).digest('hex'),
                    }).onConflictDoNothing();
                } else {
                    failed.push(valid);
                }
            } catch (err) {
                console.log("Question validation failed", parsed[i], err);
                failed.push(parsed[i]);
            }
        }
        console.log(`Vetted ratio: ${(validated.length / parsed.length) * 100}% passed`);
    } catch (err: any) {
        if (err?.message === 'GEMINI_QUOTA_EXCEEDED') throw err;
        if (err?.message === 'GROQ_ALL_KEYS_EXHAUSTED') throw err; // add this
        console.log("Pipeline failed:", err);
        return [];

    }
    return validated;
}
