import { NextResponse } from "next/server";
import { eq, count } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { questions } from "../../../../lib/schema";


export const GET = async () => {
    const [total] = await db.select({ count: count() }).from(questions);
    const [vetted] = await db.select({ count: count() }).from(questions).where(eq(questions.status, "VETTED"));
    const [active] = await db.select({ count: count() }).from(questions).where(eq(questions.status, "ACTIVE"));
    const [failed] = await db.select({ count: count() }).from(questions).where(eq(questions.status, "FAILED"));

    console.log({
        total: total.count,
        vetted: vetted.count,
        active: active.count,
        failed: failed.count,
    })
    return NextResponse.json({
        success: true,
        data: {
            total: total.count,
            vetted: vetted.count,
            active: active.count,
            failed: failed.count,
        }
    });
}