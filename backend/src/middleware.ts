import type { Request, Response, NextFunction } from "express";
import type { User, Session } from "@prisma/client";
import { db } from "./db.js";
import { config } from "./config.js";
import { hash, equal } from "./security.js";
declare global {
  namespace Express {
    interface Request {
      user: User;
      walletSession: Session;
    }
  }
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new HttpError(status, message);
}
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = req.cookies.pg_session;
  if (typeof token !== "string")
    return next(new HttpError(401, "Please sign in."));
  const session = await db.session.findUnique({
    where: { id: hash(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date())
    return next(new HttpError(401, "Session expired. Please sign in."));
  req.user = session.user;
  req.walletSession = session;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !equal(String(req.headers["x-csrf-token"] || ""), session.csrf)
  )
    return next(
      new HttpError(403, "Invalid CSRF token. Refresh and try again."),
    );
  next();
}
export function walletOrigin(req: Request, _res: Response, next: NextFunction) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin !== config.WALLET_ORIGIN
  )
    return next(new HttpError(403, "Untrusted request origin."));
  next();
}
export const audit = (
  userId: string,
  event: string,
  outcome = "success",
  website?: string,
  claim?: string,
) => db.audit.create({ data: { userId, event, outcome, website, claim } });
