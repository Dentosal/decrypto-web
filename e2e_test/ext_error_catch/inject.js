function __setError(msg) {
    console.error("Setting error:", msg);
    if (!window.CATCH_ERROR) { // Only set if not already set
        window.CATCH_ERROR = msg;
    }
}

window.onerror = function (message, filename, lineno, colno, error) {
    __setError(message + ' at ' + filename + ':' + lineno + ':' + colno);
};
window.onunhandledrejection = function (event) {
    __setError(event.reason.message + ' at ' + event.reason.fileName + ':' + event.reason.lineNumber + ':' + event.reason.columnNumber);
};

console.info("Error catcher extension injected");
