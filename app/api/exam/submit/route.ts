import { NextResponse, NextRequest } from "next/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { questions } from "../../../../lib/schema";
import TestAttempt from "../../../../lib/models/TestAttempt";
import { connectToMongodb } from "../../../../lib/mongodb";
import { db } from "../../../../lib/db";


const submitSchema = z.object({
    examId: z.string().uuid(),
    userId: z.string(),
    examType: z.enum(["15MIN", "MOCK_MINI", "MOCK_MAIN"]),
    maxScore: z.number().positive(),
    subject: z.string().optional(),
    topic: z.string().optional(),
    blueprintKey: z.string().optional(),
    blueprintLabel: z.string().optional(),
    responses: z.array(z.object({
        qId: z.string(),
        userAns: z.string().nullable(),
    }))
});

interface ResponseEntry {
    questionId: string;
    userAns: string | null;
    isCorrect: boolean;
}

export const POST = async (request: NextRequest) => {
    try {
        await connectToMongodb();

        const body = submitSchema.parse(await request.json());
        const qIds = body.responses.map(r => r.qId);

        const dbQuestions = await db.select()
            .from(questions)
            .where(inArray(questions.id, qIds));
        const qMap = new Map(dbQuestions.map(q => [q.id, q]));

        const responses: ResponseEntry[] = [];
        let correct = 0, wrong = 0, unattempted = 0;

        body.responses.forEach((response) => {
            const q = qMap.get(response.qId);
            if (!q) return;

            const isCorrect = response.userAns === q.correctAns;
            const isAttempted = response.userAns !== null;

            if (!isAttempted) {
                unattempted++;
            } else if (isCorrect) {
                correct++;
            } else {
                wrong++;
            }

            responses.push({
                questionId: response.qId,
                userAns: response.userAns,
                isCorrect,
            });
        });

        const rawScore = (correct * 2) - (wrong * 0.67);
        const score = Math.max(0, rawScore);
        const percentage = (score / body.maxScore) * 100;  // dynamic, not hardcoded 200

        const attempt = new TestAttempt({
            userId: body.userId,
            examId: body.examId,
            examType: body.examType,
            subject: body.subject,
            topic: body.topic,
            blueprintKey: body.blueprintKey,
            blueprintLabel: body.blueprintLabel,
            score,
            percentage,
            correctCount: correct,
            wrongCount: wrong,
            unattempted,
            responses,
            submittedAt: new Date(),
        });

        const savedAttempt = await attempt.save();

        return NextResponse.json({
            success: true,
            data: {
                attemptId: savedAttempt._id.toString(),
                score: parseFloat(score.toFixed(2)),
                correct,
                wrong,
                unattempted,
                percentage: parseFloat(percentage.toFixed(2)),
                examType: body.examType,
            }
        });

    } catch (error) {
        console.error("[POST /api/exam/submit] Error:", error);
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid request format", details: error.issues },
                { status: 400 }
            );
        }
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500 }
        );
    }
};