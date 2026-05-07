import express from "express";
import {
  createCampaign,
  deleteCampaign,
  listCampaigns,
  getCampaign,
  retryReel,
  deleteReel,
} from "../controllers/reelCampaignController.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.post("/", auth, createCampaign);
router.get("/", auth, listCampaigns);
router.get("/:id", auth, getCampaign);
router.delete("/:id", auth, deleteCampaign);
router.post("/reel/:id/retry", auth, retryReel);
router.delete("/reel/:id", auth, deleteReel);

export default router;
