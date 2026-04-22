const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { ChatGroq } = require("@langchain/groq");
const { StateGraph, END, START } = require("@langchain/langgraph");
const { SystemMessage, HumanMessage, AIMessage } = require("@langchain/core/messages");
const UserProfileMemory = require("../models/UserProfileMemory");

function getLLM() {
  if (process.env.GROQ_API_KEY) {
    return new ChatGroq({ apiKey: process.env.GROQ_API_KEY, model: "openai/gpt-oss-120b"});
  }
  // return new ChatGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY || "mock", modelName: "gemini-3.1-flash-live-preview", maxOutputTokens: 4096 });
}

// Advanced State for LangGraph
const graphState = {
  messages: {
    value: (x, y) => x.concat(y),
    default: () => [],
  },
  userProfile: {
    value: (x, y) => y || x,
    default: () => ({}),
  },
  progress: {
    value: (x, y) => (y && Object.keys(y).length ? y : x),
    default: () => ({}),
  },
  intent: {
    value: (x, y) => y || x,
    default: () => "chat",
  },
  planParams: {
    value: (x, y) => y || x,
    default: () => ({}),
  },
  draftWorkoutPlan: {
    value: (x, y) => y || x,
    default: () => null,
  },
  draftMealPlan: {
    value: (x, y) => y || x,
    default: () => null,
  },
};

function heuristicWantsWorkoutPlan(text) {
  const t = String(text || '').toLowerCase();
  const action = /\b(create|build|generate|make|design|draft|give me|i need|i want|help me with|can you|set up|put together|want a|need a|looking for)\b/.test(t);
  const topic = /\b(workout|training|gym|split|ppl|push pull|upper lower|routine|exercises?|lifting|hypertrophy|strength training|leg day|arm day|chest day)\b/.test(t);
  return action && topic;
}

function heuristicWantsMealPlan(text) {
  const t = String(text || '').toLowerCase();
  const action = /\b(create|build|generate|make|design|draft|give me|i need|i want|help me with|can you|set up|put together|want a|need a|looking for)\b/.test(t);
  const topic = /\b(meal plan|nutrition plan|diet plan|macros?|meal prep|eating plan|food plan|calories|what (should|to) i eat)\b/.test(t);
  return action && topic;
}

/** Infer gymAccess from one-word / short replies (coach just asked "gym or home?"). */
function inferGymAccessFromMessage(text) {
  const raw = String(text || '').trim();
  const t = raw.toLowerCase();
  if (!t) return undefined;
  if (/^(gym|at the gym|commercial gym|fitness center|yes|yeah|yep|y)(\s|\.|!)*$/i.test(raw)) return true;
  if (/^(home|at home|no gym|garage|bodyweight|bw|apartment)(\s|\.|!)*$/i.test(t)) return false;
  if (/\b(both|gym and home)\b/i.test(t)) return true;
  return undefined;
}

function inferAllergiesFromShortMessage(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t || t.length > 80) return undefined;
  if (/^(none|no|n\/a|nothing|no allergies|no thanks)(\s|\.|!)*$/i.test(t)) return [];
  return undefined;
}

/** Source-of-truth slots after LLM extraction + short-message inference. */
function computeMissingForWorkout(profile) {
  const m = [];
  const goal = profile.goal;
  if (goal == null || goal === '' || goal === 'other') m.push('goal');
  if (!profile.workoutLevel) m.push('workoutLevel');
  if (profile.gymAccess !== true && profile.gymAccess !== false) m.push('gymAccess');
  return m;
}

function computeMissingForMeal(profile) {
  const m = [];
  if (profile.weight == null || profile.weight === '') m.push('weight');
  return m;
}

function getLastAiContent(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 2; i >= 0; i--) {
    const msg = list[i];
    if (msg instanceof AIMessage) return String(msg.content || '');
  }
  return '';
}

function conversationWantedWorkout(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m instanceof HumanMessage) {
      const c = String(m.content || '').toLowerCase();
      if (
        /\b(create|build|generate|make|give me|need a|want a|start a|design)\b/.test(c) &&
        /\b(workout|training|plan|routine|split|program|exercises?)\b/.test(c)
      ) {
        return true;
      }
    }
  }
  return false;
}

