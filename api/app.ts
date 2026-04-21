/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
} from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { errorMiddleware } from './lib/http.js'
import v1Routes from './routes/v1/index.js'

// load env
dotenv.config()

const app: express.Application = express()

app.use(
  cors({
    origin: process.env.APP_ORIGIN || true,
    credentials: true,
  }),
)
app.use(helmet())
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }),
)
app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Since Nginx is reverse proxying, tell express to trust proxy headers
app.set('trust proxy', 1)

/**
 * API Routes
 */
app.use('/api/v1', v1Routes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use(errorMiddleware)

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API not found' } })
})

export default app
