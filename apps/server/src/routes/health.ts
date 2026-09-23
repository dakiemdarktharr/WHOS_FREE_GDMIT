import { Router } from "express";
import { databaseState } from "../db/connect.js";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    database: databaseState(),
  });
});

export default router;
