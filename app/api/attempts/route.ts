import { NextResponse, NextRequest } from "next/server";
import TestAttempt from "../../../lib/models/TestAttempt";
import { connectToMongodb } from "@/lib/mongodb";

export async function GET(request: NextRequest) {
    try {
        await connectToMongodb()
        const userId = request.nextUrl.searchParams.get("userId");
        if (!userId) {
            return NextResponse.json({
                success: false,
                error: "User Id is required",
            }, {
                status: 400
            })
        }

        const attempts = await TestAttempt.find({ userId: userId })
            .sort({ submittedAt: -1 })
            .limit(50)
            .lean();

        const examName = (a: (typeof attempts)[number]) => {
            if (a.examType === "15MIN") {
                return a.topic ? `15-min ${a.subject ?? ""} — ${a.topic}` : `15-min ${a.subject ?? "Topic Test"}`;
            }
            const label = a.blueprintLabel ?? a.blueprintKey ?? "Mock";
            return `${label} — ${a.examType === "MOCK_MINI" ? "Mini Mock" : "Full Mock"}`;
        };

        const data = attempts.map(a => ({
            id: a._id.toString(),
            date: a.submittedAt?.toISOString() ?? new Date().toISOString(),
            score: a.score,
            percentage: a.percentage,
            correctCount: a.correctCount,
            wrongCount: a.wrongCount,
            unattempted: a.unattempted,
            examType: a.examType,
            examName: examName(a),
        }))

        return NextResponse.json({
            success: true,
            data
        })
    } catch (error) {
        console.log('GET api/attempts error', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown server error",
        }, {
            status: 500
        })
    }
}