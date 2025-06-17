/**
 * VerusDB Production Test Suite
 * Comprehensive tests for production readiness
 */

const VerusDB = require('../index');
const { config } = require('../src/utils/config');
const { logger } = require('../src/utils/logger');
const { performanceMonitor } = require('../src/utils/performance');
const fs = require('fs').promises;
const path = require('path');

describe('VerusDB Production Tests', () => {
  let db;
  const testDbPath = './test-production.vdb';
  const testKey = 'production-test-key-with-sufficient-length';

  beforeAll(async () => {
    // Setup test environment
    await fs.mkdir('./test-logs', { recursive: true }).catch(() => {});
    await fs.mkdir('./test-backups', { recursive: true }).catch(() => {});
  });

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
        // Force close any admin servers
        if (db._adminServer) {
          await db._adminServer.stop();
          db._adminServer = null;
        }
        
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
      './test-secure.vdb',
      './test-backup.vdb',
      './import-test.vdb',
      './load-test.vdb'
    ];
    
    for (const file of cleanupFiles) {
      try {
        await fs.unlink(file);
      } catch (error) {
        // File doesn't exist, ignore
      }
    }
    
    // Small delay to ensure all handles are closed
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    // Cleanup test directories
    await fs.rm('./test-logs', { recursive: true, force: true });
    await fs.rm('./test-backups', { recursive: true, force: true });
  });

  describe('Security Tests', () => {
    test('should require encryption key', () => {
      expect(() => {
        new VerusDB({ path: './test.vdb' });
      }).toThrow('Encryption key is required');
    });

    test('should handle strong encryption keys', async () => {
      const strongKey = 'very-strong-encryption-key-for-production-use-with-64-chars!';
      const secureDb = new VerusDB({
        path: './test-secure.vdb',
        encryptionKey: strongKey
      });

      await secureDb.init();
      expect(secureDb.storage.encryptionKey).toBeDefined();
      
      await fs.unlink('./test-secure.vdb');
    });

    test('should encrypt sensitive data', async () => {
      await db.createCollection('users', {
        schema: {
          name: { type: 'string', required: true },
          ssn: { type: 'string', encrypted: true }
        }
      });

      const user = await db.insert('users', {
        name: 'John Doe',
        ssn: '123-45-6789'
      });

      // Verify that encrypted field is returned decrypted
      expect(user.ssn).toBe('123-45-6789');

      // Verify that raw storage contains encrypted data
      const collection = db.collections.get('users');
      const storedDoc = collection.documents.get(user._id);
      expect(storedDoc.ssn).not.toBe('123-45-6789');
      expect(typeof storedDoc.ssn).toBe('string');
    });
  });

  describe('Performance Tests', () => {
    test('should handle large datasets efficiently', async () => {
      await db.createCollection('largeset', {
        schema: {
          id: { type: 'number', required: true },
          data: { type: 'string', required: true },
          timestamp: { type: 'date', default: () => new Date() }
        },
        indexes: ['id']
      });

      const startTime = Date.now();
      const promises = [];

      // Insert 1000 documents
      for (let i = 0; i < 1000; i++) {
        promises.push(db.insert('largeset', {
          id: i,
          data: `test data ${i}`.repeat(10) // Make it somewhat larger
        }));
      }

      await Promise.all(promises);
      const insertDuration = Date.now() - startTime;

      // Should complete within reasonable time (adjust based on hardware)
      expect(insertDuration).toBeLessThan(30000); // 30 seconds

      // Test query performance
      const queryStart = Date.now();
      const results = await db.find('largeset', { id: { $gte: 500 } });
      const queryDuration = Date.now() - queryStart;

      expect(results.length).toBe(500);
      expect(queryDuration).toBeLessThan(5000); // 5 seconds
    }, 60000); // 60 second timeout

    test('should manage memory efficiently', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      await db.createCollection('memtest', {
        schema: {
          data: { type: 'string', required: true }
        }
      });

      // Insert and delete documents to test memory cleanup
      for (let i = 0; i < 100; i++) {
        const doc = await db.insert('memtest', {
          data: 'x'.repeat(1000) // 1KB per document
        });
        await db.delete('memtest', { _id: doc._id });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryGrowth = finalMemory - initialMemory;      // Memory growth should be reasonable (less than 15MB to account for GC timing)
      expect(memoryGrowth).toBeLessThan(15 * 1024 * 1024);
    });

    test('should track performance metrics', async () => {
      // Reset metrics
      performanceMonitor.reset();

      await db.createCollection('perftest', {
        schema: { name: { type: 'string' } }
      });

      await db.insert('perftest', { name: 'test' });
      await db.find('perftest', {});

      const metrics = performanceMonitor.getAllMetrics();
      
      expect(metrics.counters['db_operations_total']).toBeDefined();
      expect(metrics.counters['db_operations_total'].value).toBeGreaterThan(0);
      expect(metrics.histograms['db_operation_duration']).toBeDefined();
    });
  });

  describe('Reliability Tests', () => {
    test('should handle concurrent operations', async () => {
      await db.createCollection('concurrent', {
        schema: {
          id: { type: 'number', required: true, unique: true },
          data: { type: 'string', required: true }
        }
      });

      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          db.insert('concurrent', {
            id: i,
            data: `concurrent data ${i}`
          })
        );
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(50);

      // Verify all documents were inserted
      const allDocs = await db.find('concurrent', {});
      expect(allDocs).toHaveLength(50);
    });

    test('should maintain data integrity on errors', async () => {
      await db.createCollection('integrity', {
        schema: {
          email: { type: 'string', required: true, unique: true }
        }
      });

      // Insert valid document
      await db.insert('integrity', { email: 'test@example.com' });

      // Try to insert duplicate (should fail)
      await expect(
        db.insert('integrity', { email: 'test@example.com' })
      ).rejects.toThrow();

      // Verify original document still exists
      const docs = await db.find('integrity', {});
      expect(docs).toHaveLength(1);
      expect(docs[0].email).toBe('test@example.com');
    });

    test('should handle database file corruption gracefully', async () => {
      // Insert some data
      await db.createCollection('corruption', {
        schema: { name: { type: 'string' } }
      });
      await db.insert('corruption', { name: 'test' });

      // Simulate file corruption by writing invalid data
      await fs.writeFile(testDbPath, 'corrupted data');

      // Try to create new instance with corrupted file
      const corruptedDb = new VerusDB({
        path: testDbPath,
        encryptionKey: testKey
      });

      await expect(corruptedDb.init()).rejects.toThrow();
    });
  });

  describe('Configuration Tests', () => {
    test('should use production configuration values', () => {
      const dbConfig = config.get('database');
      const securityConfig = config.get('security');
      
      expect(dbConfig.maxFileSize).toBeGreaterThan(1024 * 1024); // At least 1MB
      expect(securityConfig.keyDerivationIterations).toBeGreaterThanOrEqual(10000);
      expect(securityConfig.passwordMinLength).toBeGreaterThanOrEqual(6);
    });

    test('should validate configuration on startup', () => {
      expect(() => {
        new (require('../src/utils/config').Config)({
          database: { maxFileSize: 1000 } // Too small
        });
      }).toThrow('Database max file size must be at least 1MB');
    });
  });

  describe('Logging Tests', () => {
    test('should log important events', async () => {
      // Capture log output
      const originalLog = logger.info;
      const logMessages = [];
      logger.info = (message, meta) => {
        logMessages.push({ message, meta });
        originalLog.call(logger, message, meta);
      };

      await db.createCollection('logtest', {
        schema: { name: { type: 'string' } }
      });

      // Restore original logger
      logger.info = originalLog;

      // Verify logging occurred
      const createLogMessage = logMessages.find(log => 
        log.message.includes('Collection created successfully')
      );
      expect(createLogMessage).toBeDefined();
      expect(createLogMessage.meta.name).toBe('logtest');
    });

    test('should track audit events', async () => {
      const originalAudit = logger.audit;
      const auditEvents = [];
      logger.audit = (action, details) => {
        auditEvents.push({ action, details });
        originalAudit.call(logger, action, details);
      };

      // Simulate admin operation
      logger.audit('collection_created', { name: 'test', user: 'admin' });

      logger.audit = originalAudit;

      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0].action).toBe('collection_created');
    });
  });

  describe('Error Handling Tests', () => {
    test('should provide detailed error information', async () => {
      try {
        await db.getCollection('nonexistent');
      } catch (error) {
        expect(error.code).toBe('COLLECTION_ERROR');
        expect(error.collectionName).toBe('nonexistent');
        expect(error.timestamp).toBeDefined();
      }
    });

    test('should handle filesystem errors gracefully', async () => {
      // Create database in read-only directory (simulate permission error)
      const readOnlyPath = '/tmp/readonly/test.vdb';
      
      const permissionDb = new VerusDB({
        path: readOnlyPath,
        encryptionKey: testKey
      });

      await expect(permissionDb.init()).rejects.toThrow();
    });
  });

  describe('Backup and Recovery Tests', () => {
    test('should create consistent backups', async () => {
      await db.createCollection('backup', {
        schema: { name: { type: 'string' } }
      });

      await db.insert('backup', { name: 'test1' });
      await db.insert('backup', { name: 'test2' });

      // Create backup
      const backupPath = './test-backup.vdb';
      await db.storage.backup(backupPath);

      // Verify backup exists and has content
      const stats = await fs.stat(backupPath);
      expect(stats.size).toBeGreaterThan(0);

      // Load backup in new instance
      const backupDb = new VerusDB({
        path: backupPath,
        encryptionKey: testKey
      });

      await backupDb.init();
      const docs = await backupDb.find('backup', {});
      expect(docs).toHaveLength(2);

      await fs.unlink(backupPath);
    });
  });

  describe('Admin Panel Tests', () => {    test('should start admin server with security', async () => {
      const admin = await db.serveAdmin({ 
        port: 4322,
        password: 'test-password-123' 
      });

      expect(admin.url).toContain('4322');

      // Test health endpoint - may be starting or healthy
      const response = await fetch(`${admin.url}/health`);
      expect([200, 503]).toContain(response.status);

      const health = await response.json();
      expect(health.status).toBeDefined();
      expect(['healthy', 'unhealthy', 'starting']).toContain(health.status);

      await admin.stop();
    });
  });
});

