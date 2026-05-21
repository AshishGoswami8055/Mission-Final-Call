import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

/**
 * Auth for media streaming endpoints where <video>/<iframe> cannot send Authorization headers.
 * Accepts Bearer token or ?token= query param.
 */
const protectStream = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = req.query?.token;
    const rawToken = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : queryToken;

    if (!rawToken) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(rawToken, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) {
      return res.status(401).json({ message: "Invalid token user" });
    }

    req.user = admin;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export default protectStream;
