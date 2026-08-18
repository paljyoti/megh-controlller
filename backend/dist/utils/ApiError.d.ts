declare class ApiError extends Error {
    statusCode: number;
    data: any;
    error: any[];
    success: boolean;
    constructor(statusCode: number, message?: string, stack?: string, error?: any[]);
}
export default ApiError;
//# sourceMappingURL=ApiError.d.ts.map