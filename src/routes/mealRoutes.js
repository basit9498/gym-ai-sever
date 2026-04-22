const express = require('express');
const router = express.Router();
const {
  getGoals,
  updateGoals,
  getDayMeals,
  createMeal,
  updateMealStatus,
  getMealHistory,
} = require('../controllers/mealController');
const { protect } = require('../middleware/auth');
const { apiPayment } = require('../middleware/apiPayment');

router.use(protect,apiPayment);

router.get('/goals', getGoals);
router.patch('/goals', updateGoals);
router.get('/day', getDayMeals);
router.post('/', createMeal);
router.patch('/status/:id', updateMealStatus);
router.get('/history', getMealHistory);

module.exports = router;
