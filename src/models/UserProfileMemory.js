const mongoose = require('mongoose');

const userProfileMemorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    age: { type: Number },
    gender: { type: String },
    height: { type: Number }, // in cm
    weight: { type: Number }, // in kg
    bodyFat: { type: Number },
    goal: { 
      type: String, 
      enum: ['fat_loss', 'muscle_gain', 'strength', 'maintenance', 'other'],
      default: 'other' 
    },
    targetWeight: { type: Number },
    activityLevel: { 
      type: String,
      enum: ['sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extra_active'],
    },
    workoutLevel: { 
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
    },
    gymAccess: { type: Boolean },
    injuries: [{ type: String }],
    allergies: [{ type: String }],
    foodPreferences: [{ type: String }],
    sleepHours: { type: Number },
    stressLevel: { type: String },
    motivationType: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserProfileMemory', userProfileMemorySchema);
