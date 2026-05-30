import { NextResponse, NextRequest } from "next/server";
import crypto from "crypto";
import { buildExamQuestion, EXAM_CONFIG, ExamType } from "../../../services/buildExam";
import { z } from "zod";

const examRequestSchema = z.object({
    examType: z.enum(["15MIN", "30MIN", "RRB"]),
});

const transformQuestion = (q: any) => ({
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
});

export const POST = async (request: NextRequest) => {
    try {
        const body = examRequestSchema.parse(await request.json());
        const { examType } = body;

        const { questions, config } = await buildExamQuestion(examType);

        if (questions.length < config.totalQuestions) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Not enough questions for ${examType}. Need ${config.totalQuestions}, got ${questions.length}.`,
                    available: questions.length,
                    required: config.totalQuestions,
                },
                { status: 503}
            );
        }

        const examId = crypto.randomUUID();

        return NextResponse.json(
            {
                status: "ok",
                examId,
                examType,
                durationMinutes: config.durationMinutes,
                totalQuestions: config.totalQuestions,
                maxScore: config.maxScore,
                questions: questions.map(transformQuestion),
                expiresAt: new Date(Date.now() + config.durationMinutes * 60 * 1000),
            }
        );
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: "Invalid examType. Must be 15MIN, 30MIN, or RRB." },
                { status: 400 }
            );
        }
        console.error("[POST /api/exam] Error", e);
        return NextResponse.json(
            {
                success: false,
                error: e instanceof Error ? e.message : "Unknown Error",
            },
            { status: 500 }
        );
    }
};