function conversationWantedMeal(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m instanceof HumanMessage) {
      const c = String(m.content || '').toLowerCase();
      if (
        /\b(create|build|generate|make|give me|need a|want a|start a|design)\b/.test(c) &&
        /\b(meal|nutrition|diet|food|eating|macros?)\b/.test(c)
      ) {
        return true;
      }
    }
  }
  return false;
}

/** User is answering a short follow-up after coach asked for equipment / access / one slot. */
function workoutSlotFollowUp(messages, lastUserContent) {
  const ai = getLastAiContent(messages).toLowerCase();
  if (!ai) return false;
  const userLen = String(lastUserContent || '').trim().length;
  if (userLen > 100) return false;
  const coachAskedWorkoutContext =
    /\b(workout|routine|plan|split|training|exercise|gym|equipment|access|weights|machine|dumbbell|barbell)\b/.test(ai);
  const coachAskedQuestion = ai.includes('?');
  return coachAskedWorkoutContext && coachAskedQuestion;
}

function mealSlotFollowUp(messages, lastUserContent) {
  const ai = getLastAiContent(messages).toLowerCase();
  if (!ai) return false;
  const userLen = String(lastUserContent || '').trim().length;
  if (userLen > 120) return false;
  const coachAskedMeal =
    /\b(meal|nutrition|diet|allerg|calorie|macro|food|eat|weight)\b/.test(ai);
  const coachAskedQuestion = ai.includes('?');
  return coachAskedMeal && coachAskedQuestion;
}

// --- Nodes ---

/**
 * Node 1: Smart Intent Analyst & Gap Analysis Engine
 * Extracts facts from EVERY message and identifies missing slots.
 */
