import { NextResponse, NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../lib/db"
import { users } from "../../../lib/schema";


export const POST = async (request: NextRequest) => {
    const { displayName, username } = await request.json();
    const newUser = db.select(username).from(users).where(eq(users.username, username));
    // if (newUser.length > 0) {
    //     return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    // }
    const result = await db.insert(users).values({ displayName, username });
    return NextResponse.json({ status: "ok", result, timestamp: new Date() });
}