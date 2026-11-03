// Applies the saved theme before first paint (external file so the CSP needs no 'unsafe-inline').
(function () {
    var appearance = localStorage.getItem('appearance') || 'system';
    var dark =
        appearance === 'dark' ||
        (appearance === 'system' &&
            window.matchMedia('(prefers-color-scheme: dark)').matches);

    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
