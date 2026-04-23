const express = require("express");
require("dotenv").config();
const app = express();
const dbConfig = require("./config/dbConfig");
const cors = require("cors");

// Middlewares
app.use(cors());
app.use(express.json()); // Allow parsing of JSON request bodies

// Route imports
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const mealRoutes = require("./routes/mealRoutes");
const workoutRoutes = require("./routes/workoutRoutes");
const adminRoutes = require("./routes/adminRoutes");
const generalRoutes = require("./routes/generalRoute");
const walletRoutes = require("./routes/walletRoutes");
const userRoutes = require("./routes/userRoutes");
const { notFound, errorHandler } = require("./middleware/error");

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Gym Arc Circle Server is healthy",
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
app.use("/api/general", generalRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/meals", mealRoutes);
app.use("/api/workouts", workoutRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/users", userRoutes);

app.use(notFound);
app.use(errorHandler);

app.listen(5001, () => {
  dbConfig();
  console.log("Server is running on port 5001");
});
