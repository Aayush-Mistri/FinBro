require('dotenv').config();
const express = require('express');
const path = require('path');

// Initialize Database connection on startup
require('./src/db/db');

// Import cron scheduler
const { startInsightCron } = require('./src/services/insightJob');

// Import Routes
const authRoutes = require('./src/routes/auth');
const transactionsRoutes = require('./src/routes/transactions');
const dashboardRoutes = require('./src/routes/dashboard');
const chatRoutes = require('./src/routes/chat');
const labelsRoutes = require('./src/routes/labels');

const app = express();
const PORT = process.env.PORT || 3000;

// Standard Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount Routes
app.use('/auth', authRoutes);
app.use('/transactions', transactionsRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/chat', chatRoutes);
app.use('/labels', labelsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date() });
});

// Default 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start scheduled jobs
startInsightCron();

// Start the server
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(` FinSight Backend Server Started!       `);
  console.log(` Port: ${PORT}                          `);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`========================================`);
});
