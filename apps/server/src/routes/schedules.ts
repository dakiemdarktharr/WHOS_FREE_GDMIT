import { Router } from "express";
import { asyncHandler, validateBody } from "../middleware/validate.js";
import { submitScheduleSchema } from "../lib/validation.js";
import { submitSchedule } from "../services/roomService.js";
import { roomMutationRateLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post(
  "/submit",
  roomMutationRateLimiter,
  validateBody(submitScheduleSchema),
  asyncHandler(async (req, res) => {
    const result = await submitSchedule(req.body);
    res.status(202).json(result);
  }),
);

export default router;
