require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db/db');
const { parseStatement } = require('../src/services/pdfParser');
const GeminiService = require('../src/services/geminiService');

async function main() {
  // 1. Validate Command Line Argument
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Error: Please provide the path to a sample statement PDF file.');
    console.error('Usage: node test/pdfTest.js <path-to-pdf>');
    process.exit(1);
  }

  const pdfPath = path.resolve(args[0]);
  if (!fs.existsSync(pdfPath)) {
    console.error(`Error: File not found at path "${pdfPath}"`);
    process.exit(1);
  }

  console.log(`[Test Script] Initializing test pipeline using file: ${pdfPath}`);

  // 2. Setup hardcoded mock test user (ID = 1) if not present
  try {
    const userCheck = db.prepare('SELECT id FROM users WHERE id = 1').get();
    if (!userCheck) {
      db.prepare(`
        INSERT INTO users (id, name, email, password)
        VALUES (1, 'Test User', 'testuser@finsight.local', '$2a$10$dummyhashplaceholderforpassword')
      `).run();
      console.log('[Test Script] Setup: Created mock test user with ID 1 in database.');
    }
  } catch (dbErr) {
    console.error('[Test Script] Setup Error: Failed to check/create test user:', dbErr);
    process.exit(1);
  }

  // 3. Load PDF into memory buffer
  let pdfBuffer;
  try {
    pdfBuffer = fs.readFileSync(pdfPath);
  } catch (fsErr) {
    console.error('[Test Script] File Read Error: Failed to read PDF into memory buffer:', fsErr);
    process.exit(1);
  }

  // 4. Run PDF parsing pipeline
  console.log('[Test Script] Invoking parseStatement pipeline...');
  let pipelineResult;
  try {
    pipelineResult = await parseStatement(1, pdfBuffer);
  } catch (pipelineErr) {
    console.error('[Test Script] Pipeline Error: Ingestion pipeline crashed:', pipelineErr);
    process.exit(1);
  }

  // 5. Pretty-print results
  console.log('\n==================================================');
  console.log('                 PIPELINE RESULTS                 ');
  console.log('==================================================');
  console.log(`• Extracted transactions count (total found): ${pipelineResult.total_found}`);
  console.log(`• Newly inserted transactions:                 ${pipelineResult.inserted}`);
  console.log(`• Duplicates skipped (overlapping periods):    ${pipelineResult.duplicates_skipped}`);
  console.log('==================================================\n');

  console.log('Sample of 5 Enriched and Categorized Transactions:');
  console.log(JSON.stringify(pipelineResult.sample_transactions, null, 2));
  console.log('==================================================\n');

  // 6. Run Pattern Detection Analysis
  console.log('[Test Script] Invoking Gemini pattern detection (last 90 days)...');
  try {
    const patterns = await GeminiService.detectPatterns(1);
    console.log('Detected Patterns (LLM output):');
    console.log(JSON.stringify(patterns, null, 2));
  } catch (patternErr) {
    console.error('[Test Script] Pattern Detection Error:', patternErr);
  }
  console.log('==================================================');
  console.log('              TEST EXECUTION FINISHED             ');
  console.log('==================================================');
}

main();
