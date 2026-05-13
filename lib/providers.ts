import "dotenv/config";

type Provider = {
    name: string,
    apiKey: string,
    exhausted: boolean,
}

const groqProviders: Provider[] = [
    { name: 'groq_1', apiKey: process.env.GROQ_API_KEY_1!, exhausted: false },
    { name: 'groq_2', apiKey: process.env.GROQ_API_KEY_2!, exhausted: false },
    { name: 'groq_3', apiKey: process.env.GROQ_API_KEY_3!, exhausted: false },
];

const geminiProviders: Provider[] = [
    { name: 'gemini_1', apiKey: process.env.GEMINI_API_KEY_1!, exhausted: false },
    { name: 'gemini_2', apiKey: process.env.GEMINI_API_KEY_2!, exhausted: false },
];

export function getActiveGroqKey(): string {
    const provider = groqProviders.find(p => !p.exhausted);
    if (!provider) throw new Error("GROQ_ALL_KEYS_EXHAUSTED");
    return provider.apiKey;
}

export function exhaustGroqKey(apiKey: string) {
    const provider = groqProviders.find(p => p.apiKey === apiKey);
    if (provider) provider.exhausted = true;
    console.log(`Key exhauted :${provider?.name}`);
}

export function getActiveGeminiKey(): string {
    const provider = geminiProviders.find(p => !p.exhausted);
    if (!provider) throw new Error("GEMINI_ALL_KEYS_EXHAUSTED");
    return provider.apiKey;
}

export function exhaustGeminiKey(apiKey: string) {
    const provider = geminiProviders.find(p => p.apiKey === apiKey);
    if (provider) provider.exhausted = true;
    console.log(`Key exhauted :${provider?.name}`);
}