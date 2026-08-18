import type { PublicUser } from "../../types/dto.js";
import type { User } from "../../db/schema.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createToken, sessionExpiry } from "./session.js";
import * as repo from "./auth.repo.js";

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
  };
}

export type RegisterResult =
  | { ok: true; user: PublicUser; token: string }
  | { ok: false; error: "exists" };

export type LoginResult =
  | { ok: true; user: PublicUser; token: string }
  | { ok: false; error: "invalid" };

export async function register(
  username: string,
  password: string,
): Promise<RegisterResult> {
  const existing = await repo.findUserByUsername(username);
  if (existing) return { ok: false, error: "exists" };

  const passwordHash = await hashPassword(password);
  const user = await repo.createUser(username, passwordHash);
  const token = createToken();
  await repo.createSession(user.id, token, sessionExpiry());

  return { ok: true, user: toPublicUser(user), token };
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResult> {
  const user = await repo.findUserByUsername(username);
  if (!user) return { ok: false, error: "invalid" };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { ok: false, error: "invalid" };

  const token = createToken();
  await repo.createSession(user.id, token, sessionExpiry());

  return { ok: true, user: toPublicUser(user), token };
}

export async function logout(token: string): Promise<void> {
  await repo.deleteSessionByToken(token);
}

export async function getUserByToken(token: string): Promise<PublicUser | null> {
  const session = await repo.findSessionByToken(token);
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  const user = await repo.findUserById(session.userId);
  return user ? toPublicUser(user) : null;
}

export async function getUserById(userId: string): Promise<PublicUser | null> {
  const user = await repo.findUserById(userId);
  return user ? toPublicUser(user) : null;
}