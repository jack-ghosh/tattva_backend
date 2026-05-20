import "dotenv/config";
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateEmbedding(text: string): Promise<number[]> {
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    return result.embedding.values;
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