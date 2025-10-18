/**
 * Logging Utility
 * 
 * Centralized logging with context and structured output.
 * Supports different log levels and optional external service integration.
 * 
 * @module lib/logging
 */

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  meta?: Record<string, any>;
}

/**
 * Log a message with context and metadata
 * 
 * @param level - Log level (info, warn, error, debug)
 * @param context - Context identifier (e.g., 'ScheduleManagement', 'API')
 * @param message - Log message
 * @param meta - Optional metadata object
 * 
 * @example
 * log('error', 'ScheduleManagement', 'Override request failed', {
 *   userId: 'abc-123',
 *   targetDate: '2025-10-20',
 *   error: err.message
 * });
 */
export function log(
  level: LogLevel,
  context: string,
  message: string,
  meta?: Record<string, any>
): void {
  const timestamp = new Date().toISOString();
  
  const logEntry: LogEntry = {
    timestamp,
    level,
    context,
    message,
    meta
  };
  
  // Console output with color coding
  const prefix = `[${timestamp}] [${context}]`;
  const metaStr = meta ? `\n${JSON.stringify(meta, null, 2)}` : '';
  
  switch (level) {
    case 'error':
      console.error(`${prefix} ❌ ${message}${metaStr}`);
      break;
    case 'warn':
      console.warn(`${prefix} ⚠️  ${message}${metaStr}`);
      break;
    case 'info':
      console.info(`${prefix} ℹ️  ${message}${metaStr}`);
      break;
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.debug(`${prefix} 🐛 ${message}${metaStr}`);
      }
      break;
  }
  
  // TODO: Send to external logging service in production
  if (process.env.NODE_ENV === 'production' && level === 'error') {
    // Example: Sentry integration
    // Sentry.captureException(new Error(message), {
    //   level: 'error',
    //   contexts: {
    //     custom: {
    //       context,
    //       ...meta
    //     }
    //   }
    // });
    
    // For now, just ensure it's logged to console
    // Production logging services can be configured via environment variables
  }
}

/**
 * Log info message (convenience function)
 */
export function logInfo(context: string, message: string, meta?: Record<string, any>): void {
  log('info', context, message, meta);
}

/**
 * Log warning message (convenience function)
 */
export function logWarn(context: string, message: string, meta?: Record<string, any>): void {
  log('warn', context, message, meta);
}

/**
 * Log error message (convenience function)
 */
export function logError(context: string, message: string, meta?: Record<string, any>): void {
  log('error', context, message, meta);
}

/**
 * Log debug message (convenience function)
 * Only logs in development mode
 */
export function logDebug(context: string, message: string, meta?: Record<string, any>): void {
  log('debug', context, message, meta);
}

/**
 * Create a logger for a specific context
 * 
 * @param context - Context name (e.g., 'ScheduleManagement')
 * @returns Logger object with bound context
 * 
 * @example
 * const logger = createLogger('ScheduleManagement');
 * logger.info('Loading schedule');
 * logger.error('Failed to save', { error: err.message });
 */
export function createLogger(context: string) {
  return {
    info: (message: string, meta?: Record<string, any>) => logInfo(context, message, meta),
    warn: (message: string, meta?: Record<string, any>) => logWarn(context, message, meta),
    error: (message: string, meta?: Record<string, any>) => logError(context, message, meta),
    debug: (message: string, meta?: Record<string, any>) => logDebug(context, message, meta),
  };
}
