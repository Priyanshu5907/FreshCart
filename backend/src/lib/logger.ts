import winston from 'winston';

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

const isDev = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
  level: isDev ? 'debug' : 'info',
  levels: { error: 0, warn: 1, info: 2, http: 3, debug: 4 },
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    isDev ? combine(colorize(), simple()) : json(),
  ),
  defaultMeta: { service: 'grocery-api' },
  transports: [new winston.transports.Console()],
});

// Add CloudWatch transport in production when the log group is configured
if (!isDev && process.env.AWS_CLOUDWATCH_LOG_GROUP) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const WinstonCloudWatch = require('winston-cloudwatch');
  logger.add(
    new WinstonCloudWatch({
      logGroupName: process.env.AWS_CLOUDWATCH_LOG_GROUP,
      logStreamName: process.env.AWS_CLOUDWATCH_LOG_STREAM ?? 'grocery-api',
      awsRegion: process.env.AWS_REGION ?? 'us-east-1',
      jsonMessage: true,
    }),
  );
}

export default logger;
