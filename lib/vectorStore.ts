import "dotenv/config";
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import WebSocket from 'ws';
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
        realtime: {
            transport: WebSocket as any,
        }
    }
);

const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY_1!,
    httpOptions: { apiVersion: 'v1' }
});

export async function generateEmbedding(text: string): Promise<number[]> {
    const result = await genAI.models.embedContent({
        model: "models/gemini-embedding-001",
        contents: text,
    });
    return result.embeddings![0].values!;
}

export async function embedAndStore(questionId: string, text: string) {
    const embedding = await generateEmbedding(text);

    const { error } = await supabase
        .from('question')
        .update({ embedding })
        .eq('id', questionId);

    if (error) throw new Error(error.message);
}

export async function retrieveContext(queryText: string, k: number = 20) {
    const embedding = await generateEmbedding(queryText);

    const { data, error } = await supabase.rpc('match_questions', {
        query_embedding: embedding,
        match_count: k,
    });

    if (error) throw new Error(error.message);
    return data;
}