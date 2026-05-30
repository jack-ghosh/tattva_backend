import { NextResponse, NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { questions } from "../../../../lib/schema";
import { requireAdmin } from "@/lib/auth-check";

export const POST = async (request: NextRequest) => {
    const auth = await requireAdmin(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json();
    const { questionId, action } = body;

    if (!questionId || !action) {
        return NextResponse.json(
            { success: false, message: "questionId and action required" },
            { status: 400 }
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
                { status: 400 }
            );
        }

        return NextResponse.json({ success: true, data: { questionId, action } });
    } catch (error) {
        return NextResponse.json(
            { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}