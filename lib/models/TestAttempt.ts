import mongoose, { Document, Schema } from "mongoose";

interface IResponse {
    questionId?: string;
    userAns?: string | null;
    isCorrect?: boolean;
    timeSpent?: number;
}

interface ITestAttempt extends Document {
    userId: string;
    examId: string;
    examType: "15MIN" | "30MIN" | "RRB";
    status: "in_progress" | "submitted" | "timed_out";
    startTime: Date;
    submittedAt?: Date;
    endTime?: Date;
    score?: number;
    correctCount?: number;
    wrongCount?: number;
    unattempted?: number;
    percentage?: number;
    timeSpent?: number;
    responses: IResponse[];
}

const TestAttemptSchema = new Schema<ITestAttempt>({
    userId: { type: String, required: true },
    examId: { type: String, required: true },
    examType: { type: String, enum: ["15MIN", "30MIN", "RRB"], default: "15MIN" },
    status: { type: String, enum: ["in_progress", "submitted", "timed_out"], default: "in_progress" },
    startTime: { type: Date, default: Date.now },
    submittedAt: { type: Date },
    endTime: { type: Date },
    score: { type: Number },
    correctCount: { type: Number },
    wrongCount: { type: Number },
    unattempted: { type: Number },
    percentage: { type: Number },
    timeSpent: { type: Number },
    responses: [{
        questionId: { type: String },
        userAns: { type: String, default: null },
        isCorrect: { type: Boolean },
        timeSpent: { type: Number },
    }],
});

const TestAttempt = (mongoose.models && mongoose.models.TestAttempt)
    ? mongoose.models.TestAttempt as mongoose.Model<ITestAttempt>
    : mongoose.model<ITestAttempt>("TestAttempt", TestAttemptSchema);

export default TestAttempt;