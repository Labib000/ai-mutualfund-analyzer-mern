import type { ApiErrorBody } from '@hisaab/shared';
import type { Response } from 'express';
import type { z } from 'zod';

/** First message per top-level field, Laravel style. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
    const errors: Record<string, string> = {};

    for (const issue of error.issues) {
        const field = String(issue.path[0] ?? 'form');
        errors[field] ??= issue.message;
    }

    return errors;
}

/** Sends a 422 like Laravel's ValidationException. */
export function sendValidationErrors(
    res: Response,
    errors: Record<string, string>,
): void {
    const messages = Object.values(errors);
    const extra = messages.length - 1;
    const body: ApiErrorBody = {
        message:
            extra > 0
                ? `${messages[0]} (and ${extra} more error${extra > 1 ? 's' : ''})`
                : (messages[0] ?? 'The given data was invalid.'),
        errors,
    };

    res.status(422).json(body);
}

/**
 * Parses `data` with `schema`; on failure sends a 422 and returns undefined.
 */
export function parseOr422<S extends z.ZodType>(
    schema: S,
    data: unknown,
    res: Response,
): z.output<S> | undefined {
    const result = schema.safeParse(data ?? {});

    if (!result.success) {
        sendValidationErrors(res, fieldErrors(result.error));
        return undefined;
    }

    return result.data;
}

/**
 * Like parseOr422, plus extra field errors computed by the caller (rules that
 * need the server, such as "not in the future"). A field keeps the schema's
 * error if it has one, and all errors are sent together, as Laravel does.
 */
export function parseWithOr422<S extends z.ZodType>(
    schema: S,
    data: unknown,
    res: Response,
    extra: Record<string, string | null | undefined>,
): z.output<S> | undefined {
    const result = schema.safeParse(data ?? {});
    const errors = result.success ? {} : fieldErrors(result.error);

    for (const [field, message] of Object.entries(extra)) {
        if (message && !errors[field]) errors[field] = message;
    }

    if (!result.success || Object.keys(errors).length > 0) {
        sendValidationErrors(res, errors);
        return undefined;
    }

    return result.data;
}
