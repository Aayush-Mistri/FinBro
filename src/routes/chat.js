const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const chatController = require('../controllers/chat');

// Secure all chat endpoints
router.use(authMiddleware);

router.post(
  '/',
  [
    body('message').trim().notEmpty().withMessage('Message is required')
  ],
  chatController.sendChatMessage
);

module.exports = router;
