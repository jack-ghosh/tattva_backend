
import { generateQuestionBatch } from "../services/pipeline";

(async () => {
    try {
        console.log("Testing RAG integration...");
        const questions = await generateQuestionBatch(
            "Indian Polity",  // Topic
            5,                // Small count for quick test
            "General Awareness"
        );

        console.log(`✅ Generated ${questions.length} questions`);
        if (questions.length > 0) {
            console.log("First question:", questions[0].question);
        }
    } catch (err) {
        console.error("❌ Test failed:", err);
    }
})();