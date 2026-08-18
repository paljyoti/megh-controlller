class ApiError extends Error {
    statusCode;
    data;
    error;
    success;
    constructor(statusCode, message = "something went wrong", stack = "", error = []) {
        super(message);
        this.statusCode = statusCode;
        this.data = null;
        this.error = error;
        this.success = false;
        if (stack) {
            this.stack = stack;
        }
        else {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
export default ApiError;
//# sourceMappingURL=ApiError.js.map