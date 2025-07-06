import pino from 'pino';
import { config } from '../config';

// Create logger configuration
const loggerConfig: pino.LoggerOptions = {
  level: config.logging.level,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// Add transport for development
if (config.logging.prettyPrint) {
  loggerConfig.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  };
}

// Create logger instance with configuration
export const logger = pino(loggerConfig);

// Export typed logger for better TypeScript support
export type Logger = typeof logger;

// Create child loggers for different components
export const createChildLogger = (name: string) => {
  return logger.child({ component: name });
};

// Specific loggers for different parts of the application
export const serverLogger = createChildLogger('server');
export const apiLogger = createChildLogger('api');
export const workerLogger = createChildLogger('worker');
export const dbLogger = createChildLogger('database');
export const queueLogger = createChildLogger('queue');
export const adapterLogger = createChildLogger('adapter');
export const serviceLogger = createChildLogger('service');

export default logger; 
