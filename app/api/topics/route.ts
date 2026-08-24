import { NextResponse, NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../lib/db";
import { questions } from "../../../lib/schema";

export const GET = async (request: NextRequest) => {
    try {
        const subject = request.nextUrl.searchParams.get("subject");
        if (!subject) {
            return NextResponse.json({ success: false, error: "subject query param is required" }, { status: 400 });
        }

        const rows = await db
            .select({ topic: questions.topic, count: sql<number>`count(*)::int` })
            .from(questions)
            .where(and(eq(questions.status, "ACTIVE"), eq(questions.hasVisual, false), eq(questions.subject, subject)))
            .groupBy(questions.topic)
            .orderBy(sql`count(*) DESC`);

        return NextResponse.json(rows.map((r) => ({ topic: r.topic, count: r.count })));
    } catch (e) {
        console.error("[GET /api/topics] Error", e);
        return NextResponse.json(
            { success: false, error: e instanceof Error ? e.message : "Unknown error" },
            { status: 500 }
        );
    }
};
