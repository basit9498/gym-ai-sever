const mongoose = require('mongoose');

const mealItemSchema = new mongoose.Schema(
  {
    mealEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'MealEntry', required: true },
    foodName: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: 'g' }, // g, piece, cup, serving
    calories: { type: Number, required: true },
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fat: { type: Number, required: true },
  },
  // No timestamps needed for individual components unless required
);

module.exports = mongoose.model('MealItem', mealItemSchema);
