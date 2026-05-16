import { NextResponse, NextRequest } from "next/server";
import crypto from 'crypto';
import { buildExamQuestion } from "../../../services/buildExam";

export const GET = async (request: NextRequest) => {
    const hundredQuestions = await buildExamQuestion();
    const examId = crypto.randomUUID();
    if (hundredQuestions.length !== 100) {
        throw new Error("ExamNotReadyError")
    }

    console.log(NextResponse.json({
        status: "ok",
        examId,
        questions: hundredQuestions,
        expiresAt: new Date(Date.now() + 3600 * 1000),
    }));

    return NextResponse.json({
        status: "ok",
        examId,
        questions: hundredQuestions,
        expiresAt: new Date(Date.now() + 3600 * 1000),
    });
}