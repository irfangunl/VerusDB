/**
 * VerusDB Main Database Engine
 * Core database operations, CRUD, indexing, and query processing
 * Production-ready with enhanced error handling, logging, and performance monitoring
 */

const VDBStorage = require('../storage/VDBStorage');
const VerusEncryption = require('../crypto/encryption');
const VerusSchema = require('../schema/Schema');
const { VerusAdmin } = require('../api/admin-server');
const { logger } = require('../utils/logger');
const { config } = require('../utils/config');
const { performanceMonitor } = require('../utils/performance');
const { 
  ErrorFactory, 
  CollectionError, 
  ValidationError, 
  DatabaseError,
  PerformanceError
} = require('../utils/errors');

class VerusDB {
  constructor(options = {}) {
    // Merge with configuration
    const dbConfig = config.get('database');
    this.path = options.path || dbConfig.path;
    this.encryptionKey = options.encryptionKey || dbConfig.encryptionKey;
    
    if (!this.encryptionKey) {
      throw ErrorFactory.createValidationError('Encryption key is required');
    }
    
    this.encryption = new VerusEncryption();
    this.schema = new VerusSchema();
    this.storage = new VDBStorage(this.path, this.encryption);
    
    this.collections = new Map();
    this.indexes = new Map();
    this.isInitialized = false;
    
    // Performance tracking
    this.operationQueue = [];
    this.maxConcurrentOperations = config.get('performance.maxConcurrentOperations');
    this.currentOperations = 0;
    
    // Cache for frequently accessed data
    this.documentCache = new Map();
    this.maxCacheSize = config.get('performance.documentCacheSize');
    
    logger.info('VerusDB instance created', { 
      path: this.path, 
      encrypted: true,
      cacheSize: this.maxCacheSize 
    });
  }
  /**
   * Initialize database
   * @returns {Promise<void>}
   */
  async init() {
    if (this.isInitialized) return;

    const timer = performanceMonitor.startTimer('db_init');
    
    try {
      logger.info('Initializing VerusDB', { path: this.path });
      
      await this.storage.initialize(this.encryptionKey);
      await this.loadCollections();
      
      this.isInitialized = true;
      
      const duration = performanceMonitor.endTimer(timer);
      logger.info('VerusDB initialized successfully', { 
        path: this.path, 
        collections: this.collections.size,
        duration: `${duration.toFixed(2)}ms`
      });
      
      performanceMonitor.recordDatabaseOperation('init', 'system', duration, true);
      
    } catch (error) {
      performanceMonitor.endTimer(timer);
      const dbError = ErrorFactory.fromSystemError(error, 'init');
      logger.error('Failed to initialize VerusDB', { 
        path: this.path, 
        error: dbError.message 
      });
      throw dbError;
    }
  }
  /**
   * Load collections from storage
   * @returns {Promise<void>}
   */
  async loadCollections() {
    try {
      logger.debug('Loading collections from storage');
      
      // Load collection schemas and data
      const collections = this.storage.collections;
      
      for (const [name, collectionData] of collections.entries()) {
        this.collections.set(name, {
          schema: this.schema.deserializeSchema(collectionData.schema),
          documents: new Map(Object.entries(collectionData.documents || {})),
          indexes: collectionData.indexes || {}
        });
        
        logger.debug('Loaded collection', { 
          name, 
          documentCount: Object.keys(collectionData.documents || {}).length 
        });
      }

      // Load indexes
      for (const [key, indexData] of this.storage.indexes.entries()) {
        this.indexes.set(key, indexData);
      }
      
      logger.info('Collections loaded', { 
        collectionCount: this.collections.size,
        indexCount: this.indexes.size 
      });
      
    } catch (error) {
      const dbError = ErrorFactory.fromSystemError(error, 'loadCollections');
      logger.error('Failed to load collections', { error: dbError.message });
      throw dbError;
    }
  }
  /**
   * Create a new collection with schema
   * @param {string} name - Collection name
   * @param {Object} options - Collection options
   * @returns {Promise<void>}
   */
  async createCollection(name, options = {}) {
    await this.init();

    if (!name || typeof name !== 'string') {
      throw ErrorFactory.createValidationError('Collection name must be a non-empty string');
    }

    if (this.collections.has(name)) {
      throw ErrorFactory.createCollectionError(`Collection ${name} already exists`, name);
    }

    const timer = performanceMonitor.startTimer('db_create_collection');
    
    try {
      logger.info('Creating collection', { name, options });
      
      const schema = options.schema ? this.schema.validateSchema(options.schema) : {};
      
      const collection = {
        schema,
        documents: new Map(),
        indexes: {}
      };

      this.collections.set(name, collection);
      
      // Save to storage
      await this.saveCollection(name);

      // Create default indexes
      if (options.indexes) {
        for (const field of options.indexes) {
          await this.createIndex(name, field);
        }
      }
      
      const duration = performanceMonitor.endTimer(timer);
      logger.info('Collection created successfully', { 
        name, 
        schema: Object.keys(schema).length,
        indexes: options.indexes?.length || 0,
        duration: `${duration.toFixed(2)}ms`
      });
      
      performanceMonitor.recordDatabaseOperation('createCollection', name, duration, true);
      
    } catch (error) {
      performanceMonitor.endTimer(timer);
      const dbError = ErrorFactory.fromSystemError(error, 'createCollection');
      logger.error('Failed to create collection', { name, error: dbError.message });
      performanceMonitor.recordDatabaseOperation('createCollection', name, 0, false);
      throw dbError;
    }
  }

