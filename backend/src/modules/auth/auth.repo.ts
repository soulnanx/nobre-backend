import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { sessions, users } from "../../db/schema.js";
import type { Session, User } from "../../db/schema.js";

export async function findUserByUsername(
  username: string,
): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  return user;
}

export async function findUserById(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export async function createUser(
  username: string,
  passwordHash: string,
): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash })
    .returning();
  if (!user) throw new Error("createUser failed");
  return user;
}

export async function createSession(
  userId: string,
  token: string,
  expiresAt: Date,
): Promise<Session> {
  const [session] = await db
    .insert(sessions)
    .values({ userId, token, expiresAt })
    .returning();
  if (!session) throw new Error("createSession failed");
  return session;
}

export async function findSessionByToken(
  token: string,
): Promise<Session | undefined> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.token, token))
    .limit(1);
  return session;
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}