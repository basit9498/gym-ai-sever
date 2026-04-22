const { ChatThread, ChatMessage } = require('../models/Chat');
const UserProfileMemory = require('../models/UserProfileMemory');
const AIService = require('../services/ai.service');
const MealEntry = require('../models/MealEntry');
const MealItem = require('../models/MealItem');
const WorkoutPlan = require('../models/WorkoutPlan');
const WorkoutSession = require('../models/WorkoutSession');
const WorkoutExercise = require('../models/WorkoutExercise');
const mongoose = require('mongoose');
const { createAutomaticTransaction } = require('../helper/walletManagementHepler');
const {
  normalizeMealDraftDays,
  normalizeWorkoutDraft,
  mapExerciseForDb,
  mealTotalsFromItems,
  sanitizeWorkoutPlanPayload,
} = require('../helper/planPersistenceHelper');

// @desc    Create a new Chat Thread
// @route   POST /api/chat/thread/create
// @access  Private
const createThread = async (req, res) => {
  try {
    const thread = await ChatThread.create({
      userId: req.user._id,
      title: 'New Conversation',
    });
    res.status(201).json(thread);
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Unable to create thread' });
  }
};

// @desc    Get all chat threads for user
// @route   GET /api/chat/threads
// @access  Private
const getThreads = async (req, res) => {
  try {
    const threads = await ChatThread.find({ userId: req.user._id })
      .sort({ lastMessageAt: -1 })
      .limit(20);
    res.json(threads);
  } catch (error) {
    res.status(500).json({ message: 'Server Error: Unable to fetch threads' });
  }
};

// @desc    Get specific chat thread details
// @route   GET /api/chat/thread/:id
// @access  Private
const getThreadById = async (req, res) => {
  try {
    const thread = await ChatThread.findOne({ _id: req.params.id, userId: req.user._id });
    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }
    res.json(thread);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
};

