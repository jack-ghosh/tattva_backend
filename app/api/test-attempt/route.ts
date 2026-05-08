import { NextResponse, NextRequest } from "next/server";
import { Test } from "../../../lib/models/TestAttempt";
import { connectToMongodb } from "../../../lib/mongodb"

export const GET = async (request: NextRequest) => {
    await connectToMongodb();
    const userId = request.nextUrl.searchParams.get('userId');
    const result = await Test.find({ userId });
    return NextResponse.json({ status: "ok", result, timestamp: new Date() });
}

export const POST = async (request: NextRequest) => {
    await connectToMongodb();
    const body = await request.json();
    const newAttempt = new Test(body);
    const result = await newAttempt.save();
    return NextResponse.json({ status: "ok", result, timestamp: new Date() });
}