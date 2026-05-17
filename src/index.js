require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { startScheduler } = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many requests' } }));
app.use('/api/', rateLimit({ windowMs: 1 * 60 * 1000, max: 200 }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/student', require('./routes/student'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', client: process.env.CLIENT_NAME }));

// Start
app.listen(PORT, () => {
  console.log(`\n🧮 AbacusPro Backend running on port ${PORT}`);
  console.log(`   Client: ${process.env.CLIENT_NAME || 'AbacusPro Academy'}`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}\n`);
  startScheduler();
});
