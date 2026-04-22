const WorkoutPlan = require('../models/WorkoutPlan');
const WorkoutSession = require('../models/WorkoutSession');
const WorkoutExercise = require('../models/WorkoutExercise');
const ExerciseLog = require('../models/ExerciseLog');
const { createAutomaticTransaction } = require('../helper/walletManagementHepler');
// @desc    Get active workout plan for user
// @route   GET /api/workouts/active-plan
// @access  Private
const getActivePlan = async (req, res) => {
  try {
    const plan = await WorkoutPlan.findOne({ userId: req.user._id, isActive: true });

    // await createAutomaticTransaction({
    //   senderWalletAddress: req.user.walletId.address,
    //   amount: 0.001,
    //   userId: req.user._id,
    //   adminId: process.env.ADMIN_ID,
    //   adminWalletId: process.env.ADMIN_WALLET_ID,
    //   senderWalletId: req.user.walletId._id,
    //   purpose: "workout_plan_generation"
    // });
    
    if (!plan) {
      return res.status(404).json({ message: 'No active workout plan found' });
    }

    const sessions = await WorkoutSession.find({ workoutPlanId: plan._id }).sort({ dayNumber: 1 });
    
    const sessionsWithExercises = await Promise.all(
      sessions.map(async (session) => {
        const exercises = await WorkoutExercise.find({ workoutSessionId: session._id }).sort({ order: 1 });
        return {
          ...session.toObject(),
          exercises
        };
      })
    );

    res.json({
      ...plan.toObject(),
      sessions: sessionsWithExercises
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Unable to fetch active plan' });
  }
};

// @desc    Generate a workout plan (Mock template logic)
// @route   POST /api/workouts/generate-plan
// @access  Private
const generatePlan = async (req, res) => {
  try {
    const { goalType, level, locationType, daysPerWeek } = req.body;

    if (!goalType || !level || !locationType || !daysPerWeek) {
      return res.status(400).json({ message: 'Missing required plan parameters' });
    }

    // 1. Deactivate old plans
    await WorkoutPlan.updateMany({ userId: req.user._id }, { isActive: false });

    // 2. Create New Plan
    const newPlan = await WorkoutPlan.create({
      userId: req.user._id,
      title: `${level.charAt(0).toUpperCase() + level.slice(1)} ${goalType.replace('_', ' ')} Plan`,
      goalType,
      level,
      locationType,
      daysPerWeek,
      isActive: true
    });

    // 3. Populate sessions based on daysPerWeek (Mock Template)
    const dayTemplates = [
      { dayName: 'Monday', title: 'Upper Body Power', focus: 'Chest, Back, Shoulders' },
      { dayName: 'Tuesday', title: 'Lower Body Power', focus: 'Quads, Hamstrings, Calves' },
      { dayName: 'Wednesday', title: 'Rest Day', focus: 'Recovery' },
      { dayName: 'Thursday', title: 'Upper Body Hypertrophy', focus: 'Arms, Shoulders' },
      { dayName: 'Friday', title: 'Lower Body Hypertrophy', focus: 'Glutes, Quads' },
      { dayName: 'Saturday', title: 'Active Recovery', focus: 'Mobility, Light Cardio' },
      { dayName: 'Sunday', title: 'Rest Day', focus: 'Recovery' },
    ];

    const exerciseTemplates = [
      { name: 'Bench Press', sets: 3, reps: '8-10', weight: 'BW + 20kg', order: 1 },
      { name: 'Lat Pulldowns', sets: 3, reps: '10-12', weight: 'BW + 15kg', order: 2 },
      { name: 'Shoulder Press', sets: 3, reps: '12', weight: 'BW + 10kg', order: 3 },
    ];

    for (let i = 0; i < Math.min(daysPerWeek, 7); i++) {
        const session = await WorkoutSession.create({
            workoutPlanId: newPlan._id,
            userId: req.user._id,
            dayNumber: i + 1,
            dayName: dayTemplates[i].dayName,
            title: dayTemplates[i].title,
            focusArea: dayTemplates[i].focus,
            status: 'pending'
        });

        if (dayTemplates[i].focus !== 'Recovery') {
            const exercises = exerciseTemplates.map((ex, idx) => ({
                ...ex,
                workoutSessionId: session._id,
                order: idx + 1
            }));
            await WorkoutExercise.insertMany(exercises);
        }
    }

    res.status(201).json(newPlan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error: Unable to generate plan' });
  }
};

// @desc    Log exercise performance
// @route   POST /api/workouts/log-exercise
// @access  Private
const logExercise = async (req, res) => {
  try {
    const { workoutSessionId, exerciseId, actualSets, actualReps, actualWeight, rpe, notes } = req.body;

    const log = await ExerciseLog.create({
      userId: req.user._id,
      workoutSessionId,
      exerciseId,
      actualSets,
      actualReps,
      actualWeight,
      rpe,
      notes
    });

    // Mark exercise as completed in the session definition
    await WorkoutExercise.findByIdAndUpdate(exerciseId, { isCompleted: true });

    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Unable to log exercise' });
  }
};

// @desc    Complete a workout session
// @route   PATCH /api/workouts/session/:id/complete
// @access  Private
const completeSession = async (req, res) => {
  try {
    const session = await WorkoutSession.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { status: 'completed', completedAt: Date.now() },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Unable to complete session' });
  }
};

// @desc    Get workout tracking history
// @route   GET /api/workouts/history
// @access  Private
const getWorkoutHistory = async (req, res) => {
  try {
    const historicalPlans = await WorkoutPlan.find({ userId: req.user._id }).sort({ createdAt: -1 });
    
    const countCompletedSessions = await WorkoutSession.countDocuments({ 
        userId: req.user._id, 
        status: 'completed' 
    });

    res.json({
        plans: historicalPlans,
        stats: {
            completedSessions: countCompletedSessions
        }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Unable to fetch workout history' });
  }
};

module.exports = {
  getActivePlan,
  generatePlan,
  logExercise,
  completeSession,
  getWorkoutHistory
};
