const mongoose = require('mongoose');

const workoutPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    goalType: {
      type: String,
      enum: ['fat_loss', 'muscle_gain', 'strength', 'maintenance'],
      required: true,
    },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      required: true,
    },
    locationType: {
      type: String,
      enum: ['home', 'gym', 'mixed'],
      required: true,
    },
    daysPerWeek: { type: Number, required: true },
    durationWeeks: { type: Number, default: 4 },
    source: { type: String, default: 'ai_generated' },
    isActive: { type: Boolean, default: true },
    startDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkoutPlan', workoutPlanSchema);