// @desc    Send a message & get AI response
// @route   POST /api/chat/message
// @access  Private
const sendMessage = async (req, res) => {
  try {
    let { threadId, message } = req.body;

    if (!message) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    // 0. Fetch User Memory and Goals
    let userProfile = await UserProfileMemory.findOne({ userId: req.user._id });
    if (!userProfile) {
      userProfile = await UserProfileMemory.create({ userId: req.user._id });
    }

    // Auto-create thread if missing
    let thread;
    if (!threadId) {
       thread = await ChatThread.create({
         userId: req.user._id,
         title: await AIService.generateThreadTitle(message) // Smart title generator
       });
       threadId = thread._id;
    } else {
       thread = await ChatThread.findOne({ _id: threadId, userId: req.user._id });
       if (!thread) return res.status(404).json({ message: 'Thread not found' });
       
       // Update title if it's still 'New Conversation'
       if (thread.title === 'New Conversation') {
         thread.title = await AIService.generateThreadTitle(message);
       }
    }

    // 1. Save User Message
    const userMsg = await ChatMessage.create({
      threadId,
      userId: req.user._id,
      role: 'user',
      message: message,
    });

    // 2. Fetch context (last 10 messages) for AI
    const history = await ChatMessage.find({ threadId }).sort({ createdAt: -1 }).limit(10);
    const context = history.reverse().map(m => ({ role: m.role, content: m.message }));

    // 2.5 Prepare Intelligence state
    const intelligenceState = {
        ...userProfile.toObject(),
        summaryContext: thread.summaryContext || "",
        draftWorkoutPlan: thread.draftWorkoutPlan || null,
        draftMealPlan: thread.draftMealPlan || null
    };

    // 2.6 Fetch User Progress for Smart Proactive Advice
    const pendingWorkouts = await WorkoutSession.countDocuments({ userId: req.user._id, status: 'pending' });
    const pendingMeals = await MealEntry.countDocuments({ userId: req.user._id, status: 'pending' });
    const progressContext = { pendingWorkouts, pendingMeals };

    // 3. Get AI Service Response (Passing profile memory and progress)
    const aiResponse = await AIService.generateFitnessReply(message, context, intelligenceState, progressContext);

    // 3.5 EXECUTION LAYER: Dashboard Sync Aware
    let syncMetadata = {
        dashboardSyncRequired: false,
        savedWorkoutPlanId: null,
        savedMealPlanId: null,
        refreshModules: []
    };

    try {
        if (aiResponse.intent === 'exec_create_workout') {
            const detailedPlan = await AIService.generateDetailedWorkoutPlan(userProfile);
            thread.draftWorkoutPlan = detailedPlan; // Store as draft
            await thread.save();
            aiResponse.text += '\n\n---\n**Next step:** When you are happy with this plan, say **save this to my dashboard** to sync it to your **Workout** tab.';
        } 
        else if (aiResponse.intent === 'exec_create_meal') {
            const detailedPlan = await AIService.generateDetailedMealPlan(userProfile);
            thread.draftMealPlan = detailedPlan; // Store as draft
            await thread.save();
            aiResponse.text += '\n\n---\n**Next step:** When you are happy with this plan, say **save this to my dashboard** to sync it to **Meal Tracker**.';
        }
    } catch (genError) {
        console.error("Generation Exhausted Error:", genError.message);
        aiResponse.text = "⚠️ I attempted to generate your detailed plan 3 times, but encountered technical difficulties (likely exceeding output limits). \n\nPlease try again with a simpler request or check back in a moment.";
        aiResponse.intent = "chat"; // Reset intent so we don't try to save a null plan
    }

    if (aiResponse.intent === 'exec_save_workout') {
        try {
            const detailedPlan = normalizeWorkoutDraft(thread.draftWorkoutPlan);
            if (detailedPlan && detailedPlan.workoutPlan) {
                // Deactivate old plans
                await WorkoutPlan.updateMany({ userId: req.user._id }, { isActive: false });
                
                const p = sanitizeWorkoutPlanPayload(detailedPlan.workoutPlan, detailedPlan.title);
                const newPlan = await WorkoutPlan.create({
                    userId: req.user._id,
                    title: p.title,
                    goalType: p.goalType,
                    level: p.level,
                    locationType: p.locationType,
                    daysPerWeek: p.daysPerWeek,
                    durationWeeks: p.durationWeeks,
                    isActive: true
                });

                let sessionsCreated = 0;
                for (const s of (detailedPlan.sessions || [])) {
                    const sess = await WorkoutSession.create({
                        workoutPlanId: newPlan._id, userId: req.user._id,
                        dayNumber: s.dayNumber, dayName: s.dayName, title: s.title,
                        focusArea: s.focusArea || '', generatedByAI: true, status: 'pending'
                    });
                    sessionsCreated++;
                    if (s.exercises?.length) {
                        const rows = s.exercises.map((ex, idx) => ({
                            ...mapExerciseForDb(ex, idx),
                            workoutSessionId: sess._id,
                        }));
                        await WorkoutExercise.insertMany(rows);
                    }
                }

                syncMetadata.dashboardSyncRequired = true;
                syncMetadata.savedWorkoutPlanId = newPlan._id;
                syncMetadata.sessionsCreated = sessionsCreated;
                syncMetadata.refreshModules.push('workout', 'overview');

                aiResponse.text = "✅ Your workout plan has been saved successfully.\nYou can view it in:\n• Dashboard Overview\n• Workout Plan";
                thread.draftWorkoutPlan = null;
                await thread.save();
            } else {
                aiResponse.text = "❌ I couldn't find a draft workout plan to save. Please ask me to generate one first.";
            }
        } catch (error) {
            console.error("Save Workout Error:", error);
            aiResponse.text = "❌ I couldn’t save your plans right now. Please try again.";
        }
    } 
    else if (aiResponse.intent === 'exec_save_meal') {
        try {
            const detailedMeals = normalizeMealDraftDays(thread.draftMealPlan);
            if (detailedMeals && detailedMeals.length) {
                const planGroupId = new mongoose.Types.ObjectId();
                let mealEntriesCreated = 0;
                for (let i = 0; i < 7; i++) {
                    const dayData = detailedMeals[i % detailedMeals.length];
                    if (!dayData || !Array.isArray(dayData.meals)) continue;
                    const dStr = new Date(Date.now() + i*86400000).toISOString().split('T')[0];
                    for (const m of dayData.meals) {
                        const safeItems = (m.items || []).map(it => ({
                            foodName: it.foodName || 'Unknown Food',
                            quantity: it.quantity || 1, unit: it.unit || 'serving',
                            calories: it.calories || 0, protein: it.protein || 0,
                            carbs: it.carbs || 0, fat: it.fat || 0
                        }));
                        const totals = mealTotalsFromItems(safeItems);
                        const mealTypeRaw = (m.mealType || 'custom').toString().toLowerCase();
                        const mealType = ['breakfast', 'lunch', 'dinner', 'snack', 'custom'].includes(mealTypeRaw)
                          ? mealTypeRaw
                          : 'custom';
                        const entry = await MealEntry.create({ 
                            userId: req.user._id, date: dStr, 
                            mealType, title: m.title || 'Meal', 
                            planId: planGroupId, generatedByAI: true,
                            totalCalories: totals.calories,
                            totalProtein: totals.protein,
                            totalCarbs: totals.carbs,
                            totalFat: totals.fat,
                        });
                        mealEntriesCreated++;
                        
                        const itemsWithRef = safeItems.map(it => ({
                            ...it,
                            mealEntryId: entry._id,
                        }));
                        await MealItem.insertMany(itemsWithRef);
                    }
                }
                syncMetadata.dashboardSyncRequired = true;
                syncMetadata.savedMealPlanId = planGroupId;
                syncMetadata.mealEntriesCreated = mealEntriesCreated;
                syncMetadata.refreshModules.push('meal', 'overview');

                aiResponse.text = "✅ Your meal plan has been saved successfully.\nYou can view it in:\n• Dashboard Overview\n• Meal Tracker";
                thread.draftMealPlan = null;
                await thread.save();
            } else {
                aiResponse.text = "❌ I couldn't find a draft meal plan to save.";
            }
        } catch (error) {
            console.error("Save Meal Error:", error);
            aiResponse.text = "❌ I couldn’t save your plans right now. Please try again.";
        }
    }
    else if (aiResponse.intent === 'exec_save_both') {
       try {
           const detailedWorkout = normalizeWorkoutDraft(thread.draftWorkoutPlan);
           const detailedMeals = normalizeMealDraftDays(thread.draftMealPlan);
           let workoutPlanId = null;
           let mealPlanId = null;
           let sessionsCreated = 0;
           let mealEntriesCreated = 0;

           if (detailedWorkout || (detailedMeals && detailedMeals.length)) {
               if (detailedWorkout && detailedWorkout.workoutPlan) {
                   await WorkoutPlan.updateMany({ userId: req.user._id }, { isActive: false });
                   const p = sanitizeWorkoutPlanPayload(detailedWorkout.workoutPlan, detailedWorkout.title);
                   const wp = await WorkoutPlan.create({
                       userId: req.user._id, title: p.title,
                       goalType: p.goalType,
                       level: p.level,
                       locationType: p.locationType,
                       daysPerWeek: p.daysPerWeek,
                       durationWeeks: p.durationWeeks, source: 'ai_generated', isActive: true
                   });
                   workoutPlanId = wp._id;
                   for (const s of (detailedWorkout.sessions || [])) {
                       const sess = await WorkoutSession.create({ 
                           workoutPlanId: wp._id, userId: req.user._id, 
                           dayNumber: s.dayNumber, dayName: s.dayName, title: s.title, 
                           focusArea: s.focusArea || '', generatedByAI: true, status: 'pending'
                       });
                       sessionsCreated++;
                       if (s.exercises?.length) {
                           const rows = s.exercises.map((ex, idx) => ({
                               ...mapExerciseForDb(ex, idx),
                               workoutSessionId: sess._id,
                           }));
                           await WorkoutExercise.insertMany(rows);
                       }
                   }
                   thread.draftWorkoutPlan = null;
               }

                if (detailedMeals && detailedMeals.length) {
                   const planGroupId = new mongoose.Types.ObjectId();
                   mealPlanId = planGroupId;
                   for (let i = 0; i < 7; i++) {
                       const dStr = new Date(Date.now() + i*86400000).toISOString().split('T')[0];
                       const dayData = detailedMeals[i % detailedMeals.length];
                       if (!dayData || !Array.isArray(dayData.meals)) continue;
                       for (const m of dayData.meals) {
                           const safeItems = (m.items || []).map(it => ({
                               foodName: it.foodName || 'Unknown Food',
                               quantity: it.quantity || 1, unit: it.unit || 'serving',
                               calories: it.calories || 0, protein: it.protein || 0,
                               carbs: it.carbs || 0, fat: it.fat || 0
                           }));
                           const totals = mealTotalsFromItems(safeItems);
                           const mealTypeRaw = (m.mealType || 'custom').toString().toLowerCase();
                           const mealType = ['breakfast', 'lunch', 'dinner', 'snack', 'custom'].includes(mealTypeRaw)
                             ? mealTypeRaw
                             : 'custom';
                           const entry = await MealEntry.create({ 
                               userId: req.user._id, date: dStr, 
                               mealType, title: m.title || 'Meal', 
                               planId: planGroupId, generatedByAI: true,
                               totalCalories: totals.calories,
                               totalProtein: totals.protein,
                               totalCarbs: totals.carbs,
                               totalFat: totals.fat,
                           });
                           mealEntriesCreated++;
                           
                           const itemsWithRef = safeItems.map(it => ({
                               ...it,
                               mealEntryId: entry._id,
                           }));
                           await MealItem.insertMany(itemsWithRef);
                       }
                   }
                   thread.draftMealPlan = null;
               }
               
               syncMetadata.dashboardSyncRequired = true;
               syncMetadata.workoutPlanId = workoutPlanId;
               syncMetadata.mealPlanId = mealPlanId;
               syncMetadata.sessionsCreated = sessionsCreated;
               syncMetadata.mealEntriesCreated = mealEntriesCreated;
               syncMetadata.refreshModules.push('workout', 'meal', 'overview');

               aiResponse.text = "✅ Your workout and meal plans have been saved successfully.\nYou can view them in:\n• Dashboard Overview\n• Workout Plan\n• Meal Tracker";
               await thread.save();
            } else {
                aiResponse.text = "❌ I couldn't find any draft plans to save.";
            }
        } catch (error) {
            console.error("Save Both Error:", error);
            aiResponse.text = "❌ I couldn’t save your plans right now. Please try again.";
        }
    }

    // 4. Save AI Message
    const aiMsg = await ChatMessage.create({
      threadId,
      userId: req.user._id,
      role: 'ai',
      message: aiResponse.text,
      tokensUsed: aiResponse.tokens?.total || 0,
      inputTokens: aiResponse.tokens?.input || 0,
      outputTokens: aiResponse.tokens?.output || 0,
    });

    console.log(`📊 Token Audit [${aiResponse.intent}]: In: ${aiResponse.tokens?.input} | Out: ${aiResponse.tokens?.output} | Total: ${aiResponse.tokens?.total}`);

    const amount = Number(((aiResponse.tokens?.output || 0) / 1000 * 0.01).toFixed(6));
    console.log("Amount", amount);
    if(amount && typeof amount === 'number' && amount > 0){ 
     await createAutomaticTransaction({
            senderWalletAddress: req.user.walletId.address,
            amount: amount,
            userId: req.user._id,
            adminId: process.env.ADMIN_ID,
            adminWalletId: process.env.ADMIN_WALLET_ID,
            senderWalletId: req.user.walletId._id,
            purpose: "AI Tokens"
            });
          }

    // 5. Update thread timestamp & PERIODIC SUMMARIZATION
    thread.lastMessageAt = Date.now();
    
    // Check if we should summarize (every 5 messages)
    const messageCount = await ChatMessage.countDocuments({ threadId });
    if (messageCount % 5 === 0) {
        // Fetch last 10 for summarization window
        const recentHistory = await ChatMessage.find({ threadId }).sort({ createdAt: -1 }).limit(10);
        const newSummary = await AIService.summarizeHistory(recentHistory.reverse(), thread.summaryContext);
        thread.summaryContext = newSummary;
    }
    
    await thread.save();

    res.status(201).json({
      userMessage: userMsg,
      aiMessage: aiMsg,
      threadId: thread._id,
      threadTitle: thread.title,
      intent: aiResponse.intent,
      syncMetadata: syncMetadata.dashboardSyncRequired ? syncMetadata : null
    });

  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ message: 'Server Error during chat processing' });
  }
};

// @desc    Get messages for a thread
// @route   GET /api/chat/messages/:threadId
// @access  Private
const getMessages = async (req, res) => {
  try {
    const thread = await ChatThread.findOne({ _id: req.params.threadId, userId: req.user._id });
    if (!thread) return res.status(404).json({ message: 'Thread not found' });

    const messages = await ChatMessage.find({ threadId: req.params.threadId }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server Error fetching messages' });
  }
};

// @desc    Delete thread
// @route   DELETE /api/chat/thread/:id
// @access  Private
const deleteThread = async (req, res) => {
  try {
    const thread = await ChatThread.findOne({ _id: req.params.id, userId: req.user._id });
    if (!thread) return res.status(404).json({ message: 'Thread not found' });
    
    await ChatMessage.deleteMany({ threadId: thread._id });
    await ChatThread.deleteOne({ _id: thread._id });

    res.json({ message: 'Thread and messages removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createThread,
  getThreads,
  getThreadById,
  sendMessage,
  getMessages,
  deleteThread
};
