const mongoose = require('mongoose');

const workoutExerciseSchema = new mongoose.Schema(
  {
    workoutSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkoutSession', required: true },
    name: { type: String, required: true },
    sets: { type: Number, required: true },
    reps: { type: String, required: true }, // e.g., '10-12' or '15'
    restSeconds: { type: Number, default: 60 },
    weight: { type: String, default: 'Bodyweight' },
    notes: { type: String, default: '' },
    order: { type: Number, required: true },
    isCompleted: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending', 'completed', 'skipped'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WorkoutExercise', workoutExerciseSchema);
