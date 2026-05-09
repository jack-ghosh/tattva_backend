import { NextResponse, NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../lib/db"
import { users } from "../../../lib/schema";

const registerSchema = z.object({
    displayName: z.string().min(1),
    username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9]+$/)
})

export const POST = async (request: NextRequest) => {
    try {
        const body = registerSchema.parse(await request.json());
        const newUser = await db.select().from(users).where(eq(users.username, body.username));
        if (newUser.length > 0) {
            return NextResponse.json({ error: "Username already taken" }, { status: 409 });
        }
        const result = await db.insert(users).values(body).returning();
        const { id, username, displayName } = result[0];
        return NextResponse.json({ status: "ok", id, username, displayName, timestamp: new Date() });
    }
    catch (e) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 })
    }
}

export const GET = async (request: NextRequest) => {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
        return NextResponse.json({ error: "User Id is missing" }, { status: 400 });
    }
    const newUser = await db.select().from(users).where(eq(users.id, userId));
    if (!newUser[0]) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ status: "ok", user: newUser[0], timestamp: new Date() });
}