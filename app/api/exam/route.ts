import { NextResponse, NextRequest } from "next/server";
import crypto from 'crypto';
import { buildExamQuestion } from "../../../services/buildExam";

const transfromQuestion = (q: any) => {
    return {
        id: q.id,
        text: q.question,
        options: [
            { key: 'a', text: q.options.a },
            { key: 'b', text: q.options.b },
            { key: 'c', text: q.options.c },
            { key: 'd', text: q.options.d },
        ],
        correctAnswer: q.correctAns,
        explanation: q.explanation,
    }
}
export const GET = async (request: NextRequest) => {
    try {
        const hundredQuestions = await buildExamQuestion();
        console.log(hundredQuestions.length)
        if (hundredQuestions.length < 5) {
            return NextResponse.json({
                success: false,
                error: `Not enough quetions Available :${hundredQuestions.length}, need 100`,
                available: hundredQuestions.length,
            },
                { status: 503 }
            )
        }
        const examId = crypto.randomUUID();
        const transfromedQuestions = hundredQuestions.map(transfromQuestion)
        console.log(transfromedQuestions);

        return NextResponse.json({
            status: "ok",
            examId,
            questions: transfromedQuestions,
            expiresAt: new Date(Date.now() + 3600 * 1000),
        });
    } catch (e) {
        console.error('[GET /api/exam] Error', e);
        return NextResponse.json({
            success: false,
            error: e instanceof Error ? e.message : 'Unknown Error',
        }, {
            status: 500
        })
    }
}