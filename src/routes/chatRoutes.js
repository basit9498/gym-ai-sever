const express = require('express');
const router = express.Router();
const {
  createThread,
  getThreads,
  getThreadById,
  sendMessage,
  getMessages,
  deleteThread
} = require('../controllers/chatController');
const { protect } = require('../middleware/auth');
const { apiPayment } = require('../middleware/apiPayment');

router.use(protect,apiPayment); // Secure all chat routes

router.post('/thread/create', createThread);
router.get('/threads', getThreads);
router.get('/thread/:id', getThreadById);
router.delete('/thread/:id', deleteThread);

router.post('/message', sendMessage);
router.get('/messages/:threadId', getMessages);

module.exports = router;
