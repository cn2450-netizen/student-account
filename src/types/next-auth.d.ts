import "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    forcePasswordChange: boolean;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email?: string | null;
      role: string;
      forcePasswordChange: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    userId?: string;
    forcePasswordChange?: boolean;
    syncedAt?: number;
  }
}
