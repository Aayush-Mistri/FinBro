const cron = require('node-cron');
const nodemailer = require('nodemailer');
const db = require('../db/db');
const GeminiService = require('./geminiService');

// Create Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/**
 * Iterates through all users in the database, generates their weekly financial
 * insights for the last 7 days, and dispatches them via Gmail SMTP.
 */
async function runInsightJob() {
  console.log('[Insight Job] Starting weekly insight mailer job...');
  try {
    const stmt = db.prepare('SELECT id, name, email FROM users');
    const users = stmt.all();

    if (users.length === 0) {
      console.log('[Insight Job] No users found in database to send insights.');
      return;
    }

    for (const user of users) {
      try {
        console.log(`[Insight Job] Generating insights for ${user.name} (${user.email})...`);
        const insights = await GeminiService.generateInsight(user.id);

        const emailContent = `Hi ${user.name},\n\nHere is your weekly financial digest from FinSight:\n\n${insights}\n\nKeep track of your spending to secure your financial future!\n\nBest regards,\nYour FinSight Assistant`;

        const mailOptions = {
          from: `"FinSight" <${process.env.EMAIL_USER || 'no-reply@finsight.local'}>`,
          to: user.email,
          subject: 'FinSight Weekly — Your Money Pulse',
          text: emailContent
        };

        // If SMTP environment variables are missing, log the outcome and continue
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
          console.warn(
            `[Insight Job Warning] EMAIL_USER or EMAIL_PASS not set. Skipping mail delivery for ${user.email}.\nGenerated Insights:\n${insights}`
          );
          continue;
        }

        await transporter.sendMail(mailOptions);
        console.log(`[Insight Job] Email successfully sent to ${user.email}`);
      } catch (userErr) {
        console.error(`[Insight Job Error] Failed to process insights for user ${user.email}:`, userErr);
      }
    }
  } catch (jobErr) {
    console.error('[Insight Job Critical] Failed to execute runInsightJob:', jobErr);
  }
  console.log('[Insight Job] Finished weekly insight mailer job.');
}

/**
 * Initializes the weekly cron schedule.
 */
function startInsightCron() {
  // '0 9 * * 1' matches: Minute 0, Hour 9, Day of month *, Month *, Day of week 1 (Monday)
  cron.schedule('0 9 * * 1', () => {
    runInsightJob();
  });
  console.log('[Insight Job] Cron job scheduled to run every Monday at 09:00 AM');
}

module.exports = {
  startInsightCron,
  runInsightJob // Exported for manual invocation or testing
};
