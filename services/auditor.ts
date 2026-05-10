import gemini from "../lib/gemini";
import { QuestionSchema, type Question } from "../types/question";

export async function auditGeneratedQuestions(q: Question): Promise<"PASS" | "FAIL"> {
    const prompt = `You are a fact-checking expert auditor. Your only job is to identify the correct answer.

Question: ${q.question}

Options:
a) ${q.options.a}
b) ${q.options.b}
c) ${q.options.c}
d) ${q.options.d}

Think step by step. What is the objectively correct answer? Reply with ONLY the single letter (a, b, c, or d) — nothing else.`;
    try {
        const response = await gemini.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const answer = response.text?.toLowerCase().match(/[a-d]/)?.[0];
        console.log(`Question: ${q.question}

Options:
a) ${q.options.a}
b) ${q.options.b}
c) ${q.options.c}
d) ${q.options.d}

gemini response:${answer}`);

        if (answer === q.correctAns.toLowerCase()) {
            return "PASS"
        }

        return "FAIL"
    } catch (err) {
        console.log("Gemini API failed", q, err);
        return "FAIL";
    }
}

// (async () => {
//     const passOrFail = await auditGeneratedQuestions(
//         {
//             question: "If a train travels 60 km/h for 2 hours, then 80 km/h for 1 hour, what is the average speed?",
//             options: {
//                 a: "70",
//                 b: "66.67",
//                 c: "75",
//                 d: "60"
//             },
//             correctAns: "b"
//         }
//     );
//     console.log(JSON.stringify(passOrFail));
// })();