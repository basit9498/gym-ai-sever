const ALLOWED_GOALS = ['fat_loss', 'muscle_gain', 'strength', 'maintenance'];
const ALLOWED_LEVELS = ['beginner', 'intermediate', 'advanced'];
const ALLOWED_LOCATIONS = ['home', 'gym', 'mixed'];

function normalizeGoalType(g) {
  if (!g) return 'maintenance';
  const x = String(g).toLowerCase().trim().replace(/\s+/g, '_');
  if (ALLOWED_GOALS.includes(x)) return x;
  if (x.includes('fat')) return 'fat_loss';
  if (x.includes('muscle') || x.includes('bulk')) return 'muscle_gain';
  if (x.includes('strength')) return 'strength';
  return 'maintenance';
}

function normalizeLevel(l) {
  if (!l) return 'beginner';
  const x = String(l).toLowerCase().trim();
  return ALLOWED_LEVELS.includes(x) ? x : 'beginner';
}

function normalizeLocation(l) {
  if (!l) return 'gym';
  const x = String(l).toLowerCase().trim();
  return ALLOWED_LOCATIONS.includes(x) ? x : 'gym';
}

/**
 * Meal draft from AI may be an array of day objects, a single day, or malformed.
 */
function normalizeMealDraftDays(raw) {
  if (!raw || typeof raw === 'object' && raw.error) return null;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    const first = raw[0];
    if (first && Array.isArray(first.meals)) return raw;
    if (first && first.mealType && first.title) {
      return [{ dayName: 'Day 1', meals: raw }];
    }
    return null;
  }
  if (raw.meals && Array.isArray(raw.meals)) {
    return [{ dayName: raw.dayName || 'Day 1', meals: raw.meals }];
  }
  return null;
}

/**
 * Workout draft must expose .workoutPlan and .sessions for persistence.
 */
function normalizeWorkoutDraft(raw) {
  if (!raw || typeof raw !== 'object' || raw.error) return null;
  if (raw.workoutPlan && Array.isArray(raw.sessions)) return raw;
  if (Array.isArray(raw.sessions) && raw.title) {
    return {
      workoutPlan: {
        title: raw.title,
        goalType: raw.goalType || 'maintenance',
        level: raw.level || 'beginner',
        locationType: raw.locationType || 'gym',
        daysPerWeek: raw.daysPerWeek || raw.sessions.length || 4,
        durationWeeks: raw.durationWeeks || 4,
      },
      sessions: raw.sessions,
    };
  }
  return null;
}

function mapExerciseForDb(ex, idx) {
  const sets = Number(ex.sets);
  const order = Number(ex.order) || idx + 1;
  return {
    name: ex.name || ex.exercise || ex.title || 'Exercise',
    sets: Number.isFinite(sets) && sets > 0 ? sets : 3,
    reps: ex.reps != null ? String(ex.reps) : '10',
    weight: ex.weight != null ? String(ex.weight) : '0',
    order,
    restSeconds: ex.restSeconds != null ? Number(ex.restSeconds) : 60,
    notes: ex.notes || '',
  };
}

function mealTotalsFromItems(items) {
  return (items || []).reduce(
    (acc, it) => ({
      calories: acc.calories + (Number(it.calories) || 0),
      protein: acc.protein + (Number(it.protein) || 0),
      carbs: acc.carbs + (Number(it.carbs) || 0),
      fat: acc.fat + (Number(it.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

function sanitizeWorkoutPlanPayload(p, fallbackTitle) {
  return {
    title: (p && p.title) || fallbackTitle || 'AI Workout Plan',
    goalType: normalizeGoalType(p && p.goalType),
    level: normalizeLevel(p && p.level),
    locationType: normalizeLocation(p && p.locationType),
    daysPerWeek: Math.min(7, Math.max(1, Number(p && p.daysPerWeek) || 4)),
    durationWeeks: Math.min(52, Math.max(1, Number(p && p.durationWeeks) || 4)),
  };
}

module.exports = {
  normalizeGoalType,
  normalizeLevel,
  normalizeLocation,
  normalizeMealDraftDays,
  normalizeWorkoutDraft,
  mapExerciseForDb,
  mealTotalsFromItems,
  sanitizeWorkoutPlanPayload,
};
