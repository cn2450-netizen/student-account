import { cache } from "react";
import { compare, hash } from "bcryptjs";
import { type AuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Email / Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) return null;

        const username = credentials.username.toLowerCase().trim();
        const password = credentials.password;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;

        // Permanent lockout — requires PRESIDENT/ADMIN to reactivate
        if (user.permanentLock) return null;

        // Temporary lockout window
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const ok = await compare(password, user.passwordHash);

        if (!ok) {
          const now = new Date();
          const windowMs = 10 * 60 * 1000; // 10 minutes
          const windowExpired =
            !user.loginWindowStart ||
            now.getTime() - user.loginWindowStart.getTime() > windowMs;

          const newAttempts = windowExpired ? 1 : user.loginAttempts + 1;
          const newWindowStart = windowExpired ? now : user.loginWindowStart;

          if (newAttempts >= 5) {
            // 5th bad attempt — lock the account
            const newLockoutCount = user.lockoutCount + 1;
            if (newLockoutCount > 2) {
              // Locked out more than twice — permanent lock
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  loginAttempts: 0,
                  loginWindowStart: null,
                  lockedUntil: null,
                  lockoutCount: newLockoutCount,
                  permanentLock: true,
                  forcePasswordChange: true,
                },
              });
            } else {
              // Temporary 30-minute lock
              const lockedUntil = new Date(now.getTime() + 30 * 60 * 1000);
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  loginAttempts: 0,
                  loginWindowStart: null,
                  lockedUntil,
                  lockoutCount: newLockoutCount,
                },
              });
            }
          } else {
            await prisma.user.update({
              where: { id: user.id },
              data: { loginAttempts: newAttempts, loginWindowStart: newWindowStart },
            });
          }
          return null;
        }

        // Successful login — clear lockout state
        await prisma.user.update({
          where: { id: user.id },
          data: { loginAttempts: 0, loginWindowStart: null, lockedUntil: null },
        });

        // Annual password expiry — parents must change password once per year
        let forcePasswordChange = user.forcePasswordChange;
        if (user.role === "PARENT" && !forcePasswordChange) {
          const oneYearAgo = new Date();
          oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
          const isExpired = !user.passwordChangedAt || user.passwordChangedAt < oneYearAgo;
          if (isExpired) {
            await prisma.user.update({
              where: { id: user.id },
              data: { forcePasswordChange: true },
            });
            forcePasswordChange = true;
          }
        }

        return {
          id: user.id,
          name: user.username,
          role: user.role,
          forcePasswordChange,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as Record<string, unknown>;
        token.role = typeof u.role === "string" ? u.role : undefined;
        token.userId = user.id;
        token.forcePasswordChange =
          typeof u.forcePasswordChange === "boolean" ? u.forcePasswordChange : undefined;
      } else if (token.userId) {
        // Re-sync role/forcePasswordChange from DB at most once per minute.
        // Without this TTL the jwt callback would hit the DB on every request,
        // exhausting the connection pool under concurrent login/logout load.
        const now = Date.now();
        const TOKEN_SYNC_TTL_MS = 60_000;
        if (!token.syncedAt || now - token.syncedAt > TOKEN_SYNC_TTL_MS) {
          const current = await prisma.user.findUnique({
            where: { id: String(token.userId) },
            select: { role: true, forcePasswordChange: true },
          });
          if (current) {
            token.role = current.role;
            token.forcePasswordChange = current.forcePasswordChange;
            token.syncedAt = now;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as string) || "PARENT";
        session.user.forcePasswordChange = Boolean(token.forcePasswordChange);
      }
      return session;
    },
  },
};

// cache() deduplicates calls within a single server render pass so multiple
// server components on the same page share one session lookup instead of each
// triggering a separate JWT callback execution.
export const getCurrentSession = cache(() => getServerSession(authOptions));

export { hash };
