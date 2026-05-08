import { z } from "zod";

export const User = z.object({
    id: z.uuid().optional(),
    displayName: z.string(),
    username: z.string(),
    createdAt: z.string().optional(),
});