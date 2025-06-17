/**
 * VerusDB Security Middleware
 * Rate limiting, input validation, and security headers
 */

const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');
const { RateLimitError, ValidationError } = require('./errors');
const { logger } = require('./logger');
const { performanceMonitor } = require('./performance');

class SecurityMiddleware {
  constructor(config) {
    this.config = config;
    this.loginAttempts = new Map(); // Track failed login attempts by IP
  }

  // Rate limiting middleware
  createRateLimiter(options = {}) {
    const defaultOptions = {
      windowMs: this.config.get('admin.rateLimit.windowMs'),
      max: this.config.get('admin.rateLimit.max'),
      message: this.config.get('admin.rateLimit.message'),
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        performanceMonitor.incrementCounter('rate_limit_exceeded', 1, {
          ip: req.ip,
          path: req.path
        });
        
        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          userAgent: req.get('User-Agent')
        });
        
        const error = new RateLimitError('Too many requests');
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
          retryAfter: Math.ceil(options.windowMs / 1000)
        });
      },
      skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/metrics';
      }
    };

    return rateLimit({ ...defaultOptions, ...options });
  }

  // Specific rate limiter for authentication endpoints
  createAuthRateLimiter() {
    return this.createRateLimiter({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      message: 'Too many authentication attempts'
    });
  }

  // Security headers middleware
  createSecurityHeaders() {
    return helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false, // Allow for admin panel functionality
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    });
  }

  // Input sanitization middleware
  sanitizeInput() {
    return (req, res, next) => {
      try {
        // Sanitize query parameters
        for (const key in req.query) {
          if (typeof req.query[key] === 'string') {
            req.query[key] = validator.escape(req.query[key]);
          }
        }

        // Sanitize body for specific endpoints
        if (req.body && typeof req.body === 'object') {
          this.sanitizeObject(req.body);
        }

        next();
      } catch (error) {
        logger.error('Input sanitization failed', { error: error.message, path: req.path });
        next(new ValidationError('Invalid input data'));
      }
    };
  }

  sanitizeObject(obj) {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Only escape HTML for specific fields that might be displayed
        if (this.shouldEscapeField(key)) {
          obj[key] = validator.escape(obj[key]);
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        this.sanitizeObject(obj[key]);
      }
    }
  }

  shouldEscapeField(fieldName) {
    const fieldsToEscape = ['name', 'description', 'title', 'comment', 'label'];
    return fieldsToEscape.includes(fieldName.toLowerCase());
  }

  // Request validation middleware
  validateRequest(schema) {
    return (req, res, next) => {
      try {
        const validationResult = this.validateRequestData(req, schema);
        if (!validationResult.valid) {
          throw new ValidationError(validationResult.errors.join(', '));
        }
        next();
      } catch (error) {
        logger.warn('Request validation failed', {
          path: req.path,
          method: req.method,
          error: error.message
        });
        next(error);
      }
    };
  }

  validateRequestData(req, schema) {
    const errors = [];

    // Validate required fields
    if (schema.required) {
      for (const field of schema.required) {
        if (!req.body[field]) {
          errors.push(`Required field '${field}' is missing`);
        }
      }
    }

    // Validate field types and constraints
    if (schema.fields) {
      for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
        const value = req.body[fieldName];
        
        if (value !== undefined) {
          const fieldErrors = this.validateField(fieldName, value, fieldSchema);
          errors.push(...fieldErrors);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  validateField(fieldName, value, schema) {
    const errors = [];

    // Type validation
    if (schema.type) {
      if (!this.isValidType(value, schema.type)) {
        errors.push(`Field '${fieldName}' must be of type ${schema.type}`);
        return errors; // Don't continue if type is wrong
      }
    }

    // String validations
    if (typeof value === 'string') {
      if (schema.minLength && value.length < schema.minLength) {
        errors.push(`Field '${fieldName}' must be at least ${schema.minLength} characters`);
      }
      if (schema.maxLength && value.length > schema.maxLength) {
        errors.push(`Field '${fieldName}' must be at most ${schema.maxLength} characters`);
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push(`Field '${fieldName}' format is invalid`);
      }
      if (schema.email && !validator.isEmail(value)) {
        errors.push(`Field '${fieldName}' must be a valid email address`);
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        errors.push(`Field '${fieldName}' must be at least ${schema.min}`);
      }
      if (schema.max !== undefined && value > schema.max) {
        errors.push(`Field '${fieldName}' must be at most ${schema.max}`);
      }
    }

    // Array validations
    if (Array.isArray(value)) {
      if (schema.minItems && value.length < schema.minItems) {
        errors.push(`Field '${fieldName}' must have at least ${schema.minItems} items`);
      }
      if (schema.maxItems && value.length > schema.maxItems) {
        errors.push(`Field '${fieldName}' must have at most ${schema.maxItems} items`);
      }
    }

    return errors;
  }

  isValidType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  // Login attempt tracking
  trackLoginAttempt(ip, success) {
    const maxAttempts = this.config.get('security.maxLoginAttempts');
    const lockoutDuration = this.config.get('security.lockoutDuration');
    
    if (!this.loginAttempts.has(ip)) {
      this.loginAttempts.set(ip, {
        attempts: 0,
        lockedUntil: null
      });
    }

    const attemptData = this.loginAttempts.get(ip);

    if (success) {
      // Reset on successful login
      attemptData.attempts = 0;
      attemptData.lockedUntil = null;
    } else {
      attemptData.attempts++;
      
      if (attemptData.attempts >= maxAttempts) {
        attemptData.lockedUntil = Date.now() + lockoutDuration;
        
        logger.warn('IP locked due to failed login attempts', {
          ip,
          attempts: attemptData.attempts,
          lockedUntil: new Date(attemptData.lockedUntil)
        });
      }
    }

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      this.cleanupLoginAttempts();
    }
  }

  isIpLocked(ip) {
    const attemptData = this.loginAttempts.get(ip);
    if (!attemptData || !attemptData.lockedUntil) {
      return false;
    }

    if (Date.now() > attemptData.lockedUntil) {
      // Lockout expired
      attemptData.lockedUntil = null;
      attemptData.attempts = 0;
      return false;
    }

    return true;
  }

  cleanupLoginAttempts() {
    const now = Date.now();
    for (const [ip, data] of this.loginAttempts.entries()) {
      if (data.lockedUntil && now > data.lockedUntil + (24 * 60 * 60 * 1000)) {
        // Remove entries older than 24 hours after lockout
        this.loginAttempts.delete(ip);
      }
    }
  }

  // CORS configuration
  configureCors() {
    const corsOrigins = this.config.get('admin.corsOrigins');
    
    return {
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        if (corsOrigins.includes('*') || corsOrigins.includes(origin)) {
          callback(null, true);
        } else {
          logger.warn('CORS origin rejected', { origin });
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      optionsSuccessStatus: 200,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID']
    };
  }

  // Request logging middleware
  createRequestLogger() {
    return (req, res, next) => {
      const startTime = Date.now();
      
      // Log request
      logger.debug('Request started', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Override res.end to log response
      const originalEnd = res.end;
      res.end = function(...args) {
        const duration = Date.now() - startTime;
        
        logger.info('Request completed', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          ip: req.ip
        });

        performanceMonitor.recordHistogram('http_request_duration', duration, {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode
        });

        originalEnd.apply(res, args);
      };

      next();
    };
  }
}

module.exports = { SecurityMiddleware };
