/** Error thrown for non-2xx API responses. `fieldErrors` maps form fields to messages (422). */
export class ApiError extends Error {
    override name = 'ApiError';

    constructor(
        readonly status: number,
        message: string,
        readonly body: unknown,
        readonly fieldErrors: Record<string, string> = {},
    ) {
        super(message);
    }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

/** fetch wrapper for /api: same-origin cookies, JSON in and out, typed errors. */
export async function api<T>(
    path: string,
    options: RequestOptions = {},
): Promise<T> {
    const { body, headers: extraHeaders, ...rest } = options;

    // Headers accepts a plain object, an array of pairs or a Headers instance.
    const headers = new Headers(extraHeaders);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`/api${path}`, {
        credentials: 'same-origin',
        ...rest,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const isJson = response.headers
        .get('content-type')
        ?.includes('application/json');
    const data: unknown = isJson
        ? await response.json().catch(() => null)
        : null;

    if (!response.ok) {
        const payload = (data ?? {}) as {
            message?: string;
            errors?: Record<string, string>;
        };

        throw new ApiError(
            response.status,
            payload.message ?? `Request failed (${response.status}).`,
            data,
            payload.errors ?? {},
        );
    }

    return data as T;
}
