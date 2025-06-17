/**
 * VerusDB Configuration Management
 * Environment-based configuration with validation and defaults
 */

const path = require('path');
const { ConfigurationError } = require('./errors');

class Config {
  constructor(overrides = {}) {
    this.config = this.loadConfiguration(overrides);
    this.validateConfiguration();
  }

  loadConfiguration(overrides = {}) {
    const defaults = {
      // Database settings
      database: {
        path: process.env.VERUSDB_PATH || './data.vdb',
        encryptionKey: process.env.VERUSDB_ENCRYPTION_KEY || null,
        backupDir: process.env.VERUSDB_BACKUP_DIR || './backups',
        maxFileSize: parseInt(process.env.VERUSDB_MAX_FILE_SIZE) || 1024 * 1024 * 1024, // 1GB
        compressionLevel: parseInt(process.env.VERUSDB_COMPRESSION_LEVEL) || 6,
        syncInterval: parseInt(process.env.VERUSDB_SYNC_INTERVAL) || 5000, // 5 seconds
        autoCompact: process.env.VERUSDB_AUTO_COMPACT === 'true',
        compactThreshold: parseInt(process.env.VERUSDB_COMPACT_THRESHOLD) || 1000
      },

      // Security settings
      security: {
        keyDerivationIterations: parseInt(process.env.VERUSDB_KEY_ITERATIONS) || 100000,
        saltLength: parseInt(process.env.VERUSDB_SALT_LENGTH) || 32,
        passwordMinLength: parseInt(process.env.VERUSDB_PASSWORD_MIN_LENGTH) || 8,
        sessionTimeout: parseInt(process.env.VERUSDB_SESSION_TIMEOUT) || 24 * 60 * 60 * 1000, // 24 hours
        maxLoginAttempts: parseInt(process.env.VERUSDB_MAX_LOGIN_ATTEMPTS) || 5,
        lockoutDuration: parseInt(process.env.VERUSDB_LOCKOUT_DURATION) || 15 * 60 * 1000, // 15 minutes
        enableAuditLog: process.env.VERUSDB_ENABLE_AUDIT_LOG !== 'false'
      },

      // Admin panel settings
      admin: {
        host: process.env.VERUSDB_ADMIN_HOST || 'localhost',
        port: parseInt(process.env.VERUSDB_ADMIN_PORT) || 4321,
        enableHttps: process.env.VERUSDB_ADMIN_HTTPS === 'true',
        tlsCert: process.env.VERUSDB_TLS_CERT || null,
        tlsKey: process.env.VERUSDB_TLS_KEY || null,
        maxRequestSize: process.env.VERUSDB_MAX_REQUEST_SIZE || '50mb',
        enableCors: process.env.VERUSDB_ENABLE_CORS !== 'false',
        corsOrigins: process.env.VERUSDB_CORS_ORIGINS ? 
          process.env.VERUSDB_CORS_ORIGINS.split(',') : ['*'],
        rateLimit: {
          windowMs: parseInt(process.env.VERUSDB_RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
          max: parseInt(process.env.VERUSDB_RATE_LIMIT_MAX) || 1000,
          message: 'Too many requests from this IP'
        }
      },

      // Performance settings
      performance: {
        maxConcurrentOperations: parseInt(process.env.VERUSDB_MAX_CONCURRENT_OPS) || 100,
        queryTimeout: parseInt(process.env.VERUSDB_QUERY_TIMEOUT) || 30000, // 30 seconds
        indexCacheSize: parseInt(process.env.VERUSDB_INDEX_CACHE_SIZE) || 1000,
        documentCacheSize: parseInt(process.env.VERUSDB_DOCUMENT_CACHE_SIZE) || 10000,
        enableQueryOptimization: process.env.VERUSDB_QUERY_OPTIMIZATION !== 'false',
        maxSortDocuments: parseInt(process.env.VERUSDB_MAX_SORT_DOCUMENTS) || 100000,
        maxAggregationDocuments: parseInt(process.env.VERUSDB_MAX_AGGREGATION_DOCS) || 50000
      },

      // Logging settings
      logging: {
        level: process.env.VERUSDB_LOG_LEVEL || 'info',
        enableConsole: process.env.VERUSDB_LOG_CONSOLE !== 'false',
        enableFile: process.env.VERUSDB_LOG_FILE !== 'false',
        logDir: process.env.VERUSDB_LOG_DIR || './logs',
        maxFileSize: parseInt(process.env.VERUSDB_LOG_MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
        maxFiles: parseInt(process.env.VERUSDB_LOG_MAX_FILES) || 5,
        enableStructuredLogging: process.env.VERUSDB_LOG_STRUCTURED !== 'false'
      },

      // Monitoring settings
      monitoring: {
        enableMetrics: process.env.VERUSDB_ENABLE_METRICS !== 'false',
        metricsPort: parseInt(process.env.VERUSDB_METRICS_PORT) || 9090,
        enableHealthCheck: process.env.VERUSDB_ENABLE_HEALTH_CHECK !== 'false',
        healthCheckPath: process.env.VERUSDB_HEALTH_CHECK_PATH || '/health',
        enablePerformanceTracking: process.env.VERUSDB_ENABLE_PERF_TRACKING !== 'false'
      },

      // Development settings
      development: {
        enableDebugMode: process.env.NODE_ENV === 'development',
        enableStackTraces: process.env.VERUSDB_ENABLE_STACK_TRACES === 'true',
        enableProfiler: process.env.VERUSDB_ENABLE_PROFILER === 'true',
        enableHotReload: process.env.VERUSDB_ENABLE_HOT_RELOAD === 'true'
      }
    };

    // Deep merge with overrides
    return this.deepMerge(defaults, overrides);
  }

  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  validateConfiguration() {
    const errors = [];

    // Validate database settings
    if (!this.config.database.path) {
      errors.push('Database path is required');
    }

    if (this.config.database.maxFileSize < 1024 * 1024) {
      errors.push('Database max file size must be at least 1MB');
    }

    if (this.config.database.compressionLevel < 0 || this.config.database.compressionLevel > 9) {
      errors.push('Compression level must be between 0 and 9');
    }

    // Validate security settings
    if (this.config.security.keyDerivationIterations < 10000) {
      errors.push('Key derivation iterations should be at least 10,000 for security');
    }

    if (this.config.security.passwordMinLength < 6) {
      errors.push('Password minimum length should be at least 6 characters');
    }

    // Validate admin panel settings
    if (this.config.admin.port < 1 || this.config.admin.port > 65535) {
      errors.push('Admin panel port must be between 1 and 65535');
    }

    if (this.config.admin.enableHttps && (!this.config.admin.tlsCert || !this.config.admin.tlsKey)) {
      errors.push('TLS certificate and key are required when HTTPS is enabled');
    }

    // Validate performance settings
    if (this.config.performance.maxConcurrentOperations < 1) {
      errors.push('Max concurrent operations must be at least 1');
    }

    if (this.config.performance.queryTimeout < 1000) {
      errors.push('Query timeout must be at least 1000ms');
    }

    // Validate logging settings
    const validLogLevels = ['error', 'warn', 'info', 'debug', 'trace'];
    if (!validLogLevels.includes(this.config.logging.level)) {
      errors.push(`Log level must be one of: ${validLogLevels.join(', ')}`);
    }

    if (errors.length > 0) {
      throw new ConfigurationError(`Configuration validation failed: ${errors.join(', ')}`);
    }
  }

  get(path) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  set(path, value) {
    const keys = path.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
    
    current[keys[keys.length - 1]] = value;
    this.validateConfiguration();
  }

  toJSON() {
    // Return config without sensitive information
    const config = JSON.parse(JSON.stringify(this.config));
    
    // Remove sensitive fields
    if (config.database.encryptionKey) {
      config.database.encryptionKey = '[REDACTED]';
    }
    if (config.admin.tlsKey) {
      config.admin.tlsKey = '[REDACTED]';
    }
    
    return config;
  }

  // Environment detection
  isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }

  isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  isTest() {
    return process.env.NODE_ENV === 'test';
  }
}

// Create singleton instance
const config = new Config();

module.exports = { Config, config };
