import { NextResponse, NextRequest } from "next/server";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../../../../lib/db";
import { users } from "../../../../lib/schema";

const loginSchema = z.object({
    identifier: z.string().min(3).max(40),
    password: z.string().min(8).max(72),
});

export const POST = async (request: NextRequest) => {
    try {
        const body = loginSchema.parse(await request.json());

        const [user] = await db
            .select()
            .from(users)
            .where(
                or(
                    eq(users.username, body.identifier),
                    eq(users.mobileNumber, body.identifier)
                )
            );

        if (!user) {
            return NextResponse.json(
                { error: "Username or mobile number not found" },
                { status: 404 }
            );
        }

        const validPassword = await bcrypt.compare(body.password, user.hashPassword);
        if (!validPassword) {
            return NextResponse.json(
                { error: "Invalid password" },
                { status: 401 }
            );
        }

        return NextResponse.json({
            status: "ok",
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            mobileNumber: user.mobileNumber,
            role: user.role,
        });
    } catch (error) {
  console.error('Login error:', error)
  return NextResponse.json({ error: "Invalid input" }, { status: 400 })
}
};