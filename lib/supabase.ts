import { createClient } from "@supabase/supabase-js";
import WEBSOCKET from "ws";

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
        realtime: {
            transport: WEBSOCKET as any,
        }
    }
)

export default supabase;