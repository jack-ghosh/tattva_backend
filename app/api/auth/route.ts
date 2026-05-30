import { NextResponse, NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../lib/db";
import { users } from "../../../lib/schema";

export const GET = async (request: NextRequest) => {
    const userId = request.nextUrl.searchParams.get("userId");
    if (!userId) {
        return NextResponse.json({ error: "User Id is missing" }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404});
    }

    const { hashPassword: _, ...safeUser } = user;

    return NextResponse.json(
        { status: "ok", user: safeUser }
    );
};