  /**
   * Drop collection
   * @param {string} name - Collection name
   * @returns {Promise<void>}
   */
  async dropCollection(name) {
    await this.init();

    if (!this.collections.has(name)) {
      throw new Error(`Collection ${name} does not exist`);
    }

    this.collections.delete(name);
    this.storage.deleteCollection(name);
    await this.storage.saveToFile();
  }

  /**
   * Insert document into collection
   * @param {string} collectionName - Collection name
   * @param {Object} document - Document to insert
   * @returns {Promise<Object>} Inserted document with _id
   */
  async insert(collectionName, document) {
    await this.init();

    const collection = this.getCollection(collectionName);
    
    // Validate document against schema
    const validatedDoc = this.schema.validateDocument(document, collection.schema);
    
    // Encrypt fields if needed
    const processedDoc = await this.processDocumentForStorage(validatedDoc, collection.schema);
    
    // Check unique constraints
    await this.checkUniqueConstraints(collectionName, processedDoc, collection.schema);
    
    // Store document
    collection.documents.set(processedDoc._id, processedDoc);
    
    // Update indexes
    await this.updateIndexesOnInsert(collectionName, processedDoc);
    
    // Save to storage
    await this.saveCollection(collectionName);
    
    return await this.processDocumentFromStorage(processedDoc, collection.schema);
  }

  /**
   * Find documents in collection
   * @param {string} collectionName - Collection name
   * @param {Object} query - Query filter
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Found documents
   */
  async find(collectionName, query = {}, options = {}) {
    await this.init();

    const collection = this.getCollection(collectionName);
    let documents = Array.from(collection.documents.values());

    // Apply query filter
    if (Object.keys(query).length > 0) {
      documents = await this.filterDocuments(documents, query, collection.schema);
    }

    // Apply sorting
    if (options.sort) {
      documents = this.sortDocuments(documents, options.sort);
    }

    // Apply limit and skip
    if (options.skip) {
      documents = documents.slice(options.skip);
    }
    if (options.limit) {
      documents = documents.slice(0, options.limit);
    }

    // Process documents from storage (decrypt fields)
    const processedDocs = [];
    for (const doc of documents) {
      processedDocs.push(await this.processDocumentFromStorage(doc, collection.schema));
    }

    return processedDocs;
  }