async function analyzeIntent(state) {
  const llm = getLLM();
  const lastMessage = state.messages[state.messages.length - 1].content;
  
  const prompt = `
    You are a high-precision fitness data harvester.
    Analyze the current profile and the latest message to perform GAP ANALYSIS for fitness plans.

    PLAN REQUIREMENTS (Slot Manifest):
    - Workout Plan: goal (or goalType), workoutLevel, gymAccess (boolean if they train at home vs gym).
    - Meal Plan: goal, weight, allergies (array or empty string if none).

    Current User Profile: ${JSON.stringify(state.userProfile)}
    Latest User Message: "${lastMessage}"

    TASKS:
    1. EXTRACT: Detect any fitness facts (age, weight, goal, level, gym/home access, allergies, etc.) in the message.
    2. SLOT CHECK: Compare profile + new facts against requirements. List EXACTLY what is still missing for each plan type. Use [] if nothing missing.
    3. CONFIRMATION: isConfirmed = true only if the user is clearly agreeing to proceed (yes, sure, go ahead, sounds good, do it, lock it in) right after the coach asked to build a plan.
    4. INTENT SIGNALS: wantsWorkoutPlan = true if they are asking for a workout/program to be created or revised into a full plan. wantsMealPlan = true if they want a meal/nutrition plan. Both can be true.
    5. SCOPE CHECK: isOutOfScope = true if the latest message is completely unrelated to fitness, health, nutrition, or workouts.

    Return ONLY JSON:
    {
      "extractedFacts": {},
      "missingForWorkout": [],
      "missingForMeal": [],
      "isConfirmed": false,
      "isOutOfScope": false,
      "planType": "workout",
      "wantsWorkoutPlan": false,
      "wantsMealPlan": false,
      "planParams": {}
    }
  `;

  try {
    const response = await llm.invoke([new HumanMessage(prompt)]);
  
    let cleaned = response.content.trim();
    if (cleaned.includes('```json')) cleaned = cleaned.split('```json')[1].split('```')[0].trim();
    const result = JSON.parse(cleaned);

    const inferredFacts = {};
    const gymGuess = inferGymAccessFromMessage(lastMessage);
    if (gymGuess !== undefined) inferredFacts.gymAccess = gymGuess;
    const allergyGuess = inferAllergiesFromShortMessage(lastMessage);
    if (allergyGuess !== undefined) inferredFacts.allergies = allergyGuess;

    const extractedFacts = {
      ...(result.extractedFacts || {}),
      ...inferredFacts,
    };

    // Background DB update for any new facts found
    if (Object.keys(extractedFacts).length > 0) {
      await UserProfileMemory.findOneAndUpdate(
        { userId: state.userProfile.userId },
        { $set: extractedFacts },
        { new: true }
      );
    }

    const updatedProfile = { ...state.userProfile, ...extractedFacts };

    const missingForWorkout = computeMissingForWorkout(updatedProfile);
    const missingForMeal = computeMissingForMeal(updatedProfile);

    const lastMsgLower = lastMessage.toLowerCase();
    const savePhrases = ['save', 'lock', 'store', 'profile', 'dashboard', 'tracker', 'keep', 'persist', 'commit', 'add to my', 'add this', 'put this in'];
    const isSaveRequest = savePhrases.some((phrase) => lastMsgLower.includes(phrase));

    const wantsWorkout =
      result.wantsWorkoutPlan === true ||
      heuristicWantsWorkoutPlan(lastMessage);
    const wantsMeal =
      result.wantsMealPlan === true ||
      heuristicWantsMealPlan(lastMessage);

    const readyWorkout = missingForWorkout.length === 0;
    const readyMeal = missingForMeal.length === 0;

    const onboardingWorkout =
      conversationWantedWorkout(state.messages) &&
      workoutSlotFollowUp(state.messages, lastMessage) &&
      !state.draftWorkoutPlan;
    const onboardingMeal =
      conversationWantedMeal(state.messages) &&
      mealSlotFollowUp(state.messages, lastMessage) &&
      !state.draftMealPlan;

    let nextIntent = "chat";
    if (isSaveRequest) {
      const isBoth =
        lastMsgLower.includes('both') ||
        lastMsgLower.includes('all plans') ||
        (lastMsgLower.includes('workout') && lastMsgLower.includes('meal'));
      const isMealOnly =
        lastMsgLower.includes('meal') ||
        lastMsgLower.includes('nutrition') ||
        lastMsgLower.includes('diet') ||
        /\bfood\b/.test(lastMsgLower) ||
        lastMsgLower.includes('eat');
      const isWorkoutOnly =
        lastMsgLower.includes('workout') ||
        lastMsgLower.includes('training') ||
        lastMsgLower.includes('exercise');

      if (isBoth && (state.draftWorkoutPlan || state.draftMealPlan)) nextIntent = "exec_save_both";
      else if (isMealOnly && !isWorkoutOnly && state.draftMealPlan) nextIntent = "exec_save_meal";
      else if (isWorkoutOnly && !isMealOnly && state.draftWorkoutPlan) nextIntent = "exec_save_workout";
      else if (isMealOnly && state.draftMealPlan) nextIntent = "exec_save_meal";
      else if (isWorkoutOnly && state.draftWorkoutPlan) nextIntent = "exec_save_workout";
      else if (state.draftWorkoutPlan && state.draftMealPlan) nextIntent = "exec_save_both";
      else if (state.draftWorkoutPlan) nextIntent = "exec_save_workout";
      else if (state.draftMealPlan) nextIntent = "exec_save_meal";
      else nextIntent = "no_plan_to_save";
    } else if (result.isConfirmed && (result.planType === 'workout' || result.planType === 'meal')) {
      nextIntent = result.planType === 'workout' ? "exec_create_workout" : "exec_create_meal";
    } else if (
      readyWorkout &&
      !state.draftWorkoutPlan &&
      (wantsWorkout || onboardingWorkout)
    ) {
      nextIntent = "exec_create_workout";
    } else if (readyMeal && !state.draftMealPlan && (wantsMeal || onboardingMeal)) {
      nextIntent = "exec_create_meal";
    } else if (wantsWorkout || wantsMeal) {
      nextIntent = "propose_plan";
    }

    return {
      userProfile: updatedProfile,
      intent: nextIntent,
      planParams: {
        missingForWorkout,
        missingForMeal,
        isOutOfScope: result.isOutOfScope === true,
        ...(result.planParams || {}),
      },
    };
  } catch (e) {
    console.error("Slot Filling Analysis Error:", e);
    return { intent: "chat" };
  }
}

/**
 * Node 2: Proactive Coach (Slot-Aware & Persistence-Strict)
 */
