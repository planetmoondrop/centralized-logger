import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { getCurrentTrace } from '../core/trace-context';
import { LokiLoggerService } from '../core/loki-logger.service';
import { LokiLoggerOptions, LOKI_LOGGER_OPTIONS } from '../interfaces';

/**
 * LokiHttpService
 *
 * Drop-in replacement for @nestjs/axios HttpService that automatically:
 *  - Injects x-trace-id on every outgoing request (cross-service trace propagation)
 *  - Injects x-parent-span-id so the downstream service knows who called it
 *  - Logs outgoing requests (logType: 'http_out') so they appear in the trace viewer
 *    under the correct span
 *
 * @example
 * // Replace HttpService with LokiHttpService in your module:
 * providers: [BusinessService, LokiHttpService]
 *
 * // Usage identical to HttpService:
 * this.http.get('http://auth-service/auth/validate').pipe(...)
 */
@Injectable()
export class LokiHttpService {
  constructor(
    private readonly http: HttpService,
    private readonly logger: LokiLoggerService,
    @Inject(LOKI_LOGGER_OPTIONS) private readonly options: LokiLoggerOptions,
  ) {}

  get<T = unknown>(url: string, config?: AxiosRequestConfig): Observable<AxiosResponse<T>> {
    return this.request<T>('GET', url, undefined, config);
  }

  post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Observable<AxiosResponse<T>> {
    return this.request<T>('POST', url, data, config);
  }

  put<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Observable<AxiosResponse<T>> {
    return this.request<T>('PUT', url, data, config);
  }

  patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Observable<AxiosResponse<T>> {
    return this.request<T>('PATCH', url, data, config);
  }

  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Observable<AxiosResponse<T>> {
    return this.request<T>('DELETE', url, undefined, config);
  }

  // ─── Private ─────────────────────────────────────────────────────

  private request<T>(
    method: string,
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Observable<AxiosResponse<T>> {
    const enrichedConfig = this.injectTraceHeaders(config);
    const done = this.logger.httpCall(method, url);

    return this.buildCall<T>(method, url, data, enrichedConfig).pipe(
      tap((response) => done(response.status)),
      catchError((err: Error & { response?: { status: number } }) => {
        done(err?.response?.status);
        return throwError(() => err);
      }),
    );
  }

  private buildCall<T>(
    method: string,
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Observable<AxiosResponse<T>> {
    switch (method) {
      case 'GET':
        return this.http.get<T>(url, config);
      case 'POST':
        return this.http.post<T>(url, data, config);
      case 'PUT':
        return this.http.put<T>(url, data, config);
      case 'PATCH':
        return this.http.patch<T>(url, data, config);
      case 'DELETE':
        return this.http.delete<T>(url, config);
      default:
        return this.http.get<T>(url, config);
    }
  }

  private injectTraceHeaders(config?: AxiosRequestConfig): AxiosRequestConfig {
    const trace = getCurrentTrace();
    if (!trace) return config ?? {};

    const traceHeader = this.options.traceHeader ?? 'x-trace-id';
    const parentSpanHeader = this.options.parentSpanHeader ?? 'x-parent-span-id';

    return {
      ...config,
      headers: {
        ...(config?.headers ?? {}),
        // Forward the same traceId so all services share the same trace thread
        [traceHeader]: trace.traceId,
        // Tell the downstream service which span triggered this call
        [parentSpanHeader]: trace.spanId,
      },
    };
  }
}
