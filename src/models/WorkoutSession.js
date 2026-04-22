const mongoose = require('mongoose');

const workoutSessionSchema = new mongoose.Schema(
  {
    workoutPlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkoutPlan', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dayNumber: { type: Number, required: true },
    dayName: { type: String, required: true }, // e.g., 'Monday'
    title: { type: String, required: true }, // e.g., 'Upper Body'
    focusArea: { type: String, default: '' },
    estimatedMinutes: { type: Number, default: 45 },
    status: {
      type: String,
      enum: ['pending', 'completed', 'skipped'],
      default: 'pending',
    },
    completedAt: { type: Date },
    rescheduledFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkoutSession' },
    generatedByAI: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkoutSession', workoutSessionSchema);