async function coachBrain(state) {
  const llm = getLLM();
  const { missingForWorkout, missingForMeal, isOutOfScope } = state.planParams;
  
  const isReadyForWorkout = missingForWorkout?.length === 0;
  const isReadyForMeal = missingForMeal?.length === 0;

  const prog = state.progress || {};
  const progressLine = `Pending workouts (sessions to complete): ${prog.pendingWorkouts ?? 'unknown'}. Pending meal entries: ${prog.pendingMeals ?? 'unknown'}.`;

  const structuredGenNote =
    state.intent === 'exec_create_workout'
      ? `\n\nSYSTEM MODE (STRUCTURED WORKOUT): The server will generate a saveable JSON workout plan after your reply. Keep your answer under 5 short sentences—encouraging and tailored to their profile. Do NOT paste full weekly tables, exercise grids, or long lists; say the structured plan is being prepared and they can save it to the dashboard next.`
      : state.intent === 'exec_create_meal'
        ? `\n\nSYSTEM MODE (STRUCTURED MEAL PLAN): The server will generate a saveable JSON meal plan after your reply. Keep your answer brief; do not output multi-day meal tables in prose.`
        : '';

  let dynamicSystemPrompt = `You are the Gym Arc Circle AI Coach. You use a Smart Slot Filling Engine.

  STRICT PERSISTENCE RULES:
  1. ONLY refer to information in the "CURRENT PROFILE" below as "Saved in your profile".
  2. If the user just told you something, but it's not yet in the "CURRENT PROFILE", acknowledge it as "noted for this chat" and say the app will save it to their profile as facts are confirmed — do not claim it is already in the database.
  3. Treat "summaryContext" as the background memory of the user's fitness journey.

  RULES:
  1. NEVER ask a question that is already answered in the profile below.
  2. If info is missing for a plan, ask for ONE missing piece of info in a natural way.
  3. If the user is READY for a plan (missing info = 0), STOP questioning and immediately offer to build it (or confirm what you will build).
  4. At the start of substantive coaching replies, briefly reflect what you know from CURRENT PROFILE (one short sentence), then answer.
  5. Be elite, encouraging, and concise.

  LIVE DASHBOARD SNAPSHOT (from database, not guesses):
  ${progressLine}

  SUMMARY CONTEXT (Long-term Memory):
  ${state.summaryContext || "None yet."}

  CURRENT PROFILE (Source of Truth for Persistence):
  ${JSON.stringify(state.userProfile)}

  MISSING FOR WORKOUT: ${missingForWorkout?.join(', ') || 'None'}
  MISSING FOR MEAL: ${missingForMeal?.join(', ') || 'None'}

  READY STATUS:
  - Workout: ${isReadyForWorkout ? 'READY' : 'Waiting on info'}
  - Meal: ${isReadyForMeal ? 'READY' : 'Waiting on info'}

  DRAFT PLANS (Waiting to be saved to dashboard):
  - Workout: ${state.draftWorkoutPlan ? 'DRAFT_EXISTS' : 'None'}
  - Meal: ${state.draftMealPlan ? 'DRAFT_EXISTS' : 'None'}

  STRICT SCOPE RULE:
  1. You only respond to fitness, exercise, nutrition, and health-related topics.
  2. If the user asks about anything unrelated (politics, coding, jokes, general knowledge), politely state: "I'm your specialized fitness coach. I can only help you with your workout plans, meal tracking, and fitness goals. Let's get back to your training!"
  3. If isOutOfScope is true, absolutely refuse to answer the question and redirect.

  INSTRUCTIONS:
  - If DRAFT_EXISTS for a plan type, tell the user they can say "save this to my dashboard" to sync it to Workout or Meal Tracker.
  - If NO draft exists and they ask to save, explain they need a generated plan in this thread first.
  - When the system saves (exec_save), your reply should not claim success; the system adds confirmation. Prefer: "Locking that into your dashboard now…"
  ${isOutOfScope ? "\n\nCRITICAL: The user has asked an out-of-scope question. Politely decline and redirect." : ""}
  ${structuredGenNote}
  `;

  const response = await llm.invoke([
    new SystemMessage(dynamicSystemPrompt),
    ...state.messages
  ]);

  return { messages: [response] };
}

// Build Advanced Graph
const workflow = new StateGraph({ channels: graphState })
  .addNode("analyzer", analyzeIntent)
  .addNode("coach", coachBrain)
  .addEdge(START, "analyzer")
  .addEdge("analyzer", "coach")
  .addEdge("coach", END);

const app = workflow.compile();

