/**
 * VerusDB Basic Functionality Tests
 * Tests core database operations, schema validation, and encryption
 */

const VerusDB = require('../index');
const fs = require('fs').promises;
const path = require('path');

describe('VerusDB Basic Functionality', () => {
  let db;
  const testDbPath = './test-db.vdb';
  const testKey = 'test-encryption-key';

  beforeEach(async () => {
    // Clean up any existing test database
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // File doesn't exist, ignore
    }

    db = new VerusDB({
      path: testDbPath,
      encryptionKey: testKey
    });

    await db.init();
  });
  afterEach(async () => {
    // Properly close database if it exists
    if (db) {
      try {
        // Clean up database instance
        db.collections?.clear();
        db.storage = null;
        db = null;
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    // Clean up test database files
    const cleanupFiles = [
      testDbPath,
      `${testDbPath}.tmp`,
      './import-test.vdb'
    ];
    
    for (const file of cleanupFiles) {
      try {
        await fs.unlink(file);
      } catch (error) {
        // File doesn't exist, ignore
      }
    }
    
    // Small delay to ensure all handles are closed
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  describe('Database Initialization', () => {
    test('should create new database file', async () => {
      const stats = await fs.stat(testDbPath);
      expect(stats.isFile()).toBe(true);
      expect(stats.size).toBeGreaterThan(0);
    });

    test('should initialize with encryption', async () => {
      expect(db.storage.encryptionKey).toBeDefined();
      expect(db.storage.salt).toBeDefined();
    });

    test('should load existing database', async () => {
      // Create a collection in the first instance
      await db.createCollection('test', {
        schema: { name: { type: 'string', required: true } }
      });

      // Create new instance with same path
      const db2 = new VerusDB({
        path: testDbPath,
        encryptionKey: testKey
      });

      await db2.init();
      expect(db2.collections.has('test')).toBe(true);
    });
  });

  describe('Collection Management', () => {
    test('should create collection with schema', async () => {
      await db.createCollection('users', {
        schema: {
          name: { type: 'string', required: true },
          email: { type: 'string', required: true, unique: true },
          age: { type: 'number', min: 0, max: 150 }
        }
      });

      expect(db.collections.has('users')).toBe(true);
      const collection = db.collections.get('users');
      expect(collection.schema.name.type).toBe('string');
      expect(collection.schema.email.unique).toBe(true);
    });

    test('should not create duplicate collection', async () => {
      await db.createCollection('users', {
        schema: { name: { type: 'string' } }
      });

      await expect(db.createCollection('users', {
        schema: { name: { type: 'string' } }
      })).rejects.toThrow('already exists');
    });

    test('should drop collection', async () => {
      await db.createCollection('temp', {
        schema: { data: { type: 'string' } }
      });

      expect(db.collections.has('temp')).toBe(true);
      
      await db.dropCollection('temp');
      expect(db.collections.has('temp')).toBe(false);
    });
  });

  describe('Document Operations', () => {
    beforeEach(async () => {
      await db.createCollection('users', {
        schema: {
          name: { type: 'string', required: true },
          email: { type: 'string', required: true, unique: true },
          age: { type: 'number', min: 0 },
          active: { type: 'boolean', default: true }
        }
      });
    });

    test('should insert valid document', async () => {
      const user = await db.insert('users', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30
      });

      expect(user._id).toBeDefined();
      expect(user.name).toBe('John Doe');
      expect(user.email).toBe('john@example.com');
      expect(user.active).toBe(true); // Default value
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    test('should validate required fields', async () => {
      await expect(db.insert('users', {
        email: 'john@example.com'
        // Missing required 'name' field
      })).rejects.toThrow('Required field name is missing');
    });

    test('should validate field types', async () => {
      await expect(db.insert('users', {
        name: 'John Doe',
        email: 'john@example.com',
        age: 'thirty' // Should be number
      })).rejects.toThrow('must be of type number');
    });

    test('should enforce unique constraints', async () => {
      await db.insert('users', {
        name: 'John Doe',
        email: 'john@example.com'
      });

      await expect(db.insert('users', {
        name: 'Jane Doe',
        email: 'john@example.com' // Duplicate email
      })).rejects.toThrow('Duplicate value for unique field');
    });

    test('should find documents with simple query', async () => {
      await db.insert('users', { name: 'John', email: 'john@example.com', age: 30 });
      await db.insert('users', { name: 'Jane', email: 'jane@example.com', age: 25 });

      const users = await db.find('users', { age: 30 });
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('John');
    });

    test('should find documents with complex query', async () => {
      await db.insert('users', { name: 'John', email: 'john@example.com', age: 30 });
      await db.insert('users', { name: 'Jane', email: 'jane@example.com', age: 25 });
      await db.insert('users', { name: 'Bob', email: 'bob@example.com', age: 35 });

      const users = await db.find('users', {
        age: { $gte: 25, $lt: 35 }
      });

      expect(users).toHaveLength(2);
      expect(users.map(u => u.name).sort()).toEqual(['Jane', 'John']);
    });    test('should update documents', async () => {
      const user = await db.insert('users', {
        name: 'John',
        email: 'john@example.com',
        age: 30
      });

      console.log('Inserted user:', JSON.stringify(user, null, 2));

      const result = await db.update('users',
        { _id: user._id },
        { $set: { age: 31 } }
      );

      console.log('Update result:', JSON.stringify(result, null, 2));
      expect(result.modifiedCount).toBe(1);

      // Check all users to see what's in the collection
      const allUsers = await db.find('users');
      console.log('All users after update:', JSON.stringify(allUsers, null, 2));

      const updatedUser = await db.findOne('users', { _id: user._id });
      console.log('Found user by _id:', JSON.stringify(updatedUser, null, 2));
      console.log('Looking for _id:', user._id);
      
      expect(updatedUser).not.toBeNull();
      expect(updatedUser.age).toBe(31);
      expect(updatedUser.updatedAt).toBeInstanceOf(Date);
    });

    test('should delete documents', async () => {
      const user = await db.insert('users', {
        name: 'John',
        email: 'john@example.com'
      });

      const result = await db.delete('users', { _id: user._id });
      expect(result.deletedCount).toBe(1);

      const deletedUser = await db.findOne('users', { _id: user._id });
      expect(deletedUser).toBeNull();
    });
  });

  describe('Indexing', () => {
    beforeEach(async () => {
      await db.createCollection('users', {
        schema: {
          name: { type: 'string', required: true },
          email: { type: 'string', required: true, unique: true },
          age: { type: 'number' }
        }
      });
    });

    test('should create index', async () => {
      await db.createIndex('users', 'name');
      
      const indexKey = 'users.name';
      expect(db.indexes.has(indexKey)).toBe(true);
    });

    test('should not create duplicate index', async () => {
      await db.createIndex('users', 'name');
      
      await expect(db.createIndex('users', 'name'))
        .rejects.toThrow('already exists');
    });

    test('should drop index', async () => {
      await db.createIndex('users', 'name');
      
      const indexKey = 'users.name';
      expect(db.indexes.has(indexKey)).toBe(true);
      
      await db.dropIndex('users', 'name');
      expect(db.indexes.has(indexKey)).toBe(false);
    });
  });

  describe('Data Persistence', () => {
    test('should persist data across database restarts', async () => {
      // Insert data
      await db.createCollection('persist_test', {
        schema: { value: { type: 'string' } }
      });

      await db.insert('persist_test', { value: 'test data' });

      // Create new database instance
      const db2 = new VerusDB({
        path: testDbPath,
        encryptionKey: testKey
      });

      await db2.init();

      // Verify data is still there
      const documents = await db2.find('persist_test', {});
      expect(documents).toHaveLength(1);
      expect(documents[0].value).toBe('test data');
    });
  });

  describe('Schema Validation', () => {
    test('should validate enum fields', async () => {
      await db.createCollection('products', {
        schema: {
          name: { type: 'string', required: true },
          category: { 
            type: 'string', 
            enum: ['electronics', 'clothing', 'books'],
            required: true
          }
        }
      });

      // Valid enum value
      await db.insert('products', {
        name: 'Laptop',
        category: 'electronics'
      });

      // Invalid enum value
      await expect(db.insert('products', {
        name: 'Invalid Product',
        category: 'invalid_category'
      })).rejects.toThrow('must be one of');
    });

    test('should validate number ranges', async () => {
      await db.createCollection('scores', {
        schema: {
          value: { type: 'number', min: 0, max: 100, required: true }
        }
      });

      // Valid range
      await db.insert('scores', { value: 85 });

      // Below minimum
      await expect(db.insert('scores', { value: -5 }))
        .rejects.toThrow('must be >= 0');

      // Above maximum
      await expect(db.insert('scores', { value: 150 }))
        .rejects.toThrow('must be <= 100');
    });

    test('should validate string length', async () => {
      await db.createCollection('messages', {
        schema: {
          text: { 
            type: 'string', 
            minLength: 5, 
            maxLength: 100, 
            required: true 
          }
        }
      });

      // Valid length
      await db.insert('messages', { text: 'Hello world!' });

      // Too short
      await expect(db.insert('messages', { text: 'Hi' }))
        .rejects.toThrow('must have length >= 5');

      // Too long
      const longText = 'a'.repeat(101);
      await expect(db.insert('messages', { text: longText }))
        .rejects.toThrow('must have length <= 100');
    });

    test('should handle default values', async () => {
      await db.createCollection('settings', {
        schema: {
          name: { type: 'string', required: true },
          enabled: { type: 'boolean', default: false },
          created: { type: 'date', default: () => new Date() }
        }
      });

      const setting = await db.insert('settings', { name: 'test' });
      
      expect(setting.enabled).toBe(false);
      expect(setting.created).toBeInstanceOf(Date);
    });
  });

  describe('Export/Import', () => {
    beforeEach(async () => {
      await db.createCollection('export_test', {
        schema: {
          name: { type: 'string', required: true },
          value: { type: 'number' }
        }
      });

      await db.insert('export_test', { name: 'item1', value: 100 });
      await db.insert('export_test', { name: 'item2', value: 200 });
    });

    test('should export database', async () => {
      const exportData = await db.export();
      
      expect(exportData.version).toBe(1);
      expect(exportData.collections.export_test).toBeDefined();
      expect(exportData.collections.export_test.documents).toHaveLength(2);
    });

    test('should import database', async () => {
      const exportData = await db.export();
      
      // Create new database and import
      const importDbPath = './import-test.vdb';
      const importDb = new VerusDB({
        path: importDbPath,
        encryptionKey: 'import-key'
      });

      try {
        await importDb.init();
        await importDb.import(exportData);

        const documents = await importDb.find('export_test', {});
        expect(documents).toHaveLength(2);
      } finally {
        // Clean up
        try {
          await fs.unlink(importDbPath);
        } catch (error) {
          // Ignore
        }
      }
    });
  });
});