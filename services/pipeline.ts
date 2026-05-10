import groq from "../lib/groq";
import { QuestionSchema, type Question } from "../types/question";

export async function generateBatch(topic: string, count: number = 25): Promise<Question[]> {
    const prompt = `Generate exactly ${count} multiple choice questions for the topic: "${topic}".

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
        const response = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 8000,
        });

        const content = response.choices[0].message.content || "";
        console.log("Raw response length:", content.length);
        console.log("First 500 chars:", content.slice(0, 500));
        console.log("Last 500 chars:", content.slice(-500));
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
            } catch (err) {
                console.log("Question validation failed", q, err);
                failed.push(q);
            }
        }
    } catch (err) {
        console.log("Groq API failed:", err);
        return [];
    }
    return validated;
}

(async () => {
    const questions = await generateBatch("Indian Polity", 25);  // Start with 5 for testing
    console.log(JSON.stringify(questions, null, 2));
    console.log("questionlength", questions.length);
})();