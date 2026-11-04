import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { MongoRateLimitStore } from '../lib/rateLimitStore.js';

const ip = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');

function tooMany(message: (seconds: number) => string, field?: string) {
    return (req: Request, res: Parameters<RequestHandler>[1]) => {
        const resetTime = (
            req as Request & { rateLimit?: { resetTime?: Date } }
        ).rateLimit?.resetTime;
        const seconds = resetTime
            ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
            : 60;
        const text = message(seconds);

        res.status(429).json(
            field
                ? { message: text, errors: { [field]: text } }
                : { message: text },
        );
    };
}

const common = {
    windowMs: 60_000,
    standardHeaders: 'draft-8' as const,
    legacyHeaders: false,
};

/**
 * Login: 5 failed attempts a minute per email + IP (Fortify's "login" limiter).
 * Successful logins are not counted.
 */
export function loginLimiter(): RequestHandler {
    return rateLimit({
        ...common,
        limit: 5,
        store: new MongoRateLimitStore('login'),
        skipSuccessfulRequests: true,
        keyGenerator: (req) =>
            `${String(req.body?.email ?? '')
                .trim()
                .toLowerCase()}|${ip(req)}`,
        handler: tooMany(
            (s) => `Too many login attempts. Please try again in ${s} seconds.`,
            'email',
        ),
    });
}

/** Generic per-user (or per-IP for guests) limiter, e.g. throttle:6,1. */
export function perUserLimiter(name: string, limit: number): RequestHandler {
    return rateLimit({
        ...common,
        limit,
        store: new MongoRateLimitStore(name),
        keyGenerator: (req) =>
            req.user ? `user:${req.user.id}` : `ip:${ip(req)}`,
        handler: tooMany(
            (s) => `Too many attempts. Please try again in ${s} seconds.`,
        ),
    });
}

/** AI requests: 5 a minute per user (Laravel's "ai" limiter). */
export function aiLimiter(): RequestHandler {
    return rateLimit({
        ...common,
        limit: 5,
        store: new MongoRateLimitStore('ai'),
        keyGenerator: (req) =>
            req.user ? `user:${req.user.id}` : `ip:${ip(req)}`,
        handler: tooMany(
            (s) => `Too many AI requests. Please try again in ${s} seconds.`,
        ),
    });
}

/** Per-IP limiter for guest endpoints (forgot / reset password). */
export function perIpLimiter(name: string, limit: number): RequestHandler {
    return rateLimit({
        ...common,
        limit,
        store: new MongoRateLimitStore(name),
        keyGenerator: (req) => ip(req),
        handler: tooMany(
            (s) => `Too many attempts. Please try again in ${s} seconds.`,
        ),
    });
}
