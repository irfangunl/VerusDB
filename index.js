/**
 * VerusDB - Encrypted Node.js Embedded Database
 * Main entry point for the VerusDB module
 * Production-ready with enhanced features
 */

const VerusDB = require('./src/engine/VerusDB');
const { VerusAdmin } = require('./src/api/admin-server');
const { importData, exportData } = require('./src/io/data-io');
const { createMigration, runMigration } = require('./src/io/migration');
const { logger } = require('./src/utils/logger');
const { config } = require('./src/utils/config');
const { performanceMonitor } = require('./src/utils/performance');

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason, promise });
  process.exit(1);
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  
  // Stop performance monitoring
  performanceMonitor.reset();
  
  // Exit process
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Log startup information
logger.info('VerusDB starting', {
  version: require('./package.json').version,
  nodeVersion: process.version,
  platform: process.platform,
  environment: process.env.NODE_ENV || 'development'
});

module.exports = VerusDB;
module.exports.VerusDB = VerusDB;
module.exports.VerusAdmin = VerusAdmin;
module.exports.importData = importData;
module.exports.exportData = exportData;
module.exports.createMigration = createMigration;
module.exports.runMigration = runMigration;
module.exports.logger = logger;
module.exports.config = config;
module.exports.performanceMonitor = performanceMonitor;