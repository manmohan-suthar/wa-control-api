import express from "express";
import authMiddleware from "../middleware/auth.js";
import {
  getFlows,
  getFlow,
  createFlow,
  updateFlow,
  deleteFlow,
  getSessions,
} from "../controllers/flowController.js";
import {
  testFlowTrigger,
  getFlowExecutionHistory,
  proxyFlowApiRequest,
} from "../controllers/flowExecutionController.js";

const router = express.Router();

// Protect all routes
router.use(authMiddleware);

// Get all flows
router.get("/", getFlows);

// Get sessions for flow creation
router.get("/sessions/list", getSessions);

// Proxy API request from flow builder (CORS-safe testing)
router.post("/proxy-request", proxyFlowApiRequest);

// Get single flow
router.get("/:flowId", getFlow);

// Create flow
router.post("/", createFlow);

// Update flow
router.put("/:flowId", updateFlow);

// Delete flow
router.delete("/:flowId", deleteFlow);

// Test flow trigger
router.post("/:flowId/test-trigger", testFlowTrigger);

// Get flow execution history
router.get("/:flowId/executions", getFlowExecutionHistory);

export default router;
