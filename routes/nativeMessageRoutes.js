import express from "express";
import { sendNativeMessage } from "../controllers/nativeMessageController.js";

const router = express.Router();

router.post("/api/messages/send-native", sendNativeMessage);

export default router;
