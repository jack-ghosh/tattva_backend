import { NextResponse, NextRequest } from "next/server";
import { eq, count } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { questions } from "../../../../lib/schema";

export const POST = async (request: NextRequest) => {
    const body = await request.json();
    const { questionId, action } = body;

    if (!questionId || !action) {
        return NextResponse.json({
            success: false,
            message: "Action and Question Id required",
        });
    }

    if (action === "approve") {
        await db.update(questions)
            .set({ status: "ACTIVE" })
            .where(eq(questions.id, questionId))
    } else if (action === "delete") {
        await db.delete(questions)
            .where(eq(questions.id, questionId))
    } else {
        return NextResponse.json({
            success: false,
            message: "Action and Question Id required",
        });
    }

    console.log(
        NextResponse.json({
            success: true,
            data: {
                questionId,
                action
            }
        })
    )
    return NextResponse.json({
        success: true,
        data: {
            questionId,
            action
        }
    });
}