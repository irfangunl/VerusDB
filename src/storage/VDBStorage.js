/**
 * VerusDB Storage System
 * Handles .vdb file format, reading/writing, and file structure management
 */

const fs = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class VDBStorage {
  constructor(filePath, encryption) {
    this.filePath = filePath;
    this.encryption = encryption;
    this.header = {
      magic: Buffer.from('VDB1', 'utf8'), // Magic bytes for VerusDB v1
      version: 1,
      created: new Date(),
      modified: new Date()
    };
    this.isLoaded = false;
    this.collections = new Map();
    this.indexes = new Map();
    this.operationLog = [];
    this._saveInProgress = false;
    this._saveQueue = [];
  }

  /**
   * Initialize or load existing VDB file
   * @param {string} encryptionKey - Encryption key
   * @returns {Promise<void>}
   */
  async initialize(encryptionKey) {
    // Derive encryption key
    let salt;
    if (await this.fileExists()) {
      // Load existing file
      await this.loadFromFile(encryptionKey);
    } else {
      // Create new file
      const keyData = this.encryption.deriveKey(encryptionKey);
      this.encryptionKey = keyData.key;
      this.salt = keyData.salt;
      
      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      
      await this.saveToFile();
    }
    
    this.isLoaded = true;
  }

  /**
   * Check if VDB file exists
   * @returns {Promise<boolean>}
   */
  async fileExists() {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load VDB file from disk
   * @param {string} encryptionKey - Encryption key
   * @returns {Promise<void>}
   */
  async loadFromFile(encryptionKey) {
    try {
      const fileBuffer = await fs.readFile(this.filePath);
      await this.parseVDBFile(fileBuffer, encryptionKey);
    } catch (error) {
      throw new Error(`Failed to load VDB file: ${error.message}`);
    }
  }

  /**
   * Parse VDB file format
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} encryptionKey - Encryption key
   * @returns {Promise<void>}
   */
  async parseVDBFile(fileBuffer, encryptionKey) {
    let offset = 0;

    // Read and validate header
    const magic = fileBuffer.slice(offset, offset + 4);
    offset += 4;
    
    if (!magic.equals(this.header.magic)) {
      throw new Error('Invalid VDB file format');
    }

    // Read version
    const version = fileBuffer.readUInt32LE(offset);
    offset += 4;
    
    if (version !== this.header.version) {
      throw new Error(`Unsupported VDB version: ${version}`);
    }

    // Read salt
    const saltLength = fileBuffer.readUInt32LE(offset);
    offset += 4;
    this.salt = fileBuffer.slice(offset, offset + saltLength);
    offset += saltLength;

    // Derive encryption key
    const keyData = this.encryption.deriveKey(encryptionKey, this.salt);
    this.encryptionKey = keyData.key;    // Read checksum
    const checksumLength = fileBuffer.readUInt32LE(offset);
    offset += 4;
    const storedChecksum = fileBuffer.slice(offset, offset + checksumLength).toString('utf8');
    offset += checksumLength;// Read and decrypt data section
    const encryptedDataLength = fileBuffer.readUInt32LE(offset);
    offset += 4;
    
    const iv = fileBuffer.slice(offset, offset + 16);
    offset += 16;
    const encryptedData = fileBuffer.slice(offset, offset + encryptedDataLength - 16);

    // Verify checksum - simple check on encrypted data only
    if (!this.encryption.verifyChecksum(encryptedData, storedChecksum)) {
      throw new Error('VDB file integrity check failed - file may be corrupted');
    }

    // Decrypt data
    const decryptedData = this.encryption.decrypt({
      encrypted: encryptedData,
      iv
    }, this.encryptionKey);

    // Decompress data
    const decompressedData = await gunzip(decryptedData);
    
    // Parse JSON data
    const jsonData = JSON.parse(decompressedData.toString('utf8'));
    
    // Load data structures
    this.header.created = new Date(jsonData.header.created);
    this.header.modified = new Date(jsonData.header.modified);
    
    // Load collections
    this.collections.clear();
    for (const [name, collection] of Object.entries(jsonData.collections || {})) {
      this.collections.set(name, collection);
    }

    // Load indexes
    this.indexes.clear();
    for (const [key, index] of Object.entries(jsonData.indexes || {})) {
      this.indexes.set(key, index);
    }

    // Load operation log
    this.operationLog = jsonData.operationLog || [];
  }
  /**
   * Save VDB file to disk
   * @returns {Promise<void>}
   */
  async saveToFile() {
    // Queue save operations to avoid concurrent file access
    return new Promise((resolve, reject) => {
      this._saveQueue.push({ resolve, reject });
      this._processSaveQueue();
    });
  }

  async _processSaveQueue() {
    if (this._saveInProgress || this._saveQueue.length === 0) {
      return;
    }

    this._saveInProgress = true;
    const { resolve, reject } = this._saveQueue.shift();

    try {
      await this._performSave();
      resolve();
    } catch (error) {
      reject(error);
    } finally {
      this._saveInProgress = false;
      // Process next in queue
      if (this._saveQueue.length > 0) {
        setImmediate(() => this._processSaveQueue());
      }
    }
  }

  async _performSave() {
    try {
      const data = this.serializeData();
      
      // Compress data
      const compressedData = await gzip(Buffer.from(JSON.stringify(data), 'utf8'));
        // Encrypt data
      const encryptedData = this.encryption.encrypt(compressedData, this.encryptionKey);
      
      // Build file buffer
      const fileBuffer = this.buildFileBuffer(encryptedData);
      
      // Write to temporary file first for atomic operation
      const tempPath = `${this.filePath}.tmp`;
        try {
        await fs.writeFile(tempPath, fileBuffer);
        
        // Verify temp file was written correctly
        const stats = await fs.stat(tempPath);
        if (stats.size === 0) {
          throw new Error('Temporary file is empty');
        }
        
        // Atomic rename
        await fs.rename(tempPath, this.filePath);
        
        this.header.modified = new Date();
      } catch (renameError) {
        // Clean up temp file if rename failed
        try {
          const tempExists = await fs.access(tempPath).then(() => true).catch(() => false);
          if (tempExists) {
            await fs.unlink(tempPath);
          }
        } catch (unlinkError) {
          // Ignore cleanup errors
        }
        throw renameError;
      }
    } catch (error) {
      throw new Error(`Failed to save VDB file: ${error.message}`);
    }
  }

  /**
   * Serialize internal data structures
   * @returns {Object} Serialized data
   */
  serializeData() {
    return {
      header: {
        created: this.header.created.toISOString(),
        modified: this.header.modified.toISOString()
      },
      collections: Object.fromEntries(this.collections),
      indexes: Object.fromEntries(this.indexes),
      operationLog: this.operationLog
    };
  }

  /**
   * Build VDB file buffer
   * @param {Object} encryptedData - Encrypted data object
   * @returns {Buffer} File buffer
   */  buildFileBuffer(encryptedData) {
    const { encrypted, iv } = encryptedData;
    
    // Calculate sizes
    const headerSize = 4 + 4; // magic + version
    const saltSize = 4 + this.salt.length; // length + salt
    const checksumSize = 4 + 64; // length + sha256 hex string
    const dataSize = 4 + 16 + encrypted.length; // length + iv + data

    const totalSize = headerSize + saltSize + checksumSize + dataSize;
    const buffer = Buffer.allocUnsafe(totalSize);
    let offset = 0;

    // Write header
    this.header.magic.copy(buffer, offset);
    offset += 4;
    buffer.writeUInt32LE(this.header.version, offset);
    offset += 4;    // Write salt
    buffer.writeUInt32LE(this.salt.length, offset);
    offset += 4;
    this.salt.copy(buffer, offset);
    offset += this.salt.length;    // Calculate checksum on the encrypted data only (simplest approach)
    const checksum = this.encryption.generateChecksum(encrypted);
    buffer.writeUInt32LE(64, offset); // SHA-256 hex string length
    offset += 4;
    buffer.write(checksum, offset, 64, 'utf8'); // Write as UTF-8 string
    offset += 64;

    // Write encrypted data
    buffer.writeUInt32LE(16 + encrypted.length, offset); // iv + data length
    offset += 4;
    iv.copy(buffer, offset);
    offset += 16;
    encrypted.copy(buffer, offset);

    return buffer;
  }

  /**
   * Get collection data
   * @param {string} name - Collection name
   * @returns {Object} Collection data
   */
  getCollection(name) {
    return this.collections.get(name);
  }

  /**
   * Set collection data
   * @param {string} name - Collection name
   * @param {Object} data - Collection data
   */
  setCollection(name, data) {
    this.collections.set(name, data);
    this.logOperation('setCollection', { name, timestamp: new Date() });
  }

  /**
   * Delete collection
   * @param {string} name - Collection name
   */
  deleteCollection(name) {
    this.collections.delete(name);
    // Remove related indexes
    for (const [key, index] of this.indexes.entries()) {
      if (key.startsWith(`${name}.`)) {
        this.indexes.delete(key);
      }
    }
    this.logOperation('deleteCollection', { name, timestamp: new Date() });
  }

  /**
   * Get index
   * @param {string} key - Index key
   * @returns {Object} Index data
   */
  getIndex(key) {
    return this.indexes.get(key);
  }

  /**
   * Set index
   * @param {string} key - Index key
   * @param {Object} indexData - Index data
   */
  setIndex(key, indexData) {
    this.indexes.set(key, indexData);
    this.logOperation('setIndex', { key, timestamp: new Date() });
  }

  /**
   * Delete index
   * @param {string} key - Index key
   */
  deleteIndex(key) {
    this.indexes.delete(key);
    this.logOperation('deleteIndex', { key, timestamp: new Date() });
  }

  /**
   * Log operation for audit trail
   * @param {string} operation - Operation type
   * @param {Object} details - Operation details
   */
  logOperation(operation, details) {
    this.operationLog.push({
      operation,
      details,
      timestamp: new Date()
    });

    // Keep only last 1000 operations
    if (this.operationLog.length > 1000) {
      this.operationLog = this.operationLog.slice(-1000);
    }
  }

  /**
   * Get file statistics
   * @returns {Promise<Object>} File stats
   */
  async getFileStats() {
    try {
      const stats = await fs.stat(this.filePath);
      return {
        size: stats.size,
        created: this.header.created,
        modified: this.header.modified,
        collections: this.collections.size,
        indexes: this.indexes.size,
        operationLogSize: this.operationLog.length
      };
    } catch {
      return null;
    }
  }

  /**
   * Compact database (remove operation log, optimize storage)
   * @returns {Promise<void>}
   */
  async compact() {
    this.operationLog = [];
    await this.saveToFile();
  }

  /**
   * Backup database to another location
   * @param {string} backupPath - Backup file path
   * @returns {Promise<void>}
   */
  async backup(backupPath) {
    await fs.copyFile(this.filePath, backupPath);
  }
}

module.exports = VDBStorage;