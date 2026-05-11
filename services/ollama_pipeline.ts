import { QuestionSchema, type Question } from "../types/question";
import { db } from "../lib/db";
import { questions } from "../lib/schema.js";
import crypto from 'crypto';

export async function generateBatch(topic: string, count: number = 25): Promise<Question[]> {
    const prompt = `Generate exactly ${count} multiple choice Hard and Advance questions for the topic: "${topic}".

STRICT FORMAT:
- Return ONLY valid JSON array, no preamble or markdown
- No code fences, no explanation before or after
- Each question: subject (topic area), topic (specific subtopic), question (the Q text), options {a/b/c/d}, correctAns (a/b/c/d), explanation, difficulty (EASY/MEDIUM/HARD)

CRITICAL DISTRACTORS: If correct answer is a date/number/fact, make distractors plausible (off by 1, similar, adjacent years). NOT obviously wrong.

ONE example:
{
  "subject": "GK",
  "topic": "Indian Independence",
  "question": "What year did India gain independence?",
  "options": {"a": "1945", "b": "1947", "c": "1950", "d": "1952"},
  "correctAns": "b",
  "explanation": "India gained independence on August 15, 1947.",
  "difficulty": "EASY"
}

Now generate exactly ${count} questions as a JSON array:`;

    const validated: Question[] = [];
    const failed: any[] = [];
    try {
        const response = await fetch("http://localhost:11434/api/generate", {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: 'mistral',
                prompt: prompt,
                stream: false,
            }),
            signal: AbortSignal.timeout(600000),
        });

        const data = await response.json();
        const content = data.response;

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

        for (const q of parsed) {
            try {
                const valid = QuestionSchema.parse(q);

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
                });
            } catch (err) {
                console.log("Question validation failed", q, err);
                failed.push(q);
            }
        }
        console.log("Vetted ratio:", (failed.length / validated.length) * 100 + "%")

    } catch (err) {
        console.log("Groq API failed:", err);
        return [];
    }
    return validated;
}

(async () => {
    const questions = await generateBatch("Math", 5);
    console.log(JSON.stringify(questions, null, 2));
    console.log("questionlength", questions.length);
})();