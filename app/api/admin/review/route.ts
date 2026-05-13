import { NextResponse } from "next/server";
import { eq, count } from "drizzle-orm";
import { db } from "../../../../lib/db";
import { questions } from "../../../../lib/schema";

export const GET = async () => {
    const [total] = await db.select().from(questions);

    console.log({
        total: total,
    })
    return NextResponse.json({
        success: true,
        data: {
            total: total,
        }
    });
}