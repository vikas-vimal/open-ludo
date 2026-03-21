import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode, ApiErrorResponse } from '@open-ludo/contracts';

export class ApiException extends HttpException {
  constructor(code: ApiErrorCode, message: string, status = HttpStatus.BAD_REQUEST) {
    const response: ApiErrorResponse = { code, message };
    super(response, status);
  }
}
