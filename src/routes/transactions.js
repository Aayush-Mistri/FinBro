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
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Uploaded file must be a PDF'));
    }
    cb(null, true);
  }
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'PDF file is too large. Maximum size is 10MB.' });
    }

    return res.status(400).json({ error: err.message || 'Invalid upload request.' });
  });
}

// Secure all transactions endpoints
router.use(authMiddleware);

router.post('/upload', handleUpload, transactionsController.upload);

module.exports = router;
