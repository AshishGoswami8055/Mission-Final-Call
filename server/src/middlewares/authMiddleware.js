import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

/** @returns {string|null} JWT from `Authorization: Bearer …` header */
export const parseBearerToken = (authHeader) => {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1]?.trim();
  return token || null;
};

/**
 * Verify JWT and load admin (injectable lookup for tests).
 * @param {string} token
 * @param {(id: string) => Promise<object|null>} [findAdminById]
 */
export const verifyAdminFromToken = async (
  token,
  findAdminById = (id) => Admin.findById(id).select("-password")
) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const admin = await findAdminById(decoded.id);
  if (!admin) {
    const err = new Error("Invalid token user");
    throw err;
  }
  return admin;
};

const protect = async (req, res, next) => {
  try {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = await verifyAdminFromToken(token);
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

export default protect;
