import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

// Edge-safe config — no Prisma, no Node.js-only imports.
// Used by middleware for JWT verification. auth.ts extends this with the
// full Credentials provider and DB-backed jwt callback (Node.js only).
export const authConfig = {
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" as const },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as string) || "PARENT";
        session.user.forcePasswordChange = Boolean(token.forcePasswordChange);
      }
      return session;
    },
  },
};
