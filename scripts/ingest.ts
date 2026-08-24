// import { topics } from "../data/rrb-ntpc-ug/topics";
// import { generateQuestionBatch } from "../services/pipeline";

// (async () => {
//     let processed = 41;
//     //resononing 12 topics done math have to recheck

//     for (const { subject, topic } of topics.slice(41)) {
//         try {
//             console.log(`[${processed + 1}/${topics.length}] Generating: ${subject} → ${topic}`);
//             await generateQuestionBatch(topic, 25, subject);
//             processed++;
//             await new Promise(res => setTimeout(res, 2000));
//         } catch (err: any) {
//             if (err?.message === 'GEMINI_QUOTA_EXCEEDED') {
//                 console.log(`\nGemini quota hit after ${processed} topics.`);
//                 console.log(`Resume tomorrow from topic index: ${processed}`);
//                 console.log(`Next topic: ${topics[processed].subject} → ${topics[processed].topic}`);
//                 break;
//             }
//             if (err?.message === 'GROQ_RATE_LIMIT_EXCEEDED') {
//                 console.log(`Groq daily token limit hit after ${processed} topics.`);
//                 console.log(`Resume tomorrow from: topics.slice(${processed})`);
//                 break;
//             }
//             console.log(`Topic failed: ${topic}`, err.message);
//         }
//     }

//     console.log(`Done. ${processed} topics processed today.`);
// })();