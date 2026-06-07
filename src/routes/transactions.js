const express = require('express');
const router = express.Router();
const multer = require('multer');
const authMiddleware = require('../middleware/auth');
const transactionsController = require('../controllers/transactions');

// Configure multer for memory storage only (never writes to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // limit 10MB
  }
});

// Secure all transactions endpoints
router.use(authMiddleware);

router.post('/upload', upload.single('file'), transactionsController.upload);

module.exports = router;
