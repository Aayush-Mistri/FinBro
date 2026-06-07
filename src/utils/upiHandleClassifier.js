/**
 * Classifies a UPI handle or VPA suffix as 'personal', 'merchant', or 'unknown'.
 * 
 * @param {string} handleOrVpa - The VPA string or UPI handle suffix.
 * @returns {string} - 'personal' | 'merchant' | 'unknown'
 */
function classifyHandle(handleOrVpa) {
  if (!handleOrVpa) return 'unknown';

  let handle = handleOrVpa;
  const atIndex = handleOrVpa.indexOf('@');
  if (atIndex !== -1) {
    handle = handleOrVpa.slice(atIndex);
  }

  if (!handle.startsWith('@')) {
    handle = '@' + handle;
  }

  handle = handle.toLowerCase().trim();

  // Personal handles (PhonePe personal, direct bank handles, etc.)
  const personalHandles = [
    '@ybl', '@ibl', '@axl', '@rajgovhdfcbank',
    '@hdfc', '@sbi', '@icici', '@axis', '@kotak'
  ];

  // Merchant handles (Google Pay merchant handles, etc.)
  const merchantHandles = [
    '@okicici', '@oksbi', '@okaxis', '@okhdfcbank'
  ];

  if (personalHandles.includes(handle)) {
    return 'personal';
  }

  if (merchantHandles.includes(handle)) {
    return 'merchant';
  }

  // @paytm and others are classified as unknown
  return 'unknown';
}

module.exports = { classifyHandle };
