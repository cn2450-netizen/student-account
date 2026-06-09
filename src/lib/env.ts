// Validates required env vars at module load time (Node.js and Edge runtimes).
// Importing this module anywhere causes a hard startup error if config is wrong.

const secret = process.env.NEXTAUTH_SECRET;

if (!secret || secret.length < 32) {
  throw new Error(
    "NEXTAUTH_SECRET is missing or too short (minimum 32 characters). " +
      "Generate one with: openssl rand -hex 32"
  );
}

export const NEXTAUTH_SECRET: string = secret;
