import { generateEmbedding } from "../lib/vectorStore";
import supabase from "../lib/supabase";
const retriveContext = async (
    queryText: string,
    matchCount: number = 20
): Promise<string> => {
    const embedding = await generateEmbedding(queryText);

    const { data, error } = await supabase.rpc('match_corpus', {
        query_embedding: embedding,
        match_count: matchCount,
    });

    if (error) throw new Error(error.message);
    const contextString = data
        .map((row: any) => `[${row.subject}]\n${row.chunk_text}`)
        .join('\n\n---\n\n');
    return contextString;
}

export default retriveContext;