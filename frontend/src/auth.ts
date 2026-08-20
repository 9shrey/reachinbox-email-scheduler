import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// JWT session strategy (no database adapter): we only need the Google
// profile's name/email/avatar for the header + logout, not persisted
// multi-device sessions, so there's no need for NextAuth's Prisma adapter
// or extra User/Account/Session tables.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email ?? session.user.email;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
