import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

import { requireAuth } from './middleware/authMiddleware.js'
import { requireAdminRole } from './middleware/requireAdminRole.js'
import profileRoutes from './routes/profileRoutes.js'
import attendanceRoutes from './routes/attendanceRoutes.js'
import scheduleRoutes from './routes/scheduleRoutes.js'
import marksRoutes from './routes/marksRoutes.js'
import contentRoutes from './routes/contentRoutes.js'
import contactRoutes from './routes/contactRoutes.js'
import assignmentRoutes from './routes/assignmentRoutes.js'
import adminRoutes from './routes/adminRoutes.js'

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://centralized-attendance-portal.vercel.app"
  ],
  credentials: true
}));
app.use(express.json())
app.use(morgan('dev'))

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// All API routes require authentication
app.use('/api/v1/profiles', requireAuth, profileRoutes)
app.use('/api/v1/attendance', requireAuth, attendanceRoutes)
app.use('/api/v1/schedules', requireAuth, scheduleRoutes)
app.use('/api/v1/marks', requireAuth, marksRoutes)
app.use('/api/v1/content', requireAuth, contentRoutes)
app.use('/api/v1/contacts', requireAuth, contactRoutes)
app.use('/api/v1/assignments', requireAuth, assignmentRoutes)
app.use('/api/v1/admin', requireAuth, requireAdminRole, adminRoutes)


// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` })
})

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`)
  console.log(`   Health check: http://localhost:${PORT}/api/health`)
})
