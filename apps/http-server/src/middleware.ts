import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

export function auth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "Authorization header missing" });
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      return res.status(401).json({ message: "Token missing" });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET not configured");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload

    req.userId = decoded.userId;

    next();
  } catch (err) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}
