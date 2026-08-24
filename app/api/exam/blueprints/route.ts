import { NextResponse } from "next/server";
import { BLUEPRINTS } from "../../../../services/buildExam";

export const GET = async () => {
    const data = Object.entries(BLUEPRINTS).map(([key, def]) => ({
        key,
        label: def.label,
        totalQuestions: def.totalQuestions,
        durationMinutes: def.durationMinutes,
        subjects: Object.entries(def.subjects).map(([subject, count]) => ({ subject, count })),
    }));

    return NextResponse.json(data);
};
