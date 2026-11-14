import { Catch, ArgumentsHost, ExceptionFilter, HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();
    const parseError = error && typeof error === 'object' && 'type' in error &&
      ['entity.parse.failed', 'entity.too.large'].includes(String(error.type));
    const status = error instanceof HttpException ? error.getStatus() : parseError ? 400 : 503;
    const payload = error instanceof HttpException ? error.getResponse() : undefined;
    const code = payload && typeof payload === 'object' && 'code' in payload ? payload.code : undefined;
    response.status(status).type('application/problem+json').json({
      type: 'about:blank', title: status === 503 ? 'Catalog tạm thời không khả dụng' : 'Yêu cầu không hợp lệ',
      status, code: typeof code === 'string' ? code : status === 404 ? 'NOT_FOUND' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'BAD_REQUEST',
      requestId: randomUUID(),
      ...(error instanceof HttpException && typeof payload === 'string' ? { detail: payload } : {}),
    });
  }
}
