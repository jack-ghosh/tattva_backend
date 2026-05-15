import { NextResponse, NextRequest } from "next/server";
import { eq, count } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { questions } from "../../../../lib/schema";

export const OPTIONS = async () => {
    return NextResponse.json({}, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    })
}

export const GET = async (request: NextRequest) => {
    const page = Number(request.nextUrl.searchParams.get("page"));

    const [total] = await db.select({ count: count() }).from(questions).where(eq(questions.status, "VETTED"));

    const [question] = await db
        .select()
        .from(questions)
        .where(eq(questions.status, "VETTED"))
        .limit(1)
        .offset(page);

    return NextResponse.json({
        success: true,
        data: {
            total: total.count,
            question,
            current: page
        }
    }, {
        headers: {
            'Access-Control-Allow-Origin': '*',
        }
    });
}