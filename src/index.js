require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { startScheduler } = require('./services/scheduler');
const db = require('./config/db'); // Import your db module

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const authLimiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 20, 
  message: { error: 'Too many requests, please try again later' } 
});

const apiLimiter = rateLimit({ 
  windowMs: 1 * 60 * 1000, 
  max: 200,
  message: { error: 'Too many requests' }
});

app.use('/api/auth', authLimiter);
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/student', require('./routes/student'));

// Enhanced Health Check
app.get('/health', async (req, res) => {
  try {
    const dbCheck = await db.query('SELECT NOW() as time, current_database() as db_name');
    res.json({ 
      status: 'ok', 
      client: process.env.CLIENT_NAME || 'AbacusPro Academy',
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: true,
        name: dbCheck.rows[0].db_name,
        time: dbCheck.rows[0].time
      },
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      client: process.env.CLIENT_NAME || 'AbacusPro Academy',
      database: {
        connected: false,
        error: error.message
      }
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n🧮 AbacusPro Backend running on port ${PORT}`);
  console.log(`   Client: ${process.env.CLIENT_NAME || 'AbacusPro Academy'}`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend: ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);
  
  // Start scheduler
  startScheduler();
});