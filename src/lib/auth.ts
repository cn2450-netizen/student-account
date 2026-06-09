import { cache } from "react";
import { compare, hash } from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import "@/lib/env"; // validates NEXTAUTH_SECRET at startup
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      async authorize(credentials) {
        const username = (credentials?.username as string | undefined)?.toLowerCase().trim();
        const password = credentials?.password as string | undefined;
        if (!username || !password) return null;

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;

        // Permanent lockout — requires PRESIDENT/ADMIN to reactivate
        if (user.permanentLock) return null;

        // Temporary lockout window
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const ok = await compare(password, user.passwordHash);

        if (!ok) {
          const now = new Date();
          const windowMs = 10 * 60 * 1000;
          const windowExpired =
            !user.loginWindowStart ||
            now.getTime() - user.loginWindowStart.getTime() > windowMs;

          const newAttempts = windowExpired ? 1 : user.loginAttempts + 1;
          const newWindowStart = windowExpired ? now : user.loginWindowStart;

          if (newAttempts >= 5) {
            const newLockoutCount = user.lockoutCount + 1;
            if (newLockoutCount > 2) {
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
        token.role = user.role;
        token.userId = user.id;
        token.forcePasswordChange = user.forcePasswordChange;
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
});

// cache() deduplicates calls within a single server render pass so multiple
// server components on the same page share one session lookup instead of each
// triggering a separate JWT callback execution.
export const getCurrentSession = cache(auth);

export { hash };
