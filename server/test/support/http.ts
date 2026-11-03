/** The URL a fetch() call was made with, whatever form it was passed in. */
export const hrefOf = (input: string | URL | Request): string =>
    typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
