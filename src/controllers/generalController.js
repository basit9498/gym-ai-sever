const WalletSetting = require('../models/WalletSetting');
const MealEntry = require('../models/MealEntry');
const NutritionGoal = require('../models/NutritionGoal');
const WorkoutPlan = require('../models/WorkoutPlan');
const WorkoutSession = require('../models/WorkoutSession');
const WorkoutExercise = require('../models/WorkoutExercise');
const ProgressLog = require('../models/ProgressLog');
const { ChatMessage } = require('../models/Chat');
const User = require('../models/User');

const getUserProgress = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        const logs = await ProgressLog.find({ userId }).sort({ date: 1 });
        
        // Start metrics (first log or profile)
        const startWeight = logs.length > 0 ? logs[0].weight : (user.weight || 80);
        const bodyFatStart = logs.length > 0 && logs[0].bodyFat ? logs[0].bodyFat : 20;
        const muscleMassStart = logs.length > 0 && logs[0].muscleMass ? logs[0].muscleMass : 60;

        // Current metrics
        const currentWeight = user.weight || startWeight;
        const bodyFatCurrent = logs.length > 0 && logs[logs.length-1].bodyFat ? logs[logs.length-1].bodyFat : bodyFatStart - 1;
        const muscleMassCurrent = logs.length > 0 && logs[logs.length-1].muscleMass ? logs[logs.length-1].muscleMass : muscleMassStart + 0.5;

        // Goal weight (default 5kg less if not set)
        const goalWeight = user.weight ? user.weight - 5 : 75;

        // Weekly stats for chart
        // If no logs, we'll generate some historical points based on the current weight to make the chart look alive
        let weeklyStats = logs.map((l, i) => ({
            week: `W${i + 1}`,
            weight: l.weight,
            fat: l.bodyFat || 20
        }));

        if (weeklyStats.length < 2) {
             // Mock history if new user so chart isn't empty
             weeklyStats = [
                 { week: 'Start', weight: startWeight + 2, fat: bodyFatStart + 1 },
                 { week: 'Now', weight: currentWeight, fat: bodyFatCurrent }
             ];
        }

        res.status(200).json({
            success: true,
            data: {
                startWeight,
                currentWeight,
                goalWeight,
                bodyFatStart,
                bodyFatCurrent,
                muscleMassStart,
                muscleMassCurrent,
                weeklyStats
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const getDashboardOverview = async (req, res) => {
    try {
        const userId = req.user._id;
        const todayStr = new Date().toISOString().split('T')[0];
        
        // 1. Nutrition Stats
        const nutritionGoal = await NutritionGoal.findOne({ userId });
        const todayMeals = await MealEntry.find({ userId, date: todayStr });
        const caloriesConsumed = todayMeals.reduce((acc, curr) => acc + curr.totalCalories, 0);

        // 2. Workout Stats
        const activePlan = await WorkoutPlan.findOne({ userId, isActive: true });
        let todayWorkout = null;
        let exercises = [];
        
        if (activePlan) {
            // Find today's session based on day name
            const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
            todayWorkout = await WorkoutSession.findOne({ 
                workoutPlanId: activePlan._id, 
                dayName 
            });
            
            if (todayWorkout) {
                exercises = await WorkoutExercise.find({ workoutSessionId: todayWorkout._id });
            }
        }

        // 3. Weekly Trends (Last 7 Days)
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const dayNameShort = d.toLocaleDateString('en-US', { weekday: 'short' });
            
            const meals = await MealEntry.find({ userId, date: dateStr });
            const cal = meals.reduce((acc, curr) => acc + curr.totalCalories, 0);
            
            // Mock recovery/score for weekly consistency
            const score = cal > 0 ? 85 + Math.floor(Math.random() * 15) : 0; 
            
            last7Days.push({ 
                day: dayNameShort, 
                calories: cal, 
                score: score,
                consumed: cal,
                burned: cal > 0 ? Math.floor(cal * 0.3) : 0 // Simplified mock for burned
            });
        }

        // 4. AI Interaction Counts
        const aiRequests = await ChatMessage.countDocuments({ userId, role: 'ai' });

        res.status(200).json({
            success: true,
            data: {
                userStats: {
                    caloriesConsumed,
                    caloriesGoal: nutritionGoal?.caloriesTarget || 2500,
                    streak: 5, // Placeholder for streak logic
                    motivationScore: 88 // Placeholder for calculated AI score
                },
                workoutPlan: todayWorkout ? {
                    name: todayWorkout.title,
                    duration: todayWorkout.estimatedMinutes,
                    calories: 300, // Placeholder
                    exercises: exercises.map(ex => ({
                        id: ex._id,
                        name: ex.name,
                        sets: ex.sets || 3,
                        reps: ex.reps || '10-12',
                        complete: false // Need logic for completion
                    }))
                } : null,
                weeklyProgress: last7Days,
                calorieData: last7Days.map(d => ({ day: d.day, consumed: d.consumed, burned: d.burned })),
                aiRequests
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const getWalletSettings = async (req, res) => {
    try {
        const walletSettings = await WalletSetting.find();
        res.status(200).json({
            success: true,
            message: 'Wallet settings fetched successfully',
            data: walletSettings,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
}

module.exports = {
    getDashboardOverview,
    getWalletSettings,
    getUserProgress,
}