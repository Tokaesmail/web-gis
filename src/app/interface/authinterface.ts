// src/app/interface/authinterface.ts

export interface failedResponse {
  success: boolean;
  message: string;
  data: Record<string, never>;
}

export interface successResponse {
  success: boolean;
  message: string;
  data: successResponseData;
}

export interface successResponseData {
  accessToken: string;
  user: User;
}

export interface User {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  role?: string;
}

// Extend next-auth types so TypeScript knows about our custom fields
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      email?: string | null;
      username?: string;
      name?: string | null;
      image?: string | null;
      accessToken?: string;
      is_active?: boolean;
      is_verified?: boolean;
      created_at?: string;
      role?: string;
    };
  }

  // Extend the User returned from authorize()
  interface User {
    id: string;
    email: string;
    username?: string;
    accessToken?: string;
    is_active?: boolean;
    is_verified?: boolean;
    created_at?: string;
    role?: string;
  }
}