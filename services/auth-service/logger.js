// services/auth-service/logger.js
const winston = require('winston');
const config = require('./config'); // Import config

const logger = winston.createLogger({
  level: config.logLevel, // Use log level from config
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }), // Log stack traces
    winston.format.splat(),
    winston.format.json() // Log in JSON format
  ),
  defaultMeta: { service: 'auth-service' }, // Add service name to all logs
  transports: [
    // - Write all logs with level `info` and below to the console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // Add colors for readability in console
        winston.format.simple() // Simple format for console
      )
    })
    // TODO: Add file transport for production logging
    // new winston.transports.File({ filename: 'auth-service-error.log', level: 'error' }),
    // new winston.transports.File({ filename: 'auth-service-combined.log' })
  ],
});

// Create a stream object with a 'write' function that will be used by `morgan` replacement
logger.stream = {
  write: (message) => {
    // Use the 'http' level for HTTP request logging
    logger.http(message.trim());
  },
};

module.exports = logger;