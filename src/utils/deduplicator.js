const Transaction = require('../models/transaction');

/**
 * Checks if a transaction already exists in the database for the given user,
 * based on the amount, VPA, and a timestamp comparison (within 60 seconds).
 * 
 * @param {number} userId - ID of the user uploading the statement.
 * @param {object} transaction - Transaction object containing amount, VPA, and timestamp.
 * @returns {boolean} - True if the transaction is a duplicate, false otherwise.
 */
function isDuplicate(userId, transaction) {
  const { amount, vpa, timestamp } = transaction;
  return Transaction.existsDuplicate(userId, amount, vpa, timestamp);
}

module.exports = { isDuplicate };
