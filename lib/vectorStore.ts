import "dotenv/config";
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import WebSocket from 'ws';
import { getActiveGeminiKey, exhaustGeminiKey, getGeminiKeyName } from './providers';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
        realtime: {
            transport: WebSocket as any,
        }
    }
);

function isRateLimitError(err: any): boolean {
    const status = err?.status ?? err?.code ?? err?.response?.status;
    const message = String(err?.message ?? "").toLowerCase();
    return status === 429 || message.includes("quota") || message.includes("rate limit") || message.includes("resource_exhausted");
}

export async function generateEmbedding(text: string): Promise<number[]> {
    while (true) {
        const apiKey = getActiveGeminiKey(); // throws GEMINI_ALL_KEYS_EXHAUSTED if none left

        try {
            const genAI = new GoogleGenAI({
                apiKey,
                httpOptions: { apiVersion: 'v1' }
            });

            const result = await genAI.models.embedContent({
                model: "models/gemini-embedding-001",
                contents: text,
                config: { outputDimensionality: 1536 },
            });

            return result.embeddings![0].values!;
        } catch (err) {
            if (isRateLimitError(err)) {
                console.log(`⚠️  Rate limit hit on ${getGeminiKeyName(apiKey)}, rotating...`);
                exhaustGeminiKey(apiKey);
                continue; // retry with next key
            }
            throw err; // real error, don't swallow it
        }
    }
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

export async function findSimilarQuestion(text: string, threshold: number = 0.93) {
    const embedding = await generateEmbedding(text);

    const { data, error } = await supabase.rpc('match_questions', {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: 1,
    });

    if (error) throw new Error(error.message);

    return { embedding, match: data?.[0] ?? null };
}