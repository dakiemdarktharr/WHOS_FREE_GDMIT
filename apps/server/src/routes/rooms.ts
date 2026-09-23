import { Router } from "express";
import { asyncHandler, validateBody } from "../middleware/validate.js";
import { createRoomSchema, joinRoomSchema, roomCodeSchema } from "../lib/validation.js";
import { createRoom, getRoomResult, joinRoom } from "../services/roomService.js";
import { AppError } from "../middleware/error.js";

const router = Router();

router.post(
  "/create",
  validateBody(createRoomSchema),
  asyncHandler(async (req, res) => {
    const result = await createRoom(req.body);
    res.status(201).json(result);
  }),
);

router.post(
  "/join",
  validateBody(joinRoomSchema),
  asyncHandler(async (req, res) => {
    const result = await joinRoom(req.body);
    res.status(200).json(result);
  }),
);

router.get(
  "/:roomCode/result",
  asyncHandler(async (req, res) => {
    const parsed = roomCodeSchema.safeParse(req.params.roomCode);
    if (!parsed.success) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Room code must be exactly five numeric characters.",
        { roomCode: "Invalid room code." },
      );
    }
    const result = await getRoomResult(parsed.data);
    res.status(200).json(result);
  }),
);

export default router;
