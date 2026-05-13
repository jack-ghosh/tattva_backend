import { getActiveGeminiKey, exhaustGeminiKey } from "../lib/providers.js";
import { GoogleGenAI } from '@google/genai';

type QuestionBatch = Record<number, {
    question: string,
    options: { a: string, b: string, c: string, d: string },
    correctAns: string,
}>;


async function generateWithFallBack(prompt: string): Promise<string> {
    while (true) {
        const apiKey = getActiveGeminiKey();
        try {
            const geminiClient = new GoogleGenAI({ apiKey });
            const response = await geminiClient.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            return response.text?.trim() ?? "";
        } catch (err: any) {
            if (err?.status === 429) {
                exhaustGeminiKey(apiKey);
                continue;
            }
            throw err;
        }
    }
}
export async function auditGeneratedQuestions(questions: QuestionBatch): Promise<number[]> {
    const indices = Object.keys(questions).map(Number);
    const count = indices.length;

    const questionList = indices.map(i => {
        const q = questions[i];
        return `Q:${i}:${q.question}
        a) ${q.options.a}
        b) ${q.options.b}
        c) ${q.options.c}
        d) ${q.options.d}`;
    }).join("\n\n");

    const prompt = `You are a fact-checking auditor for a competitive exam question bank (RRB NTPC UG level).

For each question below, identify the objectively correct answer.

${questionList}

STRICT OUTPUT RULES:
- Reply ONLY with a raw JSON array of ${count} strings
- Each string must be exactly one of: "a", "b", "c", or "d"
- Array index must match question number (Q0 → index 0, Q1 → index 1...)
- No markdown, no backticks, no explanation
- Example for 4 questions: ["b","a","c","d"]

Your answer array:`;

    try {
        const raw = await generateWithFallBack(prompt)
        const cleaned = raw.replace(/```json|```/g, "").trim();

        let geminiAnswers: string[];
        try {
            geminiAnswers = JSON.parse(cleaned);
        } catch (err) {
            console.log("Gemini returned unpersable response");
            return [];
        }

        if (geminiAnswers.length !== count) {
            console.log(`length mismatch expected:${count}, got ${geminiAnswers.length} - padding missing as failed`);
            while (geminiAnswers.length < count) {
                geminiAnswers.push("__missing__");
            }
            geminiAnswers = geminiAnswers.slice(0, count);
        }

        const failedIndices: number[] = [];
        for (let i = 0; i < count; i++) {
            const geminiAns = geminiAnswers[i].toLowerCase().trim();
            const correctAns = questions[i].correctAns?.toLowerCase().trim();

            if (geminiAns !== correctAns) {
                failedIndices.push(i);
            }
        }

        console.log(`Audit completed: ${count - failedIndices.length} Passed and ${failedIndices.length} Failed`);
        return failedIndices;
    } catch (err: any) {
        if (err?.message === 'GEMINI_ALL_KEYS_EXHAUSTED') {
            throw new Error('GEMINI_QUOTA_EXCEEDED');
        }
        console.log("Gemini API failed", err);
        return [];
    }
}

(async () => {
    const result = await auditGeneratedQuestions({
        0: {
            question: "If a train travels 60 km/h for 2 hours, then 80 km/h for 1 hour, what is the average speed?",
            options: { a: "70", b: "66.67", c: "75", d: "60" },
            correctAns: "b"
        }
    });
    console.log("Failed indices:", result); // expect []
})();