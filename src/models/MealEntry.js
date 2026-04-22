const mongoose = require('mongoose');

const mealEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // Format YYYY-MM-DD
    mealType: {
      type: String,
      enum: ['breakfast', 'lunch', 'dinner', 'snack', 'custom'],
      required: true,
    },
    title: { type: String, required: true },
    notes: { type: String, default: '' },
    totalCalories: { type: Number, default: 0 },
    totalProtein: { type: Number, default: 0 },
    totalCarbs: { type: Number, default: 0 },
    totalFat: { type: Number, default: 0 },
    planId: { type: mongoose.Schema.Types.ObjectId }, // Groups 7-day or block plans
    status: {
      type: String,
      enum: ['pending', 'completed', 'skipped', 'replaced'],
      default: 'pending',
    },
    completedAt: { type: Date },
    skippedReason: { type: String },
    generatedByAI: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Ensure a user only has one entry per mealType per date (optional, or allow multiple snacks)
// For max flexibility, we won't strictly lock unique index by type, meaning multiple 'snack' entries are allowed.
mealEntrySchema.index({ userId: 1, date: 1 });

module.exports = mongoose.model('MealEntry', mealEntrySchema);
