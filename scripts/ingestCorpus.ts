import "dotenv/config";
import { PDFParse } from "pdf-parse";
import { generateEmbedding } from "../lib/vectorStore";
import { db } from "../lib/db";
import { corpus } from "../lib/schema";
import path from "path";

export async function extractTextFromPdf(pdfPath: string): Promise<string[]> {
    const parser = new PDFParse({ url: `file:///${path.resolve(pdfPath)}` });
    const result = await parser.getText();
    const chunks = chunkText(result.text);
    for (let chunk of chunks) {
        const embedding = await generateEmbedding(chunk);
        console.log(embedding);

        await db.insert(corpus).values({
            chunkText: chunk,
            subject: "Indian Constitution",
            source: pdfPath,
            embedding: `[${embedding.join(',')}]` as any,
        });
        await new Promise(r => setTimeout(r, 200));
    }
    console.log(chunks.length, chunks[1]);
    return chunks;
}

function chunkText(text: string, chunkSize: number = 500, overlap: number = 50): string[] {
    const arr = [];
    for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
        arr.push(text.slice(i, i + chunkSize))
    }
    return arr;
}


const pdfPath = process.argv[2];
extractTextFromPdf(pdfPath);