class AIService {
  static async generateFitnessReply(userMessage, context = [], userProfile = {}, progressContext = {}) {
    const formattedContext = context.map(m => 
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    );
    // Remove the last message from context if it's the current one being sent
    const chatHistory = formattedContext.length > 0 && formattedContext[formattedContext.length-1].content === userMessage 
        ? formattedContext 
        : [...formattedContext, new HumanMessage(userMessage)];

    try {
      const state = await app.invoke({
        messages: chatHistory,
        userProfile: userProfile,
        progress: progressContext || {},
        summaryContext: userProfile.summaryContext || "",
        draftWorkoutPlan: userProfile.draftWorkoutPlan || null,
        draftMealPlan: userProfile.draftMealPlan || null,
      });

      const lastMessage = state.messages[state.messages.length - 1];
      const tokens = this.extractTokens(lastMessage);
      let text = lastMessage.content;
      const intent = state.intent || "chat";

      if (intent === "no_plan_to_save") {
        text =
          "There isn’t a generated plan stored for this chat yet, so nothing was saved to your dashboard.\n\n" +
          "**What to do:** ask me to **create** a workout or meal plan first. When you’re happy with it, say **save this to my dashboard** (or **save my meal plan** / **save my workout**).";
      }

      return {
        text,
        intent,
        planParams: state.planParams,
        tokens: tokens,
        draftWorkoutPlan: state.draftWorkoutPlan,
        draftMealPlan: state.draftMealPlan,
      };
    } catch (e) {
      console.error("AI Elite Error:", e);
      return {
        text: "I'm having trouble syncing with my memory core. Give me a second!",
        intent: "chat",
        tokens: { input: 0, output: 0, total: 0 },
      };
    }
  }

  static extractTokens(message) {
    const meta = message.response_metadata || {};
    
    // Groq Structure
    if (meta.tokenUsage) {
        return {
            input: meta.tokenUsage.promptTokens || 0,
            output: meta.tokenUsage.completionTokens || 0,
            total: meta.tokenUsage.totalTokens || 0
        };
    }
    
    // Gemini Structure
    if (meta.usageMetadata) {
        return {
            input: meta.usageMetadata.promptTokenCount || 0,
            output: meta.usageMetadata.candidatesTokenCount || 0,
            total: meta.usageMetadata.totalTokenCount || 0
        };
    }

    // Fallback/Unknown
    return { input: 0, output: 0, total: 0 };
  }

  static async generateThreadTitle(initialMessage) {
    try {
        const llm = getLLM();
        const msg = await llm.invoke([
            new SystemMessage("Generate a 3-5 word summary title for this message. No quotes."),
            new HumanMessage(initialMessage)
        ]);
        return msg.content.trim();
    } catch(e) {
        return "Chat Session";
    }
  }

  static async generateDetailedMealPlan(profile) {
    const llm = getLLM();
    let lastError = null;
    
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const prompt = `
              Create a COMPACT 3-day meal plan for: ${JSON.stringify(profile)}
              ${attempt > 1 ? `\n(Error in last attempt: ${lastError?.message}. Keep JSON valid!)` : ''}
              
              CRITICAL: EVERY food item MUST include: foodName, quantity, unit, calories, protein, carbs, fat. Do not skip any macro fields.
              Rules: Use short names. Be concise.
              Output format (ONLY JSON):
              [
                {
                  "dayName": "Day 1",
                  "meals": [
                    { "mealType": "breakfast", "title": "Oats & Berries", "items": [{ "foodName": "Oats", "quantity": 1, "unit": "cup", "calories": 150, "protein": 5, "carbs": 27, "fat": 3 }] }
                  ]
                }
              ]
            `;
            const response = await llm.invoke([new HumanMessage(prompt)]);
            const result = JSONDefense.safeParse(response.content);
            if (result.error) throw new Error(result.error);
            return result;
        } catch (e) {
            console.warn(`Meal Plan Gen Attempt ${attempt} failed:`, e.message);
            lastError = e;
            if (attempt === 3) throw e;
        }
    }
  }

  static async generateDetailedWorkoutPlan(profile) {
    const llm = getLLM();
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const prompt = `
              Create a COMPACT 7-day workout for: ${JSON.stringify(profile)}
              ${attempt > 1 ? `\n(Error in last attempt: ${lastError?.message}. Correct your JSON!)` : ''}
              
              Rules: ALL 7 days required. Be concise. 
              Format (ONLY JSON):
              {
                "workoutPlan": { "title": "Prog", "goalType": "fat_loss", "level": "beginner", "locationType": "gym", "durationWeeks": 4, "daysPerWeek": 4 },
                "sessions": [
                  { "dayNumber": 1, "dayName": "Mon", "title": "Chest", "focusArea": "Chest", "exercises": [{ "name": "Pushup", "sets": 3, "reps": "10", "weight": "0", "order": 1 }] }
                ]
              }
            `;
            const response = await llm.invoke([new HumanMessage(prompt)]);
            const result = JSONDefense.safeParse(response.content);
            if (result.error) throw new Error(result.error);
            return result;
        } catch (e) {
            console.warn(`Workout Plan Gen Attempt ${attempt} failed:`, e.message);
            lastError = e;
            if (attempt === 3) throw e;
        }
    }
  }

  static async summarizeHistory(messages, currentSummary = "") {
    try {
        const llm = getLLM();
        const historyText = messages.map(m => `${m.role}: ${m.content}`).join("\n");
        const prompt = `
          You are a fitness context summarizer. Distill the following chat history into a brief (max 100 words) summary.
          Focus on: Stated goals, preferences, physical history, and any specific requests.
          Maintain existing context: ${currentSummary}
          
          New History:
          ${historyText}
          
          Return ONLY the new summary text.
        `;
        const response = await llm.invoke([new HumanMessage(prompt)]);
        return response.content.trim();
    } catch(e) {
        return currentSummary;
    }
  }
}

