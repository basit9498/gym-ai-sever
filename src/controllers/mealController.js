const MealEntry = require('../models/MealEntry');
const MealItem = require('../models/MealItem');
const NutritionGoal = require('../models/NutritionGoal');

// @desc    Get nutrition goals
// @route   GET /api/meals/goals
// @access  Private
const getGoals = async (req, res) => {
  try {
    let goals = await NutritionGoal.findOne({ userId: req.user._id });

    // Fallback: Create default goals if none exist
    if (!goals) {
      goals = await NutritionGoal.create({
        userId: req.user._id,
        caloriesTarget: 2000,
        proteinTarget: 150,
        carbsTarget: 200,
        fatTarget: 65,
        waterTarget: 2000,
        goalType: 'maintenance',
      });
    }

    res.json(goals);
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Unable to fetch goals' });
  }
};

// @desc    Update nutrition goals
// @route   PATCH /api/meals/goals
// @access  Private
const updateGoals = async (req, res) => {
  try {
    const { caloriesTarget, proteinTarget, carbsTarget, fatTarget, waterTarget, goalType } = req.body;

    let goals = await NutritionGoal.findOne({ userId: req.user._id });

    if (goals) {
      goals.caloriesTarget = caloriesTarget || goals.caloriesTarget;
      goals.proteinTarget = proteinTarget || goals.proteinTarget;
      goals.carbsTarget = carbsTarget || goals.carbsTarget;
      goals.fatTarget = fatTarget || goals.fatTarget;
      goals.waterTarget = waterTarget || goals.waterTarget;
      goals.goalType = goalType || goals.goalType;

      const updatedGoals = await goals.save();
      res.json(updatedGoals);
    } else {
      const newGoals = await NutritionGoal.create({
        userId: req.user._id,
        caloriesTarget,
        proteinTarget,
        carbsTarget,
        fatTarget,
        waterTarget,
        goalType,
      });
      res.status(201).json(newGoals);
    }
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Unable to update goals' });
  }
};

// @desc    Get daily meals and totals
// @route   GET /api/meals/day?date=YYYY-MM-DD
// @access  Private
const getDayMeals = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: 'Date query parameter is required' });
    }

    const userId = req.user._id;

    // Fetch goals for remaining calculation
    let goals = await NutritionGoal.findOne({ userId });
    if (!goals) {
      goals = { caloriesTarget: 2000, proteinTarget: 150, carbsTarget: 200, fatTarget: 65 }; // Partial mock if none found
    }

    // Aggregation to get meals and items
    const meals = await MealEntry.find({ userId, date });
    
    // Fetch items for each meal and build grouped response
    const mealsWithItems = await Promise.all(
        meals.map(async (meal) => {
            const items = await MealItem.find({ mealEntryId: meal._id });
            return {
                ...meal.toObject(),
                items
            };
        })
    );

    // Calculate totals
    const totals = meals.reduce((acc, m) => ({
      calories: acc.calories + m.totalCalories,
      protein: acc.protein + m.totalProtein,
      carbs: acc.carbs + m.totalCarbs,
      fat: acc.fat + m.totalFat,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const remaining = {
      calories: Math.max(0, goals.caloriesTarget - totals.calories),
      protein: Math.max(0, goals.proteinTarget - totals.protein),
      carbs: Math.max(0, goals.carbsTarget - totals.carbs),
      fat: Math.max(0, goals.fatTarget - totals.fat),
    };

    const progress = {
        calories: Math.min(100, Math.round((totals.calories / goals.caloriesTarget) * 100)),
        protein: Math.min(100, Math.round((totals.protein / goals.proteinTarget) * 100)),
        carbs: Math.min(100, Math.round((totals.carbs / goals.carbsTarget) * 100)),
        fat: Math.min(100, Math.round((totals.fat / goals.fatTarget) * 100)),
    };

    res.json({
      date,
      meals: mealsWithItems,
      totals,
      remaining,
      progress,
      goals
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error: Unable to fetch daily meals' });
  }
};

// @desc    Create a meal with items
// @route   POST /api/meals
// @access  Private
const createMeal = async (req, res) => {
  try {
    const { date, mealType, title, notes, items } = req.body;

    if (!date || !mealType || !title || !items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Calculate totals from items
    const totals = items.reduce((acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      protein: acc.protein + (item.protein || 0),
      carbs: acc.carbs + (item.carbs || 0),
      fat: acc.fat + (item.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    // 1. Create Meal Entry
    const mealEntry = await MealEntry.create({
      userId: req.user._id,
      date,
      mealType,
      title,
      notes,
      totalCalories: totals.calories,
      totalProtein: totals.protein,
      totalCarbs: totals.carbs,
      totalFat: totals.fat,
    });

    // 2. Create Meal Items
    const mealItemsData = items.map(item => ({
      ...item,
      mealEntryId: mealEntry._id
    }));
    const createdItems = await MealItem.insertMany(mealItemsData);

    res.status(201).json({
      ...mealEntry.toObject(),
      items: createdItems
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error: Unable to create meal' });
  }
};

// @desc    Update meal completion status
// @route   PATCH /api/meals/status/:id
// @access  Private
const updateMealStatus = async (req, res) => {
  try {
    const { status, skippedReason } = req.body;
    const meal = await MealEntry.findOne({ _id: req.params.id, userId: req.user._id });

    if (!meal) {
      return res.status(404).json({ message: 'Meal entry not found' });
    }

    meal.status = status || meal.status;
    meal.skippedReason = skippedReason || meal.skippedReason;
    
    if (status === 'completed') {
      meal.completedAt = Date.now();
    }

    const updatedMeal = await meal.save();
    res.json(updatedMeal);
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Unable to update status' });
  }
};

// @desc    Get meal tracking history
// @route   GET /api/meals/history
// @access  Private
const getMealHistory = async (req, res) => {
  try {
    const history = await MealEntry.find({ userId: req.user._id })
      .sort({ date: -1 })
      .limit(30);
    
    const countCompleted = await MealEntry.countDocuments({ userId: req.user._id, status: 'completed' });
    const countSkipped = await MealEntry.countDocuments({ userId: req.user._id, status: 'skipped' });

    res.json({
      history,
      stats: {
        completed: countCompleted,
        skipped: countSkipped,
        total: history.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Unable to fetch history' });
  }
};

module.exports = {
  getGoals,
  updateGoals,
  getDayMeals,
  createMeal,
  updateMealStatus,
  getMealHistory,
};
