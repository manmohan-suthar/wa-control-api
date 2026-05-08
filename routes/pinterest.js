import express from "express";
import auth from "../middleware/auth.js";
import { searchPinterestVideos } from "../services/pinterestService.js";

const router = express.Router();

router.get("/search", auth, async (req, res) => {
  try {
    const { keyword, num, rapidapi_key } = req.query;
    const result = await searchPinterestVideos(
      keyword,
      num,
      rapidapi_key || null,
    );
    return res.json(result);
  } catch (error) {
    console.error("[PINTEREST SEARCH]", error?.message || error);
    return res.status(500).json({
      status: "error",
      message: error?.message || "Pinterest search failed",
    });
  }
});

export default router;
