const asyncHandlers = (reqHandler) => {
    return (req, res, next) => {
        Promise.resolve(reqHandler(req, res, next)).catch((error) => next(error));
    };
};
export { asyncHandlers };
//# sourceMappingURL=asyncHandler.js.map