import { NextResponse, NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { questions } from "../../../../lib/schema";

export const OPTIONS = async () => {
    return NextResponse.json({}, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    })
}

export const POST = async (request: NextRequest) => {
    const body = await request.json();
    const { questionId, action } = body;

    if (!questionId || !action) {
        return NextResponse.json(
            { success: false, message: "questionId and action required" },
            { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
    }

    try {
        if (action === "approve") {
            await db.update(questions)
                .set({ status: "ACTIVE" })
                .where(eq(questions.id, questionId))
        } else if (action === "delete") {
            await db.delete(questions)
                .where(eq(questions.id, questionId))
        } else {
            return NextResponse.json(
                { success: false, message: "Invalid action" },
                { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
            );
        }

        return NextResponse.json({
            success: true,
            data: { questionId, action }
        }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
        );
    }
}