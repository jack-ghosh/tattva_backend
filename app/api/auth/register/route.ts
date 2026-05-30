import { NextResponse, NextRequest } from "next/server";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../../../../lib/db";
import { users } from "../../../../lib/schema";


const registerSchema = z.object({
    displayName: z.string().min(1).max(40),
    username: z.string().min(3).max(40).regex(/^[a-zA-Z0-9]+$/),
    password: z.string().min(8).max(72),
    mobileNumber: z.string().regex(/^[0-9]{10}$/).optional(),
    role: z.enum(["STUDENT", "GUIDE", "ADMIN"]).optional(),
});

export const POST = async (request: NextRequest) => {
    try {
        const body = registerSchema.parse(await request.json());

        const existing = await db
            .select({ username: users.username, mobileNumber: users.mobileNumber })
            .from(users)
            .where(
                or(
                    eq(users.username, body.username),
                    body.mobileNumber ? eq(users.mobileNumber, body.mobileNumber) : undefined
                )
            );

        if (existing.length > 0) {
            return NextResponse.json(
                { error: "Username or mobile number already taken" },
                { status: 409}
            );
        }

        const hashPassword = await bcrypt.hash(body.password, 10);

        // Force STUDENT 
        const role = "STUDENT";

        const [user] = await db
            .insert(users)
            .values({
                displayName: body.displayName,
                username: body.username,
                mobileNumber: body.mobileNumber ?? null,
                hashPassword,
                role,
            })
            .returning({
                id: users.id,
                username: users.username,
                displayName: users.displayName,
                mobileNumber: users.mobileNumber,
                role: users.role,
            });

        return NextResponse.json(
            { status: "ok", ...user }
        );
    } catch {
        return NextResponse.json({ error: "Invalid input" }, { status: 400});
    }
};