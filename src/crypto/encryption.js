/**
 * VerusDB Encryption Module
 * Handles AES-256 encryption, PBKDF2 key derivation, and security functions
 */

const crypto = require('crypto');

class VerusEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.saltLength = 32;
    this.tagLength = 16;
    this.iterations = 100000; // PBKDF2 iterations
  }

  /**
   * Derive encryption key from password using PBKDF2
   * @param {string} password - User password
   * @param {Buffer} salt - Salt for key derivation
   * @returns {Buffer} Derived key
   */
  deriveKey(password, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(this.saltLength);
    }
    
    const key = crypto.pbkdf2Sync(password, salt, this.iterations, this.keyLength, 'sha256');
    return { key, salt };
  }

  /**
   * Encrypt data using AES-256-CBC
   * @param {Buffer} data - Data to encrypt
   * @param {Buffer} key - Encryption key
   * @returns {Object} Encrypted data with IV
   */
  encrypt(data, key) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return {
      encrypted,
      iv,
      tag: Buffer.alloc(0), // For compatibility
      algorithm: 'aes-256-cbc'
    };
  }
  /**
   * Decrypt data using AES-256-CBC
   * @param {Object} encryptedData - Encrypted data object
   * @param {Buffer} key - Decryption key
   * @returns {Buffer} Decrypted data
   */
  decrypt(encryptedData, key) {
    if (!encryptedData || typeof encryptedData !== 'object') {
      throw new Error('Invalid encrypted data object');
    }
    
    const { encrypted, iv } = encryptedData;
    
    if (!encrypted || !iv) {
      throw new Error('Invalid encrypted data: missing encrypted or iv');
    }
    
    if (!Buffer.isBuffer(encrypted) || !Buffer.isBuffer(iv)) {
      throw new Error('Invalid encrypted data: encrypted and iv must be Buffers');
    }
    
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Hash password for admin panel storage
   * @param {string} password - Plain text password
   * @returns {Promise<string>} Hashed password
   */
  async hashPassword(password) {
    const bcrypt = require('bcrypt');
    return await bcrypt.hash(password, 12);
  }

  /**
   * Verify password against hash
   * @param {string} password - Plain text password
   * @param {string} hash - Stored hash
   * @returns {Promise<boolean>} Verification result
   */
  async verifyPassword(password, hash) {
    const bcrypt = require('bcrypt');
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate file checksum for tamper detection
   * @param {Buffer} data - File data
   * @returns {string} SHA-256 checksum
   */
  generateChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify file integrity
   * @param {Buffer} data - File data
   * @param {string} expectedChecksum - Expected checksum
   * @returns {boolean} Integrity check result
   */
  verifyChecksum(data, expectedChecksum) {
    const actualChecksum = this.generateChecksum(data);
    return actualChecksum === expectedChecksum;
  }
  /**
   * Encrypt field-level data
   * @param {any} value - Value to encrypt
   * @param {Buffer} key - Encryption key
   * @returns {string} Base64 encoded encrypted value
   */
  encryptField(value, key) {
    const stringValue = JSON.stringify(value);
    const buffer = Buffer.from(stringValue, 'utf8');
    const encrypted = this.encrypt(buffer, key);
    
    return Buffer.concat([
      encrypted.iv,
      encrypted.encrypted
    ]).toString('base64');
  }
  /**
   * Decrypt field-level data
   * @param {string} encryptedValue - Base64 encoded encrypted value
   * @param {Buffer} key - Decryption key
   * @returns {any} Decrypted value
   */
  decryptField(encryptedValue, key) {
    const buffer = Buffer.from(encryptedValue, 'base64');
    
    const iv = buffer.slice(0, this.ivLength);
    const encrypted = buffer.slice(this.ivLength);

    const decrypted = this.decrypt({ encrypted, iv }, key);
    const stringValue = decrypted.toString('utf8');
    
    return JSON.parse(stringValue);
  }
}

module.exports = VerusEncryption;