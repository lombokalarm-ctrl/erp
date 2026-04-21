import { Router, type Request, type Response } from 'express'
import authRoutes from './auth.js'
import customerRoutes from './customers.js'
import productRoutes from './products.js'
import salesOrderRoutes from './sales-orders.js'
import invoiceRoutes from './invoices.js'
import paymentRoutes from './payments.js'
import receivableRoutes from './receivables.js'
import scoringRoutes from './scoring.js'
import creditRoutes from './credit.js'
import auditLogRoutes from './audit-logs.js'
import userRoutes from './users.js'
import roleRoutes from './roles.js'
import supplierRoutes from './suppliers.js'
import inventoryRoutes from './inventory.js'
import purchaseOrderRoutes from './purchase-orders.js'
import goodsReceiptRoutes from './goods-receipts.js'
import warehouseRoutes from './warehouses.js'
import reportRoutes from './reports.js'
import promoRoutes from './promos.js'
import dashboardRoutes from './dashboard.js'
import returnRoutes from './returns.js'
import settingRoutes from './settings.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/customers', customerRoutes)
router.use('/products', productRoutes)
router.use('/sales-orders', salesOrderRoutes)
router.use('/invoices', invoiceRoutes)
router.use('/payments', paymentRoutes)
router.use('/receivables', receivableRoutes)
router.use('/scoring', scoringRoutes)
router.use('/credit', creditRoutes)
router.use('/audit-logs', auditLogRoutes)
router.use('/users', userRoutes)
router.use('/roles', roleRoutes)
router.use('/suppliers', supplierRoutes)
router.use('/inventory', inventoryRoutes)
router.use('/purchase-orders', purchaseOrderRoutes)
router.use('/goods-receipts', goodsReceiptRoutes)
router.use('/warehouses', warehouseRoutes)
router.use('/reports', reportRoutes)
router.use('/promos', promoRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/returns', returnRoutes)
router.use('/settings', settingRoutes)

router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ data: { ok: true } })
})

export default router
