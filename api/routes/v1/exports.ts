import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { authenticate, authorizeAny } from "../../middlewares/auth.js";
import {
  exportProfitLossReport,
  exportReplenishmentReport,
  exportSalesReport,
  exportStockReport,
} from "../../services/exportService.js";

const router = Router();

const formatSchema = z.enum(["xlsx", "pdf"]);

router.get(
  "/stocks",
  authenticate,
  authorizeAny(["reports:read"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          q: z.string().optional(),
          format: formatSchema,
        })
        .parse(req.query);

      const file = await exportStockReport({
        q: query.q,
        format: query.format ?? "xlsx",
      });
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
      res.send(file.buffer);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/sales",
  authenticate,
  authorizeAny(["reports:read"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          format: formatSchema,
        })
        .parse(req.query);

      const file = await exportSalesReport({
        startDate: query.startDate,
        endDate: query.endDate,
        format: query.format ?? "xlsx",
      });
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
      res.send(file.buffer);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/profit-loss",
  authenticate,
  authorizeAny(["reports:read"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          format: formatSchema,
        })
        .parse(req.query);

      const file = await exportProfitLossReport({
        startDate: query.startDate,
        endDate: query.endDate,
        format: query.format ?? "xlsx",
      });
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
      res.send(file.buffer);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/replenishment",
  authenticate,
  authorizeAny(["reports:read", "inventory:read", "purchasing:read"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = z
        .object({
          warehouseId: z.string().uuid().optional(),
          q: z.string().optional(),
          format: formatSchema,
        })
        .parse(req.query);

      const file = await exportReplenishmentReport({
        warehouseId: query.warehouseId,
        q: query.q,
        format: query.format ?? "xlsx",
      });
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
      res.send(file.buffer);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
