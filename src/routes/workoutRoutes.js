const express = require('express');
const router = express.Router();
const {
  getActivePlan,
  generatePlan,
  logExercise,
  completeSession,
  getWorkoutHistory,
} = require('../controllers/workoutController');
const { protect } = require('../middleware/auth');
const { apiPayment } = require('../middleware/apiPayment');

router.use(protect,apiPayment);

router.get('/active-plan', getActivePlan);
router.post('/generate-plan', generatePlan);
router.post('/log-exercise', logExercise);
router.patch('/session/:id/complete', completeSession);
router.get('/history', getWorkoutHistory);

module.exports = router;
