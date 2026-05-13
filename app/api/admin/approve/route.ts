// import { NextResponse,NextRequest } from "next/server";
// import { eq, count } from "drizzle-orm";
// import { db } from "../../../../lib/db";
// import { questions } from "../../../../lib/schema";

// export const POST = async (NextRequest:Response) => {
//     await db.insert().from(questions);

//     console.log({
//         total: total,
//     })
//     return NextResponse.json({
//         success: true,
//         data: {
//             total: total,
//         }
//     });
// }