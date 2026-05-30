import "dotenv/config";
import mongoose from "mongoose";

const connectionString: string | undefined = process.env.MONGODB_URI

export async function connectToMongodb() {
    if (!connectionString) {
        throw new Error("MONGODB_URI not set");
    }
    if (mongoose.connection.readyState >= 1) return;
    try {
        await mongoose.connect(connectionString, {
            // shorten timeout for faster failure when networking/whitelist blocks access
            serverSelectionTimeoutMS: 10000,
        });
        console.log("Connected to mongodb");
    } catch (err) {
        console.error("Error connecting to MongoDB:", err);
        throw err;
    }
}
