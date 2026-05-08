import "dotenv/config";
import mongoose from "mongoose";

const connectionString: string | undefined = process.env.MONGODB_URI

export async function connectToMongodb() {
    if (!connectionString) {
        throw new Error("DATABASE_URL not set");
    }
    await mongoose.connect(
        connectionString
    );
    console.log("Connected to mongodb");
}

connectToMongodb();