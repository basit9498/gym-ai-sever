const mongoose = require("mongoose");

let isConnected = false;

const dbConfig = async () => {
    if (isConnected) return;
    
    if (!process.env.MONGODB_URI) {
        console.error("MONGODB_URI is not defined in environment variables");
        throw new Error("MONGODB_URI is not defined");
    }

    try {
        const db = await mongoose.connect(process.env.MONGODB_URI);
        isConnected = db.connections[0].readyState === 1;
        console.log("MongoDB connected successfully");
    } catch (error) {
        console.error("MongoDB connection error:", error);
        throw error;
    }
}

module.exports = dbConfig;