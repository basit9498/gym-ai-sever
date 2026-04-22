const express = require('express');
const router = express.Router();
const { getWalletSettings, getDashboardOverview, getUserProgress } = require('../controllers/generalController');
const { protect } = require('../middleware/auth');
const {apiPayment} = require('../middleware/apiPayment');

router.get('/wallet-settings', getWalletSettings);
router.get('/overview', protect, getDashboardOverview);
router.get('/progress', protect, apiPayment, getUserProgress);

module.exports = router;