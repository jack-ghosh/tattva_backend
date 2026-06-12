import "dotenv/config";
import { GoogleGenAI } from '@google/genai';

const gemini = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});

export default gemini;

// tsx -e "
// fetch('https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY')
//   .then(r => r.json())
//   .then(d => d.models.forEach(m => console.log(m.name)))
// "