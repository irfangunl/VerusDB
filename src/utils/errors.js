/**
 * VerusDB Error System
 * Custom error classes for better error handling and debugging
 */

class VerusDBError extends Error {
  constructor(message, code = 'VERUSDB_ERROR', statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

class ValidationError extends VerusDBError {
  constructor(message, field = null) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
  }
}

class SchemaError extends VerusDBError {
  constructor(message, schema = null) {
    super(message, 'SCHEMA_ERROR', 400);
    this.schema = schema;
  }
}

class CollectionError extends VerusDBError {
  constructor(message, collectionName = null) {
    super(message, 'COLLECTION_ERROR', 404);
    this.collectionName = collectionName;
  }
}

class DocumentError extends VerusDBError {
  constructor(message, documentId = null) {
    super(message, 'DOCUMENT_ERROR', 404);
    this.documentId = documentId;
  }
}

class IndexError extends VerusDBError {
  constructor(message, indexName = null) {
    super(message, 'INDEX_ERROR', 400);
    this.indexName = indexName;
  }
}

class EncryptionError extends VerusDBError {
  constructor(message) {
    super(message, 'ENCRYPTION_ERROR', 500);
  }
}

class StorageError extends VerusDBError {
  constructor(message, filePath = null) {
    super(message, 'STORAGE_ERROR', 500);
    this.filePath = filePath;
  }
}

class AuthenticationError extends VerusDBError {
  constructor(message) {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

class AuthorizationError extends VerusDBError {
  constructor(message) {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

class RateLimitError extends VerusDBError {
  constructor(message) {
    super(message, 'RATE_LIMIT_ERROR', 429);
  }
}

class ConfigurationError extends VerusDBError {
  constructor(message, configKey = null) {
    super(message, 'CONFIGURATION_ERROR', 500);
    this.configKey = configKey;
  }
}

class DatabaseError extends VerusDBError {
  constructor(message, operation = null) {
    super(message, 'DATABASE_ERROR', 500);
    this.operation = operation;
  }
}

class QueryError extends VerusDBError {
  constructor(message, query = null) {
    super(message, 'QUERY_ERROR', 400);
    this.query = query;
  }
}

class ConcurrencyError extends VerusDBError {
  constructor(message) {
    super(message, 'CONCURRENCY_ERROR', 409);
  }
}

class PerformanceError extends VerusDBError {
  constructor(message, metrics = null) {
    super(message, 'PERFORMANCE_ERROR', 500);
    this.metrics = metrics;
  }
}

// Error factory for creating appropriate error types
class ErrorFactory {
  static createValidationError(message, field = null) {
    return new ValidationError(message, field);
  }

  static createCollectionError(message, collectionName = null) {
    return new CollectionError(message, collectionName);
  }

  static createDocumentError(message, documentId = null) {
    return new DocumentError(message, documentId);
  }

  static createAuthenticationError(message = 'Authentication required') {
    return new AuthenticationError(message);
  }

  static createAuthorizationError(message = 'Access denied') {
    return new AuthorizationError(message);
  }

  static createStorageError(message, filePath = null) {
    return new StorageError(message, filePath);
  }

  static createEncryptionError(message) {
    return new EncryptionError(message);
  }

  static fromSystemError(error, operation = null) {
    if (error instanceof VerusDBError) {
      return error;
    }

    // Map common system errors
    switch (error.code) {
      case 'ENOENT':
        return new StorageError(`File not found: ${error.path}`, error.path);
      case 'EACCES':
        return new StorageError(`Permission denied: ${error.path}`, error.path);
      case 'ENOSPC':
        return new StorageError('No space left on device', error.path);
      case 'EMFILE':
      case 'ENFILE':
        return new StorageError('Too many open files');
      default:
        return new DatabaseError(error.message, operation);
    }
  }
}

module.exports = {
  VerusDBError,
  ValidationError,
  SchemaError,
  CollectionError,
  DocumentError,
  IndexError,
  EncryptionError,
  StorageError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  ConfigurationError,
  DatabaseError,
  QueryError,
  ConcurrencyError,
  PerformanceError,
  ErrorFactory
};
