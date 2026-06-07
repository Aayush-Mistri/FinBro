const { parseStatement } = require('../services/pdfParser');

exports.upload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a PDF file' });
    }

    // Ensure it is a PDF
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Uploaded file must be a PDF' });
    }

    const userId = req.user.id;
    console.log(`[Transactions Controller] Starting upload processing for user ID ${userId}...`);
    
    const summary = await parseStatement(userId, req.file.buffer);
    
    return res.json({
      message: 'Statement processed successfully',
      data: summary
    });
  } catch (err) {
    console.error('[Transactions Controller] Error processing statement upload:', err);
    return res.status(500).json({ error: 'Failed to process statement. ' + err.message });
  }
};
