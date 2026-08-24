// import { db } from "../lib/db.js";
// import { questions } from "../lib/schema.js";
// import { users } from "../lib/schema.js";

// async function seed() {
//     // await db.insert(users).values([
//     // ])
// }

// seed()

// import "dotenv/config";
// import { GoogleGenAI } from '@google/genai';

// const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY_1! });

// async function listModels() {
//     const models = await genAI.models.list();
//     for await (const model of models) {
//         console.log(model.name);
//     }
// }

// listModels();

// scripts/testEmbedDim.ts
import "dotenv/config";
import { GoogleGenAI } from '@google/genai';

const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY_1!,
    httpOptions: { apiVersion: 'v1' }
});

async function main() {
  const result = await genAI.models.embedContent({
    model: "models/gemini-embedding-001",
    contents: "test sentence",
    config: { outputDimensionality: 1536 },
  });
  console.log("Vector length:", result.embeddings![0].values!.length);
}

main().catch(console.error);