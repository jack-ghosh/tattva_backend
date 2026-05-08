import mongoose from "mongoose";

const TestAttempt = new mongoose.Schema({
    userId: {
        type: String,
    },
    examId: {
        type: String,
    },
    startTime: {
        type: Date,
        default: Date.now,
    },
    endTime: {
        type: Date,
        default: Date.now,
    },
    score: {
        type: Number,
    },
    responses: [{
        questionId: {
            type: String,
        },
        userAns: {
            type: String,
        },
        isCorrect: {
            type: Boolean,
        },
        timeSpent: {
            type: Number,
        }
    }]
});

export const Test = mongoose.model("Test", TestAttempt);