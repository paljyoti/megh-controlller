class ApiError extends Error {
  statusCode: number;
  data: any;
  error: any[];
  success: boolean;

  constructor(
    statusCode: number,
    message = "something went wrong",
    stack = "",
    error: any[] = []
  ) {
    super(message);
    this.statusCode = statusCode;
    this.data = null;
    this.error = error;
    this.success = false;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export default ApiError;
