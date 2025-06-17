/**
 * VerusDB Schema System
 * Handles collection schemas, validation, and field definitions
 */

class VerusSchema {
  constructor() {
    this.supportedTypes = [
      'string', 'number', 'boolean', 'date', 'object', 'array', 'buffer'
    ];
  }

  /**
   * Validate schema definition
   * @param {Object} schema - Schema definition
   * @returns {Object} Validated schema
   */
  validateSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      throw new Error('Schema must be an object');
    }

    const validatedSchema = {};

    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      validatedSchema[fieldName] = this.validateFieldDefinition(fieldName, fieldDef);
    }

    return validatedSchema;
  }

  /**
   * Validate field definition
   * @param {string} fieldName - Field name
   * @param {Object} fieldDef - Field definition
   * @returns {Object} Validated field definition
   */
  validateFieldDefinition(fieldName, fieldDef) {
    if (typeof fieldDef === 'string') {
      // Simple type definition: { name: 'string' }
      fieldDef = { type: fieldDef };
    }

    if (!fieldDef.type || !this.supportedTypes.includes(fieldDef.type)) {
      throw new Error(`Invalid type for field ${fieldName}. Supported types: ${this.supportedTypes.join(', ')}`);
    }

    const validated = {
      type: fieldDef.type,
      required: fieldDef.required || false,
      encrypted: fieldDef.encrypted || false,
      unique: fieldDef.unique || false,
      index: fieldDef.index || false,
      default: fieldDef.default,
      validate: fieldDef.validate,
      min: fieldDef.min,
      max: fieldDef.max,
      minLength: fieldDef.minLength,
      maxLength: fieldDef.maxLength,
      enum: fieldDef.enum,
      ref: fieldDef.ref // Reference to another collection
    };

    // Validate default value type
    if (validated.default !== undefined) {
      if (typeof validated.default === 'function') {
        // Allow function defaults like () => new Date()
        validated.default = validated.default;
      } else {
        this.validateFieldValue(fieldName, validated.default, validated);
      }
    }

    return validated;
  }

  /**
   * Validate document against schema
   * @param {Object} document - Document to validate
   * @param {Object} schema - Schema definition
   * @returns {Object} Validated and processed document
   */
  validateDocument(document, schema) {
    if (!document || typeof document !== 'object') {
      throw new Error('Document must be an object');
    }

    const validatedDoc = {};

    // Add default values and validate required fields
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      let value = document[fieldName];

      // Handle default values
      if (value === undefined) {
        if (fieldDef.default !== undefined) {
          if (typeof fieldDef.default === 'function') {
            value = fieldDef.default();
          } else {
            value = fieldDef.default;
          }
        } else if (fieldDef.required) {
          throw new Error(`Required field ${fieldName} is missing`);
        }
      }

      // Validate field value if present
      if (value !== undefined) {
        this.validateFieldValue(fieldName, value, fieldDef);
        validatedDoc[fieldName] = value;
      }
    }    // Check for extra fields not in schema (excluding system fields)
    const systemFields = ['_id', 'createdAt', 'updatedAt'];
    for (const fieldName of Object.keys(document)) {
      if (!schema[fieldName] && !systemFields.includes(fieldName)) {
        throw new Error(`Field ${fieldName} is not defined in schema`);
      }
    }

    // Preserve system fields from original document
    for (const fieldName of systemFields) {
      if (document[fieldName] !== undefined) {
        validatedDoc[fieldName] = document[fieldName];
      }
    }

    // Add _id if not present
    if (!validatedDoc._id) {
      validatedDoc._id = this.generateId();
    }

    // Add timestamps
    const now = new Date();
    if (!validatedDoc.createdAt) {
      validatedDoc.createdAt = now;
    }
    validatedDoc.updatedAt = now;

    return validatedDoc;
  }

  /**
   * Validate field value against field definition
   * @param {string} fieldName - Field name
   * @param {any} value - Field value
   * @param {Object} fieldDef - Field definition
   */
  validateFieldValue(fieldName, value, fieldDef) {
    // Type validation
    if (!this.isValidType(value, fieldDef.type)) {
      throw new Error(`Field ${fieldName} must be of type ${fieldDef.type}`);
    }

    // Enum validation
    if (fieldDef.enum && !fieldDef.enum.includes(value)) {
      throw new Error(`Field ${fieldName} must be one of: ${fieldDef.enum.join(', ')}`);
    }

    // Range validation for numbers
    if (fieldDef.type === 'number') {
      if (fieldDef.min !== undefined && value < fieldDef.min) {
        throw new Error(`Field ${fieldName} must be >= ${fieldDef.min}`);
      }
      if (fieldDef.max !== undefined && value > fieldDef.max) {
        throw new Error(`Field ${fieldName} must be <= ${fieldDef.max}`);
      }
    }

    // Length validation for strings and arrays
    if (fieldDef.type === 'string' || fieldDef.type === 'array') {
      const length = value.length;
      if (fieldDef.minLength !== undefined && length < fieldDef.minLength) {
        throw new Error(`Field ${fieldName} must have length >= ${fieldDef.minLength}`);
      }
      if (fieldDef.maxLength !== undefined && length > fieldDef.maxLength) {
        throw new Error(`Field ${fieldName} must have length <= ${fieldDef.maxLength}`);
      }
    }

    // Custom validation
    if (fieldDef.validate && typeof fieldDef.validate === 'function') {
      const result = fieldDef.validate(value);
      if (result !== true) {
        throw new Error(`Field ${fieldName} validation failed: ${result || 'Invalid value'}`);
      }
    }
  }

  /**
   * Check if value is of correct type
   * @param {any} value - Value to check
   * @param {string} type - Expected type
   * @returns {boolean} Type check result
   */
  isValidType(value, type) {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
      case 'object':
        return value !== null && typeof value === 'object' && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'buffer':
        return Buffer.isBuffer(value);
      default:
        return false;
    }
  }

  /**
   * Generate unique ID
   * @returns {string} Unique identifier
   */
  generateId() {
    const timestamp = Date.now().toString(36);
    const randomPart = Math.random().toString(36).substr(2, 9);
    return `${timestamp}_${randomPart}`;
  }

  /**
   * Get schema for serialization
   * @param {Object} schema - Schema object
   * @returns {Object} Serializable schema
   */
  serializeSchema(schema) {
    return JSON.parse(JSON.stringify(schema, (key, value) => {
      // Convert functions to string representations
      if (typeof value === 'function') {
        return value.toString();
      }
      return value;
    }));
  }

  /**
   * Restore schema from serialization
   * @param {Object} serializedSchema - Serialized schema
   * @returns {Object} Restored schema
   */
  deserializeSchema(serializedSchema) {
    return JSON.parse(JSON.stringify(serializedSchema), (key, value) => {
      // Restore function from string representation
      if (typeof value === 'string' && (key === 'default' || key === 'validate')) {
        try {
          // Simple check for function syntax
          if (value.startsWith('function') || value.includes('=>')) {
            return eval(`(${value})`);
          }
        } catch (e) {
          // Return as string if not a valid function
          return value;
        }
      }
      return value;
    });
  }
}

module.exports = VerusSchema;