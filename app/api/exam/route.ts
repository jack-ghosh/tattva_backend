import { NextResponse, NextRequest } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { buildTopicTest, buildMockTest, BLUEPRINTS, BlueprintKey, Subject } from "../../../services/buildExam";

const SUBJECTS: [Subject, ...Subject[]] = ["Mathematics", "Reasoning", "General Knowledge"];
const BLUEPRINT_KEYS = Object.keys(BLUEPRINTS) as [BlueprintKey, ...BlueprintKey[]];

const examRequestSchema = z.discriminatedUnion("examType", [
    z.object({
        examType: z.literal("15MIN"),
        subject: z.enum(SUBJECTS),
        topic: z.string().optional(),
        userId: z.string(),
    }),
    z.object({
        examType: z.enum(["MOCK_MINI", "MOCK_MAIN"]),
        blueprintKey: z.enum(BLUEPRINT_KEYS),
        userId: z.string(),
    }),
]);

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

        const built =
            body.examType === "15MIN"
                ? await buildTopicTest(body.subject, body.userId, body.topic)
                : await buildMockTest(body.blueprintKey, body.examType, body.userId);

        const { questions, config } = built;

        if (questions.length < config.totalQuestions) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Not enough questions for ${body.examType}. Need ${config.totalQuestions}, got ${questions.length}.`,
                    available: questions.length,
                    required: config.totalQuestions,
                },
                { status: 503 }
            );
        }

        const examId = crypto.randomUUID();

        return NextResponse.json({
            status: "ok",
            examId,
            examType: body.examType,
            ...("subject" in body ? { subject: body.subject, topic: body.topic ?? null } : {}),
            ...("blueprintKey" in body
                ? { blueprintKey: body.blueprintKey, blueprintLabel: (config as any).blueprintLabel }
                : {}),
            durationMinutes: config.durationMinutes,
            totalQuestions: config.totalQuestions,
            maxScore: config.maxScore,
            questions: questions.map(transformQuestion),
            expiresAt: new Date(Date.now() + config.durationMinutes * 60 * 1000),
        });
    } catch (e) {
        if (e instanceof z.ZodError) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Invalid request. Expected { examType: '15MIN', subject, userId } or { examType: 'MOCK_MINI' | 'MOCK_MAIN', blueprintKey, userId }.",
                    details: e.issues,
                },
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