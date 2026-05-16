/**
 * Shared TypeScript types and interfaces for the grocery platform backend.
 */

// Augment the Express and Passport types so middleware can attach requestId
// and user without casting to `any` throughout the codebase.
declare global {
  namespace Express {
    // Extend Passport's User interface so req.user has our fields.
    interface User {
      id: string;
      role: string;
      email: string;
    }

    interface Request {
      /** UUID assigned by requestLogger middleware for request tracing. */
      requestId: string;
    }
  }
}

/**
 * Payload embedded in JWT access tokens.
 */
export interface JwtPayload {
  userId: string;
  role: UserRole;
  email: string;
}

/**
 * User roles for RBAC.
 */
export enum UserRole {
  CUSTOMER = 'customer',
  ADMIN = 'admin',
  DELIVERY_PARTNER = 'delivery_partner',
}

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

/**
 * Paginated API response envelope.
 */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
