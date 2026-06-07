const db = require('../db/db');
const { classifyHandle } = require('../utils/upiHandleClassifier');
const truecallerjs = require('truecallerjs');
const VPALabel = require('../models/vpaLabel');

/**
 * Enriches a VPA by resolving the name and classifying the type.
 * Checks the database cache first, handles merchant names programmatically,
 * and calls truecallerjs for phone number-based personal accounts.
 * 
 * @param {number} userId - The user ID requesting lookup.
 * @param {string} vpa - The VPA string to enrich.
 * @returns {Promise<object>} - Enriched VPA details.
 */
async function enrichVpa(userId, vpa) {
  if (!vpa) {
    return { vpa: null, resolvedName: null, vpaType: 'unknown', upiHandle: null };
  }

  // 1. Check SQLite vpa_cache first
  const cacheStmt = db.prepare('SELECT * FROM vpa_cache WHERE vpa = ?');
  const cached = cacheStmt.get(vpa);
  if (cached) {
    return {
      vpa: cached.vpa,
      resolvedName: cached.resolved_name,
      vpaType: cached.vpa_type,
      upiHandle: vpa.includes('@') ? vpa.slice(vpa.indexOf('@')) : null
    };
  }

  const atIndex = vpa.indexOf('@');
  const upiHandle = atIndex !== -1 ? vpa.slice(atIndex) : null;
  const username = atIndex !== -1 ? vpa.slice(0, atIndex) : vpa;

  // Classify VPA type hint using classifier
  let vpaType = classifyHandle(upiHandle);

  // Phone number VPA regex: starts with 10 digits before @
  const phoneRegex = /^\d{10}$/;
  const isPhone = phoneRegex.test(username);

  let resolvedName = null;

  if (isPhone) {
    vpaType = 'personal';
    const phoneNumber = username;

    try {
      console.warn(`[Truecaller] Looking up number: ${phoneNumber} for VPA: ${vpa}`);
      const searchData = {
        number: phoneNumber,
        countryCode: 'IN'
      };
      const response = await truecallerjs.search(searchData);

      if (response && typeof response.getName === 'function') {
        resolvedName = response.getName();
      } else if (response && typeof response.json === 'function') {
        const jsonRes = response.json();
        resolvedName = (jsonRes.data && jsonRes.data[0] && jsonRes.data[0].name) || null;
      }
    } catch (err) {
      console.warn(`[Truecaller] Lookup failed or not logged in: ${err.message || err}`);
      resolvedName = null;
    }

    // Cache the result (even if failed/null name) to avoid repeated API requests
    const insertCache = db.prepare('INSERT OR REPLACE INTO vpa_cache (vpa, resolved_name, vpa_type) VALUES (?, ?, ?)');
    insertCache.run(vpa, resolvedName, vpaType);

    // Auto-create a vpa_label entry with category 'Peer Transfer' if name resolved
    if (resolvedName) {
      VPALabel.upsert(userId, vpa, resolvedName, 'Peer Transfer');
    }
  } else {
    // Merchant style VPA (no 10 digits before @)
    vpaType = 'merchant';
    
    // Clean: replace delimiters with space, remove numbers, trim
    let cleanedName = username
      .replace(/[.\-_]/g, ' ')
      .replace(/\d+/g, '')
      .trim();

    // Capitalize words
    if (cleanedName) {
      cleanedName = cleanedName
        .split(' ')
        .filter(word => word.length > 0)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    } else {
      cleanedName = username;
    }

    resolvedName = cleanedName;

    // Cache the merchant result
    const insertCache = db.prepare('INSERT OR REPLACE INTO vpa_cache (vpa, resolved_name, vpa_type) VALUES (?, ?, ?)');
    insertCache.run(vpa, resolvedName, vpaType);
  }

  return {
    vpa,
    resolvedName,
    vpaType,
    upiHandle
  };
}

module.exports = { enrichVpa };
