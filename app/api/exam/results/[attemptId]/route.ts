import { NextResponse, NextRequest } from "next/server";
import { db } from "../../../../../lib/db";
import { questions } from "../../../../../lib/schema";
import TestAttempt from "../../../../../lib/models/TestAttempt";
import { connectToMongodb } from "../../../../../lib/mongodb";
import { inArray } from "drizzle-orm";

type QuestionRow = typeof questions.$inferSelect;

function transformQuestion(
    q: Pick<QuestionRow, "id" | "question" | "options" | "correctAns" | "explanation">
): {
    id: string;
    text: string;
    options: { key: string; text: string }[];
    correctAnswer: string;
    explanation: string | null;
    userAnswer: string | null;
} {
    return {
        id: q.id,
        text: q.question,
        options: [
            { key: "a", text: q.options.a },
            { key: "b", text: q.options.b },
            { key: "c", text: q.options.c },
            { key: "d", text: q.options.d },
        ],
        correctAnswer: q.correctAns,
        explanation: q.explanation,
        userAnswer: null,
    };
}

export const GET = async (
    _request: NextRequest,
    { params }: { params: Promise<{ attemptId: string }> }
) => {
    try {
        await connectToMongodb();
        const { attemptId } = await params;

        const attempt = await TestAttempt.findById(attemptId);
        if (!attempt) {
            return NextResponse.json(
                { success: false, error: "Attempt not found" },
                { status: 404 }
            );
        }

        const qIds = attempt.responses
            .map((r) => r.questionId)
            .filter((id): id is string => !!id);
        const dbQuestions = await db
            .select()
            .from(questions)
            .where(inArray(questions.id, qIds));
        const qMap = new Map(dbQuestions.map((q) => [q.id, q]));

        const wrongQuestions = attempt.responses
            .filter((r) => !r.isCorrect && r.userAns !== null)
            .map((r) => {
                const q = qMap.get(r.questionId!);
                if (!q) return null;
                const transformed = transformQuestion(q);
                transformed.userAnswer = r.userAns ?? null;
                return transformed;
            })
            .filter(Boolean);

        const unattemptedQuestions = attempt.responses
            .filter((r) => r.userAns === null)
            .map((r) => {
                const q = qMap.get(r.questionId!);
                if (!q) return null;
                return transformQuestion(q);
            })
            .filter(Boolean);

        return NextResponse.json({
            success: true,
            data: {
                score: attempt.score,
                correctCount: attempt.correctCount,
                wrongCount: attempt.wrongCount,
                unattempted: attempt.unattempted,
                percentage: attempt.percentage,
                wrongQuestions,
                unattemptedQuestions,
            },
        });
    } catch (error) {
        console.error("[GET /api/exam/results/[attemptId]] Error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Server error",
            },
            { status: 500}
        );
    }
};
