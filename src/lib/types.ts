// types.ts

import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
    user?: any;  // You can make this more specific if you know the shape of your user object
}
