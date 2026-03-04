// src/types/next-auth.d.ts

// Define the structure of user data from your API
interface UserData {
  role: string;
  name: string;
  email: string;
}

// Extend NextAuth's User type
declare module 'next-auth' {
  interface User {
    id: string;
    token: string;
    user: UserData;
  }

  interface Session {
    user: UserData;
  }
}

// Extend NextAuth's JWT type
declare module 'next-auth/jwt' {
  interface JWT {
    user: UserData;
    token: string;
  }
}