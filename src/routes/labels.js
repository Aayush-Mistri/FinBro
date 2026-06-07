const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const labelsController = require('../controllers/labels');

// Secure all labels endpoints
router.use(authMiddleware);

router.post(
  '/',
  [
    body('vpa').trim().notEmpty().withMessage('VPA is required'),
    body('label').trim().notEmpty().withMessage('Label is required'),
    body('category').trim().notEmpty().withMessage('Category is required')
  ],
  labelsController.upsertLabel
);

router.get('/', labelsController.getLabels);

router.delete('/:vpa', labelsController.deleteLabel);

module.exports = router;
