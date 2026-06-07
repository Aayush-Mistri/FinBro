const VPALabel = require('../models/vpaLabel');
const { validationResult } = require('express-validator');

exports.upsertLabel = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const userId = req.user.id;
  const { vpa, label, category } = req.body;

  try {
    const result = VPALabel.upsert(userId, vpa, label, category);
    return res.json({
      message: 'Label saved successfully',
      data: result
    });
  } catch (err) {
    console.error('[Labels Controller] Error upserting label:', err);
    return res.status(500).json({ error: 'Failed to save label' });
  }
};

exports.getLabels = (req, res) => {
  const userId = req.user.id;

  try {
    const labels = VPALabel.getAll(userId);
    return res.json(labels);
  } catch (err) {
    console.error('[Labels Controller] Error getting labels:', err);
    return res.status(500).json({ error: 'Failed to retrieve labels' });
  }
};

exports.deleteLabel = (req, res) => {
  const userId = req.user.id;
  const { vpa } = req.params;

  try {
    const deleted = VPALabel.delete(userId, vpa);
    if (!deleted) {
      return res.status(404).json({ error: 'Label not found for this user' });
    }
    return res.json({ message: 'Label removed successfully' });
  } catch (err) {
    console.error('[Labels Controller] Error deleting label:', err);
    return res.status(500).json({ error: 'Failed to delete label' });
  }
};
