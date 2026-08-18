class ApiResponse {
    data;
    statusCode;
    message;
    success;
    constructor(statusCode, data, message = "success") {
        this.data = data;
        this.statusCode = statusCode;
        this.message = message;
        this.success = statusCode < 400;
    }
}
export { ApiResponse };
//# sourceMappingURL=ApiResponse.js.map