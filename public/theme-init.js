// Apply the saved theme before first paint. Classic script on purpose (modules are deferred).
(() => {
    try {
        const theme = localStorage.getItem('gm.theme');
        if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
    } catch {
        // storage unavailable: follow prefers-color-scheme
    }
})();