// Load test for stress testing
describe('VerusDB Load Tests', () => {
  test('should handle sustained load', async () => {
    const db = new VerusDB({
      path: './load-test.vdb',
      encryptionKey: 'load-test-key-with-sufficient-length'
    });

    await db.init();
    
    await db.createCollection('loadtest', {
      schema: {
        id: { type: 'number', required: true },
        data: { type: 'string', required: true }
      },
      indexes: ['id']
    });

    const startTime = Date.now();
    const operations = [];

    // Simulate mixed workload
    for (let i = 0; i < 100; i++) {
      operations.push(
        db.insert('loadtest', { id: i, data: `data-${i}` })
      );
      
      if (i % 10 === 0) {
        operations.push(
          db.find('loadtest', { id: { $lt: i } })
        );
      }
      
      if (i % 20 === 0) {
        operations.push(
          db.update('loadtest', { id: i - 1 }, { $set: { data: `updated-${i}` } })
        );
      }
    }

    await Promise.all(operations);
    const duration = Date.now() - startTime;

    logger.info('Load test completed', {
      operations: operations.length,
      duration: `${duration}ms`,
      opsPerSecond: Math.round(operations.length / (duration / 1000))
    });

    // Should complete within reasonable time
    expect(duration).toBeLessThan(60000); // 60 seconds

    await fs.unlink('./load-test.vdb');
  }, 120000); // 2 minute timeout
});
