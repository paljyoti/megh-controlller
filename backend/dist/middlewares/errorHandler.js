import ApiError from "../utils/ApiError.js";
// Central error handler — without this, Express falls back to its default handler, which
// renders a generic HTML page (not JSON) for every thrown error. That breaks the frontend's
// error handling (it reads `err.response.data.message`, which only exists on JSON bodies)
// and makes real errors (e.g. "user not found", CORS rejection) indistinguishable from a
// route simply not existing.
export const errorHandler = (err, req, res, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
next) => {
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            statusCode: err.statusCode,
            data: err.data,
            message: err.message,
            success: false,
        });
    }
    if (err instanceof Error && err.message === "Not allowed by CORS") {
        return res.status(403).json({
            statusCode: 403,
            data: null,
            message: "Not allowed by CORS",
            success: false,
        });
    }
    console.error("[errorHandler] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return res.status(500).json({ statusCode: 500, data: null, message, success: false });
};
//# sourceMappingURL=errorHandler.js.map