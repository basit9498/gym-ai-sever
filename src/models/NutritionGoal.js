const mongoose = require('mongoose');

const nutritionGoalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    caloriesTarget: { type: Number, required: true },
    proteinTarget: { type: Number, required: true },
    carbsTarget: { type: Number, required: true },
    fatTarget: { type: Number, required: true },
    waterTarget: { type: Number, default: 2000 }, // ml
    goalType: {
      type: String,
      enum: ['fat_loss', 'maintenance', 'muscle_gain'],
      default: 'maintenance',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NutritionGoal', nutritionGoalSchema);
