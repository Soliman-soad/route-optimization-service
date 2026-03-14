import { Router } from "express";
import { getOptimization, optimizeRoute } from "../controllers/optimize.controller";

const router = Router();

router.post("/", optimizeRoute);
router.get("/:id", getOptimization);

export default router;