/**
 * Robust JSON Parser to handle truncated or malformed LLM responses
 */
class JSONDefense {
    static safeParse(jsonString) {
        let cleaned = jsonString.trim();
        // 1. Markdown block extraction
        if (cleaned.includes('```json')) {
            cleaned = cleaned.split('```json')[1].split('```')[0].trim();
        } else if (cleaned.includes('```')) {
            cleaned = cleaned.split('```')[1].split('```')[0].trim();
        }

        try {
            return JSON.parse(cleaned);
        } catch (e) {
            console.warn("JSON Parse Error, attempting advanced repair...");
            
            // 2. Backtrack Cleaning (Strip trailing junk)
            // Remove trailing colons, commas, or partial property names at the end
            let repaired = cleaned.replace(/[:,"[{]\s*$/, "").trim();
            
            // If it ends with a comma inside an object, strip it to prevent empty-entry logic errors
            repaired = repaired.replace(/,\s*$/, "").trim();
            
            // 3. Handle Unterminated Strings
            // If we have an odd number of quotes, close the last one
            const quoteCount = (repaired.match(/"/g) || []).length;
            if (quoteCount % 2 !== 0) repaired += '"';

            // 4. Structural Repair (Stack-based)
            const stack = [];
            for (let i = 0; i < repaired.length; i++) {
                const char = repaired[i];
                if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']');
                else if (char === '}' || char === ']') {
                    if (stack.length > 0 && stack[stack.length - 1] === char) stack.pop();
                }
            }

            // Close everything in reverse order
            while (stack.length > 0) {
                repaired += stack.pop();
            }

            try {
                return JSON.parse(repaired);
            } catch (reRepairError) {
                // Last ditch: if it ends in a quote or colon, strip it further
                try {
                    let lastDitch = repaired.substring(0, Math.max(repaired.lastIndexOf(','), repaired.lastIndexOf('}'), repaired.lastIndexOf(']')) + 1).trim();
                    if (!lastDitch.endsWith('}') && !lastDitch.endsWith(']')) {
                         lastDitch = lastDitch.substring(0, Math.max(lastDitch.lastIndexOf(','), 0)).trim();
                    }
                    
                    const dStack = [];
                    for (let i = 0; i < lastDitch.length; i++) {
                        if (lastDitch[i] === '{' || lastDitch[i] === '[') dStack.push(lastDitch[i] === '{' ? '}' : ']');
                        else if (lastDitch[i] === '}' || lastDitch[i] === ']') { if (dStack.length > 0 && dStack[dStack.length-1] === lastDitch[i]) dStack.pop(); }
                    }
                    while (dStack.length > 0) lastDitch += dStack.pop();
                    return JSON.parse(lastDitch);
                } catch(finalErr) {
                    console.error("Critical JSON failure after advanced repair:", reRepairError);
                    return { error: "JSON_TRUNCATED", raw: cleaned };
                }
            }
        }
    }
}

module.exports = AIService;
