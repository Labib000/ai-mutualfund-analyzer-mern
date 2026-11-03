import {
    type FormEvent,
    type ReactNode,
    useCallback,
    useRef,
    useState,
} from 'react';
import { toast } from 'sonner';

import { ApiError, api } from '@/lib/api';

type Errors = Record<string, string | undefined>;

export type FormRenderProps = {
    processing: boolean;
    errors: Errors;
    /** Clears the inputs (all, or the named ones) and the errors. */
    resetAndClearErrors: (...fields: string[]) => void;
};

type Props<T> = {
    /** API path, e.g. "/auth/login" (the /api prefix is added). */
    action: string;
    method?: 'post' | 'put' | 'patch' | 'delete';
    /** Change the payload before sending (e.g. add a token). */
    transform?: (data: Record<string, unknown>) => Record<string, unknown>;
    /** Clear these inputs after success (true = all). */
    resetOnSuccess?: boolean | string[];
    /** Clear these inputs after a validation error (true = all). */
    resetOnError?: boolean | string[];
    onSuccess?: (data: T) => void | Promise<void>;
    onError?: (errors: Errors) => void;
    className?: string;
    children: (props: FormRenderProps) => ReactNode;
};

/** Form values as an object; checkboxes become booleans. */
function readForm(form: HTMLFormElement): Record<string, unknown> {
    const data: Record<string, unknown> = {};

    for (const [name, value] of new FormData(form).entries()) {
        data[name] = typeof value === 'string' ? value : value.name;
    }

    for (const element of Array.from(form.elements)) {
        if (
            element instanceof HTMLInputElement &&
            element.type === 'checkbox' &&
            element.name
        ) {
            data[element.name] = element.checked;
        }
    }

    return data;
}

function clearInputs(
    form: HTMLFormElement | null,
    fields: boolean | string[] | undefined,
) {
    if (!form || !fields) return;

    if (fields === true) {
        form.reset();
        return;
    }

    for (const name of fields) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement) input.value = '';
    }
}

/**
 * Like Inertia's <Form>: uncontrolled inputs, submitted as JSON to the API.
 * 422 errors land on fields; any other error is shown as a toast.
 */
export function Form<T = unknown>({
    action,
    method = 'post',
    transform,
    resetOnSuccess,
    resetOnError,
    onSuccess,
    onError,
    className,
    children,
}: Props<T>) {
    const formRef = useRef<HTMLFormElement>(null);
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState<Errors>({});

    const resetAndClearErrors = useCallback((...fields: string[]) => {
        clearInputs(formRef.current, fields.length ? fields : true);
        setErrors({});
    }, []);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (processing) return;

        const form = event.currentTarget;
        let body = readForm(form);
        if (transform) body = transform(body);

        setProcessing(true);

        try {
            const data = await api<T>(action, {
                method: method.toUpperCase(),
                body,
            });
            setErrors({});
            clearInputs(form, resetOnSuccess);
            await onSuccess?.(data);
        } catch (error) {
            if (
                error instanceof ApiError &&
                Object.keys(error.fieldErrors).length > 0
            ) {
                setErrors(error.fieldErrors);
                clearInputs(form, resetOnError);
                onError?.(error.fieldErrors);
            } else {
                toast.error(
                    error instanceof ApiError
                        ? error.message
                        : 'Something went wrong. Please try again.',
                );
            }
        } finally {
            setProcessing(false);
        }
    };

    return (
        <form
            ref={formRef}
            onSubmit={(e) => void submit(e)}
            className={className}
            noValidate={false}
        >
            {children({ processing, errors, resetAndClearErrors })}
        </form>
    );
}
