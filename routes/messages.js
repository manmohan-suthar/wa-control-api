import express from "express";
import messagingController from "../controllers/messagingController.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

router.post("/send", authMiddleware, messagingController.sendMessage);
router.post(
  "/templates",
  authMiddleware,
  messagingController.saveMessageTemplate,
);
router.get(
  "/templates",
  authMiddleware,
  messagingController.getMessageTemplates,
);
router.delete(
  "/templates/:id",
  authMiddleware,
  messagingController.deleteMessageTemplate,
);
router.put(
  "/status/:messageId",
  authMiddleware,
  messagingController.updateMessageStatus,
);

export default router;
