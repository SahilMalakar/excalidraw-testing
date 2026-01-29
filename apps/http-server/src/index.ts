import "dotenv/config";
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "@repo/db";
import { LoginSchema, RoomSchema, SignUpSchema } from "@repo/schemas";
import { auth } from "./middleware.js";

console.log("HTTP-SERVER: ", process.env.DATABASE_URL);

const app = express();
app.use(express.json());

if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
  throw new Error("❌variable missing in root .env");
}
const JWT_SECRET = process.env.JWT_SECRET;
console.log(JWT_SECRET);

const SALT_ROUNDS = 10;

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

//signup route
app.post("/api/v1/signup", async (req, res) => {
  try {
    //validate input
    const { data, success, error } = SignUpSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).json({ message: "Invalid input", error });
    }

    //check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    //hash password
    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
    //create user
    const user = await prisma.user.create({
      data: {
        name: data.username,
        email: data.email,
        password: hashedPassword,
      },
    });

    //generate token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "45m",
    });

    return res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

//login route
app.post("/api/v1/login", async (req, res) => {
  try {
    //validate input
    const { data, success, error } = LoginSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).json({ message: "Invalid input", error });
    }

    //find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    //compare password
    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    //generate token
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "45m",
    });

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/api/v1/room", auth, async (req, res) => {
  try {
    //Validate input
    const { data, success, error } = RoomSchema.safeParse(req.body);
    if (!success) {
      return res.status(400).json({
        message: "Invalid input",
        error,
      });
    }

    //Get userId from auth middleware
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    //Create room
    const room = await prisma.room.create({
      data: {
        slug: data.name,
        adminId: userId,
      },
    });

    //Success response
    return res.status(201).json({
      message: "Room created successfully",
      room: room
    });
  } catch (err: any) {
    //Prisma unique constraint error handling
    if (err?.code === "P2002") {
      return res.status(409).json({
        message: "Room already exists",
      });
    }

    console.error("Create room error:", err);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});


app.get("/api/v1/chats/:roomId", async (req, res) => {
  try {
    const roomId = Number(req.params.roomId);

    if (Number.isNaN(roomId)) {
      return res.status(400).json({
        message: "Invalid roomId",
      });
    }

    // Fetch last 50 messages of this room
    const messages = await prisma.chat.findMany({
      where: {
        roomId: roomId,
      },
      orderBy: {
        createdAt: "desc", // latest messages first
      },
      take: 50,
    });

    res.status(200).json({
      messages: messages.reverse(), // oldest → newest for UI rendering
    });
  } catch (error) {
    console.error("Fetch chat error:", error);
    res.status(500).json({
      message: "Internal server error",
    });
  }
});

const PORT = process.env.PORT || 4001;

app.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});
