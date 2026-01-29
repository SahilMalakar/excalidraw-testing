import dotenv from "dotenv";
dotenv.config();

import WebSocket, { WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";

if (!process.env.JWT_SECRET || !process.env.PORT) {
  throw new Error("❌ variables missing in environment variables");
}

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = Number(process.env.PORT);

const wss = new WebSocketServer({ port: PORT });

// ------------------------
// STATE MANAGEMENT LAYER
// ------------------------

// Since websocket is a STATEFUL protocol (connection remains open),
// we MUST maintain in-memory state of connected users.
// If we don't store connection state, we cannot:
//  - broadcast messages
//  - track which user is connected
//  - know which rooms a user has joined
//  - implement chat room logic

// TODO (SCALING):
// In production, this in-memory array will NOT work for:
//   - multi-instance deployments
//   - horizontal scaling
//   - high availability systems
//
// We must replace this with:
//   - Redis (for pub/sub + shared state)
//   - or message brokers (Kafka / NATS / RabbitMQ)

interface UsersType {
  ws: WebSocket; // WebSocket connection instance
  rooms: string[]; // List of rooms user has joined
  userId: string; // Authenticated userId
}

const users: UsersType[] = [];

// --------------------------------
// AUTH VALIDATION HELPER FUNCTION
// --------------------------------

// This function validates JWT and extracts userId
// It makes authentication reusable and keeps
// websocket connection logic clean.

// TODO (SECURITY):
// Move authentication logic to:
//   - HttpOnly cookie based JWT
//   - OR WS AUTH handshake message
// Query param JWT should only be used for dev/testing.

function checkUser(token: string): string | null {
  try {
    if (!token) return null;
  
    let decoded: JwtPayload;
  
    try {
      decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    } catch {
      return null;
    }
  
    // TODO (VALIDATION):
    // Add stricter schema validation using zod / yup
    // Validate:
    //   - token payload shape
    //   - token expiry
    //   - user existence in DB
  
    if (!decoded || typeof decoded !== "object" || !decoded.userId) {
      return null;
    }
  
    return decoded.userId;
  } catch (error) {
    return null;
  }
}

// --------------------------------
// WEBSOCKET CONNECTION HANDLER
// --------------------------------

wss.on("connection", function connection(ws, request) {
  try {
    const url = request.url;

    // TODO (SECURITY):
    // Replace query param token auth with:
    //   - cookie-based JWT
    //   - OR initial AUTH message protocol

    if (!url || !url.includes("?")) {
      ws.close(1008, "Missing query parameters");
      return;
    }

    const queryParams = new URLSearchParams(url.split("?")[1]);
    const token = queryParams.get("token") || "";

    const userId = checkUser(token);

    if (!userId) {
      ws.close(1008, "Invalid or expired token");
      return;
    }

    // TODO (DB INTEGRATION):
    // Validate user existence from database
    // Example:
    //   await prisma.user.findUnique({ where: { id: userId } })

    // ---------------- ARCHITECTURE THOUGHT PROCESS ----------------
    //
    // 1. Can a single user join only one room at a time?
    //    -> Example: Zoom call (single active room)
    //
    // 2. Can a single user join multiple rooms at a time?
    //    -> Example: Slack / Discord (multiple channels)
    //
    // For chat systems → multiple room membership is more flexible.
    // So we design rooms[] as an array.
    //
    // TODO (DESIGN):
    // Decide:
    //   - Max room limit per user?
    //   - Room join permissions?
    //   - Private vs public rooms?
    //
    // --------------------------------------------------------------

    // ---------------- STATE MANAGEMENT STRATEGY -------------------
    //
    // 1. Store users in an in-memory array  --> SIMPLE but NOT scalable
    // 2. Global state using Redux / Recoil  --> Overkill for backend
    // 3. Singleton + Redis pub/sub          --> PRODUCTION GRADE
    //
    // TODO (SCALING):
    // Replace in-memory array with Redis:
    //   - Redis SET for room members
    //   - Redis HASH for connection state
    //   - Redis PUB/SUB for broadcasting across nodes
    //
    // --------------------------------------------------------------

    users.push({
      userId,
      rooms: [],
      ws,
    });

    ws.on("message", function message(data) {
      let parsedData: any;

      // TODO (SECURITY):
      // Add payload validation using zod schema
      // Validate:
      //   - message type
      //   - roomId format
      //   - message length (prevent abuse)
      //   - rate limiting

      try {
        parsedData = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      if (parsedData.type === "join_room") {
        const user = users.find((x) => x.ws === ws);
        if (!user) return;

        // TODO (DB CHECK):
        // Validate room existence from DB
        // Example:
        //   await prisma.room.findUnique({ where: { id: parsedData.roomId } })

        if (!user.rooms.includes(parsedData.roomId)) {
          user.rooms.push(parsedData.roomId);
        }
      }

      if (parsedData.type === "leave_room") {
        const user = users.find((x) => x.ws === ws);
        if (!user) return;

        user.rooms = user.rooms.filter((x) => x !== parsedData.roomId);

        // TODO (ANALYTICS):
        // Track room exit metrics
      }

      if (parsedData.type === "chat") {
        const roomId = parsedData.roomId;
        const message = parsedData.message;

        // TODO (VALIDATION):
        // Enforce:
        //   - max message length
        //   - profanity filter
        //   - spam detection
        //   - rate limiting

        // TODO (PERSISTENCE):
        // Store message in DB
        // Example:
        //   prisma.chat.create({ data: { roomId, userId, message } })

        users.forEach((user) => {
          if (user.rooms.includes(roomId)) {
            user.ws.send(
              JSON.stringify({
                type: "chat",
                message,
                roomId,
                from: userId,
              }),
            );
          }
        });
      }
    });

    ws.on("close", () => {
      const index = users.findIndex((x) => x.ws === ws);
      if (index !== -1) {
        users.splice(index, 1);
      }

      // TODO (PRESENCE SYSTEM):
      // Update online/offline presence
      // Broadcast user disconnect to room members
    });
  } catch (err) {
    console.error("WS Connection Error:", err);
    ws.close(1011, "Internal server error");
  }
});
