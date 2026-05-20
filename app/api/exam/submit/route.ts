import { NextResponse, NextRequest } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { questions } from "../../../../lib/schema";
import { TestAttempt } from "../../../../lib/models/TestAttempt";
import { connectToMongodb } from "../../../../lib/mongodb";
import { db } from "../../../../lib/db";

const submitSchema = z.object({
    examId: z.string().uuid(),
    userId: z.string(),
    responses: z.array(z.object({
        qId: z.string(),
        userAns: z.string().nullable(),
    }))
});

interface ResponseEntry {
    questionId: string;
    userAnswer: string | null;
    correctAnswer: string;
    isCorrected: boolean;
    isAttempted: boolean;
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
            const isCorrected = response.userAns === q.correctAns;
            const isAttempted = response.userAns !== null;
            if (!isAttempted) {
                unattempted++;
            } else if (isCorrected) {
                correct++
            } else {
                wrong++
            }

            responses.push({
                questionId: response.qId,
                userAnswer: response.userAns,
                correctAnswer: q.correctAns,
                isCorrected,
                isAttempted,
            })
        });
        const rawScore = (correct * 2) - (wrong * 0.67);
        const score = Math.max(0, rawScore);
        const parcentage = (score / 200) * 100;


        const attempt = new TestAttempt({
            userId: body.userId,
            examId: body.examId,
            score,
            parcentage,
            correct,
            wrong,
            unattempted,
            responses,
            submittedAt: new Date(),
        });

        const savedAttempt = await attempt.save();

        console.log("data: ", {
            attemptId: savedAttempt._id.toString(),
            score: parseFloat(score.toFixed(2)),
            correct,
            wrong,
            unattempted,
            percentage: parseFloat(parcentage.toFixed(2)),
        })
        return NextResponse.json({
            success: true,
            data: {
                attemptId: savedAttempt._id.toString(),
                score: parseFloat(score.toFixed(2)),
                correct,
                wrong,
                unattempted,
                percentage: parseFloat(parcentage.toFixed(2)),
            }
        });
    } catch (error) {
        console.error("[POST /api/exam/submit] Error:", error);
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Invalid request format",
                    details: error.issues,
                },
                { status: 400 }
            );
        }
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
            },
            { status: 500 }
        );
    }
};