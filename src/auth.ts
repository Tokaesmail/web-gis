import NextAuth from "next-auth";
import { authOptions } from "./authoptions";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };

export { getServerSession } from "next-auth";
export { authOptions };