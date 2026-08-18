class ApiResponse {
  data: {};
  statusCode: number;
  message: string;
  success: boolean;

  constructor(statusCode: number, data: {}, message = "success") {
    this.data = data;
    this.statusCode = statusCode;
    this.message = message;
    this.success = statusCode < 400;
  }
}

export { ApiResponse };
