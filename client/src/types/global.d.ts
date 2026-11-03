import 'react';

declare module 'react' {
    interface InputHTMLAttributes<T> {
        /** Password manager hint, e.g. "minlength: 12; required: upper;". */
        passwordrules?: string;
    }
}
