const mongoose = require('mongoose');

const exerciseLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    workoutSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkoutSession', required: true },
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkoutExercise', required: true },
    actualSets: { type: Number, required: true },
    actualReps: { type: Number, required: true },
    actualWeight: { type: Number, default: 0 },
    rpe: { type: Number, min: 1, max: 10 }, // Rate of Perceived Exertion
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ExerciseLog', exerciseLogSchema);
