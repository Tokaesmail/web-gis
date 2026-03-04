// // src/lib/auth.ts
// import CredentialsProvider from 'next-auth/providers/credentials';
// import {jwtDecode} from 'jwt-decode';
// import Credentials from 'next-auth/providers/credentials';
// import { AuthOptions } from 'next-auth';

// export const authOptions: AuthOptions = {
//   // Redirect to custom login page instead of default
//   pages: {
//     signIn: '/auth/login',
//   },

//   // Configure authentication providers
//   providers: [
//     Credentials({
//       name: 'Credentials',
      
//       // Define what credentials we expect
//       credentials: {
//         email: { label: 'Email', type: 'email' },
//         password: { label: 'Password', type: 'password' },
//       },

//       // This function runs when user tries to log in
//       authorize: async credentials => {
//           // Call your backend API
//           const res = await fetch(
//             `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
//             {
//               method: 'POST',
//               body: JSON.stringify({
//                 email: credentials?.email,
//                 password: credentials?.password,
//               }),
//               headers: {
//                 'Content-Type': 'application/json',
//               },
//             }
//           );

//           const data = await res.json();

//           // Check if login was successful
//           if (data.message === 'success') {
//             // Decode the JWT to get user ID
//             const decodedToken: { id: string } = jwtDecode(data.token);

//             // Return user object (must include 'id' field)
//             return {
//               id: decodedToken.id,
//               user: data.user,
//               token: data.token,
//             };
//           } else {
//             // Login failed - throw error to show user
//             throw new Error(data.message || 'Invalid credentials');
//           }
//       },
//     }),
//   ],

//   // Callbacks to customize session and JWT behavior
//   callbacks: {
//     // JWT callback: runs whenever a JWT is created or updated
//     async jwt({ token, user }) {
//       // On first sign in, 'user' object is available
//       if (user) {
//         token.user = user.user;
//         token.token = user.token;
//       }
//       return token;
//     },

//     // Session callback: runs whenever session is accessed
//     async session({ session, token }) {
//       if (token) {
//         // Add our custom user data to the session
//         session.user = token.user;
//       }
//       return session;
//     },
//   },
// };