  /**
   * Find one document in collection
   * @param {string} collectionName - Collection name
   * @param {Object} query - Query filter
   * @returns {Promise<Object|null>} Found document or null
   */
  async findOne(collectionName, query = {}) {
    const results = await this.find(collectionName, query, { limit: 1 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Update documents in collection
   * @param {string} collectionName - Collection name
   * @param {Object} filter - Update filter
   * @param {Object} update - Update operations
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Update result
   */
  async update(collectionName, filter, update, options = {}) {
    await this.init();

    const collection = this.getCollection(collectionName);
    let documents = Array.from(collection.documents.values());

    // Find documents to update
    const documentsToUpdate = await this.filterDocuments(documents, filter, collection.schema);
    
    if (documentsToUpdate.length === 0) {
      return { matchedCount: 0, modifiedCount: 0 };
    }

    let modifiedCount = 0;
    const updateMany = options.multi !== false;

    for (const doc of documentsToUpdate) {
      if (!updateMany && modifiedCount > 0) break;

      const originalDoc = await this.processDocumentFromStorage(doc, collection.schema);
      const updatedDoc = this.applyUpdate(originalDoc, update);
      
      // Validate updated document
      const validatedDoc = this.schema.validateDocument(updatedDoc, collection.schema);
      
      // Process for storage
      const processedDoc = await this.processDocumentForStorage(validatedDoc, collection.schema);
      
      // Update document in collection
      collection.documents.set(doc._id, processedDoc);
      
      // Update indexes
      await this.updateIndexesOnUpdate(collectionName, doc, processedDoc);
      
      modifiedCount++;
    }

    // Save to storage
    await this.saveCollection(collectionName);

    return {
      matchedCount: documentsToUpdate.length,
      modifiedCount
    };
  }

  /**
   * Delete documents from collection
   * @param {string} collectionName - Collection name
   * @param {Object} filter - Delete filter
   * @param {Object} options - Delete options
   * @returns {Promise<Object>} Delete result
   */
  async delete(collectionName, filter, options = {}) {
    await this.init();

    const collection = this.getCollection(collectionName);
    let documents = Array.from(collection.documents.values());

    // Find documents to delete
    const documentsToDelete = await this.filterDocuments(documents, filter, collection.schema);
    
    if (documentsToDelete.length === 0) {
      return { deletedCount: 0 };
    }

    let deletedCount = 0;
    const deleteMany = options.multi !== false;

    for (const doc of documentsToDelete) {
      if (!deleteMany && deletedCount > 0) break;

      // Remove from collection
      collection.documents.delete(doc._id);
      
      // Update indexes
      await this.updateIndexesOnDelete(collectionName, doc);
      
      deletedCount++;
    }

    // Save to storage
    await this.saveCollection(collectionName);

    return { deletedCount };
  }

  /**
   * Create index on collection field
   * @param {string} collectionName - Collection name
   * @param {string} field - Field to index
   * @param {Object} options - Index options
   * @returns {Promise<void>}
   */
  async createIndex(collectionName, field, options = {}) {
    await this.init();

    const collection = this.getCollection(collectionName);
    const indexKey = `${collectionName}.${field}`;
    
    if (this.indexes.has(indexKey)) {
      throw new Error(`Index on ${collectionName}.${field} already exists`);
    }

    const index = {
      field,
      unique: options.unique || false,
      sparse: options.sparse || false,
      data: new Map()
    };

    // Build index from existing documents
    for (const doc of collection.documents.values()) {
      const value = this.getFieldValue(doc, field);
      if (value !== undefined || !index.sparse) {
        this.addToIndex(index, value, doc._id);
      }
    }

    this.indexes.set(indexKey, index);
    this.storage.setIndex(indexKey, this.serializeIndex(index));
    await this.storage.saveToFile();
  }

  /**
   * Drop index
   * @param {string} collectionName - Collection name
   * @param {string} field - Field index to drop
   * @returns {Promise<void>}
   */
  async dropIndex(collectionName, field) {
    await this.init();

    const indexKey = `${collectionName}.${field}`;
    
    if (!this.indexes.has(indexKey)) {
      throw new Error(`Index on ${collectionName}.${field} does not exist`);
    }

    this.indexes.delete(indexKey);
    this.storage.deleteIndex(indexKey);
    await this.storage.saveToFile();
  }

  /**
   * Get collection statistics
   * @param {string} collectionName - Collection name
   * @returns {Promise<Object>} Collection stats
   */
  async getStats(collectionName) {
    await this.init();

    const collection = this.getCollection(collectionName);
    
    return {
      name: collectionName,
      documentCount: collection.documents.size,
      indexes: Object.keys(collection.indexes).length,
      schema: collection.schema
    };
  }

  /**
   * Export database data
   * @param {Object} options - Export options
   * @returns {Promise<Object>} Exported data
   */
  async export(options = {}) {
    await this.init();

    const exportData = {
      version: 1,
      created: new Date(),
      collections: {}
    };

    for (const [name, collection] of this.collections.entries()) {
      const documents = [];
      for (const doc of collection.documents.values()) {
        documents.push(await this.processDocumentFromStorage(doc, collection.schema));
      }

      exportData.collections[name] = {
        schema: this.schema.serializeSchema(collection.schema),
        documents
      };
    }

    return exportData;
  }

  /**
   * Import database data
   * @param {Object} data - Data to import
   * @returns {Promise<void>}
   */
  async import(data) {
    await this.init();

    if (!data.collections) {
      throw new Error('Invalid import data format');
    }

    for (const [name, collectionData] of Object.entries(data.collections)) {
      // Create collection if it doesn't exist
      if (!this.collections.has(name)) {
        await this.createCollection(name, { schema: collectionData.schema });
      }

      // Insert documents
      if (collectionData.documents) {
        for (const doc of collectionData.documents) {
          await this.insert(name, doc);
        }
      }
    }
  }

  /**
   * Start admin panel server
   * @param {Object} options - Server options
   * @returns {Promise<Object>} Server instance
   */
  async serveAdmin(options = {}) {
    const admin = new VerusAdmin(this, options);
    return await admin.start();
  }

  // Helper methods
  getCollection(name) {
    if (!this.collections.has(name)) {
      throw new CollectionError(`Collection ${name} does not exist`, name);
    }
    return this.collections.get(name);
  }

  async saveCollection(name) {
    const collection = this.collections.get(name);
    this.storage.setCollection(name, {
      schema: this.schema.serializeSchema(collection.schema),
      documents: Object.fromEntries(collection.documents),
      indexes: collection.indexes
    });
    await this.storage.saveToFile();
  }

  async processDocumentForStorage(document, schema) {
    const processed = { ...document };
    
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      if (fieldDef.encrypted && processed[fieldName] !== undefined) {
        processed[fieldName] = this.encryption.encryptField(processed[fieldName], this.storage.encryptionKey);
      }
    }
    
    return processed;
  }

  async processDocumentFromStorage(document, schema) {
    const processed = { ...document };
    
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      if (fieldDef.encrypted && processed[fieldName] !== undefined) {
        processed[fieldName] = this.encryption.decryptField(processed[fieldName], this.storage.encryptionKey);
      }
    }
    
    return processed;
  }

  async filterDocuments(documents, query, schema) {
    const filtered = [];
    
    for (const doc of documents) {
      const processedDoc = await this.processDocumentFromStorage(doc, schema);
      if (this.matchesQuery(processedDoc, query)) {
        filtered.push(doc);
      }
    }
    
    return filtered;
  }

  matchesQuery(document, query) {
    for (const [field, value] of Object.entries(query)) {
      const docValue = this.getFieldValue(document, field);
      
      if (typeof value === 'object' && value !== null) {
        // Handle operators like $gt, $lt, etc.
        if (!this.matchesOperator(docValue, value)) {
          return false;
        }
      } else {
        // Direct value comparison
        if (docValue !== value) {
          return false;
        }
      }
    }
    
    return true;
  }

  matchesOperator(value, operator) {
    for (const [op, opValue] of Object.entries(operator)) {
      switch (op) {
        case '$eq':
          if (value !== opValue) return false;
          break;
        case '$ne':
          if (value === opValue) return false;
          break;
        case '$gt':
          if (value <= opValue) return false;
          break;
        case '$gte':
          if (value < opValue) return false;
          break;
        case '$lt':
          if (value >= opValue) return false;
          break;
        case '$lte':
          if (value > opValue) return false;
          break;
        case '$in':
          if (!Array.isArray(opValue) || !opValue.includes(value)) return false;
          break;
        case '$nin':
          if (!Array.isArray(opValue) || opValue.includes(value)) return false;
          break;
        case '$regex':
          const regex = new RegExp(opValue);
          if (!regex.test(value)) return false;
          break;
        default:
          throw new Error(`Unsupported operator: ${op}`);
      }
    }
    return true;
  }

  getFieldValue(document, field) {
    const parts = field.split('.');
    let value = document;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  sortDocuments(documents, sort) {
    return documents.sort((a, b) => {
      for (const [field, direction] of Object.entries(sort)) {
        const aValue = this.getFieldValue(a, field);
        const bValue = this.getFieldValue(b, field);
        
        let comparison = 0;
        if (aValue < bValue) comparison = -1;
        else if (aValue > bValue) comparison = 1;
        
        if (direction === -1) comparison *= -1;
        
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
  }

  applyUpdate(document, update) {
    const updated = { ...document };
    
    for (const [operator, operations] of Object.entries(update)) {
      switch (operator) {
        case '$set':
          Object.assign(updated, operations);
          break;
        case '$unset':
          for (const field of Object.keys(operations)) {
            delete updated[field];
          }
          break;
        case '$inc':
          for (const [field, increment] of Object.entries(operations)) {
            updated[field] = (updated[field] || 0) + increment;
          }
          break;
        case '$push':
          for (const [field, value] of Object.entries(operations)) {
            if (!Array.isArray(updated[field])) {
              updated[field] = [];
            }
            updated[field].push(value);
          }
          break;
        case '$pull':
          for (const [field, value] of Object.entries(operations)) {
            if (Array.isArray(updated[field])) {
              updated[field] = updated[field].filter(item => item !== value);
            }
          }
          break;
        default:
          throw new Error(`Unsupported update operator: ${operator}`);
      }
    }
    
    updated.updatedAt = new Date();
    return updated;
  }

  async checkUniqueConstraints(collectionName, document, schema) {
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      if (fieldDef.unique && document[fieldName] !== undefined) {
        const existing = await this.findOne(collectionName, { [fieldName]: document[fieldName] });
        if (existing && existing._id !== document._id) {
          throw new Error(`Duplicate value for unique field ${fieldName}`);
        }
      }
    }
  }

  async updateIndexesOnInsert(collectionName, document) {
    for (const [indexKey, index] of this.indexes.entries()) {
      if (indexKey.startsWith(`${collectionName}.`)) {
        const field = indexKey.split('.').slice(1).join('.');
        const value = this.getFieldValue(document, field);
        if (value !== undefined || !index.sparse) {
          this.addToIndex(index, value, document._id);
        }
      }
    }
  }

  async updateIndexesOnUpdate(collectionName, oldDoc, newDoc) {
    for (const [indexKey, index] of this.indexes.entries()) {
      if (indexKey.startsWith(`${collectionName}.`)) {
        const field = indexKey.split('.').slice(1).join('.');
        const oldValue = this.getFieldValue(oldDoc, field);
        const newValue = this.getFieldValue(newDoc, field);
        
        if (oldValue !== newValue) {
          this.removeFromIndex(index, oldValue, oldDoc._id);
          if (newValue !== undefined || !index.sparse) {
            this.addToIndex(index, newValue, newDoc._id);
          }
        }
      }
    }
  }

  async updateIndexesOnDelete(collectionName, document) {
    for (const [indexKey, index] of this.indexes.entries()) {
      if (indexKey.startsWith(`${collectionName}.`)) {
        const field = indexKey.split('.').slice(1).join('.');
        const value = this.getFieldValue(document, field);
        this.removeFromIndex(index, value, document._id);
      }
    }
  }

  addToIndex(index, value, docId) {
    const key = value === null ? '__null__' : value === undefined ? '__undefined__' : String(value);
    
    if (!index.data.has(key)) {
      index.data.set(key, new Set());
    }
    
    if (index.unique && index.data.get(key).size > 0) {
      throw new Error(`Duplicate value for unique index: ${value}`);
    }
    
    index.data.get(key).add(docId);
  }

  removeFromIndex(index, value, docId) {
    const key = value === null ? '__null__' : value === undefined ? '__undefined__' : String(value);
    
    if (index.data.has(key)) {
      index.data.get(key).delete(docId);
      if (index.data.get(key).size === 0) {
        index.data.delete(key);
      }
    }
  }

  serializeIndex(index) {
    return {
      field: index.field,
      unique: index.unique,
      sparse: index.sparse,
      data: Object.fromEntries(
        Array.from(index.data.entries()).map(([key, set]) => [key, Array.from(set)])
      )
    };
  }
}

module.exports = VerusDB;