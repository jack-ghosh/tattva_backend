import { NextResponse, NextRequest } from "next/server";
import { eq, count } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { questions } from "../../../../lib/schema";

export const GET = async (request: NextRequest) => {
    const page = Number(request.nextUrl.searchParams.get("page"));

    const [total] = await db.select({ count: count() }).from(questions);

    const [question] = await db
        .select()
        .from(questions)
        .where(eq(questions.status, "VETTED"))
        .limit(1)
        .offset(page);


    console.log({
        total: total.count,
        question: question,
        current: page
    })
    return NextResponse.json({
        success: true,
        data: {
            total: total.count,
            question,
            current: page
        }
    });
}