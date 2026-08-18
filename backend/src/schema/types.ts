import type { Request } from "express";
import type { UserInterface } from "./userSchema.js";
interface newReq extends Request {
  user?: UserInterface;
}
// If you want to extend Express types in the shared folder, you need to have the express types available.
// You do not need to install the full 'express' package, but you do need to install its types:
// Run: npm install --save-dev @types/express
// This will allow TypeScript to resolve the types for Request.

// You can now export your extended type for use across your application:
export type { newReq };
