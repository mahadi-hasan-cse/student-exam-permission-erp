require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('node:path');
const { initDatabase } = require('./src/config/database');

const authRoutes = require('./src/routes/authRoutes');
const superAdminRoutes = require('./src/routes/superAdminRoutes');
const crRoutes = require('./src/routes/crRoutes');
const committeeRoutes = require('./src/routes/committeeRoutes');
const studentRoutes = require('./src/routes/studentRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize SQLite database and seed defaults
initDatabase();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static UI assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/cr', crRoutes);
app.use('/api/committee', committeeRoutes);
app.use('/api/student', studentRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'Student Exam Permission ERP',
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🎓 Student Exam Permission ERP is running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`🕒 System Time: ${new Date().toLocaleString()}`);
  console.log(`====================================================`);
});
