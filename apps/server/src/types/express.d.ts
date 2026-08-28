import type { AuthenticatedUserContext } from '@shoes/shared';

declare global {
  namespace Express {
    interface Request {
      /**
       * Populated exclusively by the `authenticate` middleware from a
       * verified JWT + fresh DB lookup. Nothing downstream should ever read
       * tenantId, userId, roles or permissions from req.body/req.params/
       * req.query — those are attacker-controlled.
       */
      authContext?: AuthenticatedUserContext;
      requestId?: string;
    }
  }
}

export {};
