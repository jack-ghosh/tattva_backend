import { z } from "zod";

export const User = z.object({
    id: z.string().uuid().optional(),
    displayName: z.string(),
    username: z.string(),
    mobileNumber: z.string().nullable().optional(),
    role: z.enum(["STUDENT", "GUIDE", "ADMIN"]),
    createdAt: z.string().optional(),
});