const GeminiService = require('../services/geminiService');
const { validationResult } = require('express-validator');

exports.sendChatMessage = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const userId = req.user.id;
  const { message } = req.body;

  try {
    console.log(`[Chat Controller] Processing message for user ID ${userId}...`);
    const reply = await GeminiService.chat(userId, message);
    return res.json({ reply });
  } catch (err) {
    console.error('[Chat Controller] Error processing chat message:', err);
    return res.status(500).json({ error: 'Failed to process chat message. ' + err.message });
  }
};
