import { Router, type IRouter } from "express";
import healthRouter from "./health";
import simulationsRouter from "./simulations";
import templatesRouter from "./templates";

const router: IRouter = Router();

router.use(healthRouter);
router.use(simulationsRouter);
router.use(templatesRouter);

export default router;
