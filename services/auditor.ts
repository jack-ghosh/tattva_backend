import gemini from "../lib/gemini";

type QuestionBatch = Record<number, {
    question: string,
    options: { a: string, b: string, c: string, d: string },
    correctAns: string,
}>;

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
        const response = await gemini.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const raw = response.text?.trim() ?? "";
        const cleaned = raw.replace(/```json|```/g, "").trim();

        let geminiAnswers: string[];
        try {
            geminiAnswers = JSON.parse(cleaned);
        } catch (err) {
            console.log("Gemini returned unpersable response");
            return [];
        }

        if (geminiAnswers.length !== count) {
            console.log(`length mismatch expected:${count}, got ${geminiAnswers.length}`);
            return [];
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
        if (err?.status === 429 || err?.message?.includes('429')) {
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