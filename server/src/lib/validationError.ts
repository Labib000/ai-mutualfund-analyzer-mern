/**
 * A business-rule failure tied to form fields (Laravel's ValidationException).
 * The error handler answers it with a 422 like a failed request validation.
 */
export class ValidationError extends Error {
    override name = 'ValidationError';

    constructor(readonly errors: Record<string, string>) {
        super(Object.values(errors)[0] ?? 'The given data was invalid.');
    }

    static withMessage(field: string, message: string): ValidationError {
        return new ValidationError({ [field]: message });
    }
}
