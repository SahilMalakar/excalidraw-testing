import { z } from "zod";

export const SignUpSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.email(),
  password: z.string().min(6).max(20),
});

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(6).max(20),
});

export const RoomSchema = z.object({
  name: z.string().min(1).max(20),
}); 


export * from "./types.js";