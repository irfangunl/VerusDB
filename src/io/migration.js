/**
 * VerusDB Migration System
 * Handles database migrations and schema versioning
 */

const fs = require('fs').promises;
const path = require('path');

class MigrationSystem {
  constructor(db) {
    this.db = db;
    this.migrationsPath = './migrations';
  }

  /**
   * Create a new migration file
   * @param {string} name - Migration name
   * @param {Object} options - Migration options
   * @returns {Promise<string>} Migration file path
   */
  async createMigration(name, options = {}) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${name.replace(/\s+/g, '_').toLowerCase()}.js`;
    const migrationPath = path.join(this.migrationsPath, filename);

    // Ensure migrations directory exists
    await fs.mkdir(this.migrationsPath, { recursive: true });

    const migrationTemplate = this.generateMigrationTemplate(name, options);
    await fs.writeFile(migrationPath, migrationTemplate, 'utf8');

    console.log(`Migration created: ${migrationPath}`);
    return migrationPath;
  }

  /**
   * Generate migration template
   * @param {string} name - Migration name
   * @param {Object} options - Migration options
   * @returns {string} Migration template
   */
  generateMigrationTemplate(name, options) {
    const template = `/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */

module.exports = {
  // Migration metadata
  name: '${name}',
  version: '${options.version || '1.0.0'}',
  description: '${options.description || 'Database migration'}',
  
  /**
   * Apply migration
   * @param {VerusDB} db - Database instance
   */
  async up(db) {
    // Add your migration logic here
    
    // Example: Create a new collection
    // await db.createCollection('users', {
    //   schema: {
    //     name: { type: 'string', required: true },
    //     email: { type: 'string', required: true, unique: true },
    //     createdAt: { type: 'date', default: () => new Date() }
    //   }
    // });
    
    // Example: Add data
    // await db.insert('users', {
    //   name: 'Admin User',
    //   email: 'admin@example.com'
    // });
    
    console.log('Migration ${name} applied successfully');
  },
  
  /**
   * Rollback migration
   * @param {VerusDB} db - Database instance
   */
  async down(db) {
    // Add your rollback logic here
    
    // Example: Drop collection
    // await db.dropCollection('users');
    
    console.log('Migration ${name} rolled back successfully');
  }
};
`;

    return template;
  }

  /**
   * Run all pending migrations
   * @returns {Promise<Array>} Applied migrations
   */
  async migrate() {
    await this.db.init();
    
    // Get migration history
    const appliedMigrations = await this.getAppliedMigrations();
    
    // Get available migrations
    const availableMigrations = await this.getAvailableMigrations();
    
    // Find pending migrations
    const pendingMigrations = availableMigrations.filter(
      migration => !appliedMigrations.includes(migration.filename)
    );

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return [];
    }

    console.log(`Found ${pendingMigrations.length} pending migrations`);
    
    const appliedList = [];
    
    for (const migration of pendingMigrations) {
      try {
        console.log(`Applying migration: ${migration.name}`);
        
        // Load and run migration
        const migrationModule = require(path.resolve(migration.path));
        await migrationModule.up(this.db);
        
        // Record migration as applied
        await this.recordMigration(migration);
        appliedList.push(migration);
        
        console.log(`✅ Migration applied: ${migration.name}`);
      } catch (error) {
        console.error(`❌ Migration failed: ${migration.name}`, error);
        throw error;
      }
    }

    return appliedList;
  }

  /**
   * Rollback last migration
   * @param {number} steps - Number of migrations to rollback
   * @returns {Promise<Array>} Rolled back migrations
   */
  async rollback(steps = 1) {
    await this.db.init();
    
    const appliedMigrations = await this.getAppliedMigrations();
    const migrationsToRollback = appliedMigrations.slice(-steps);

    if (migrationsToRollback.length === 0) {
      console.log('No migrations to rollback');
      return [];
    }

    console.log(`Rolling back ${migrationsToRollback.length} migrations`);
    
    const rolledBackList = [];
    
    // Rollback in reverse order
    for (const filename of migrationsToRollback.reverse()) {
      try {
        const migrationPath = path.join(this.migrationsPath, filename);
        
        if (await this.fileExists(migrationPath)) {
          const migrationModule = require(path.resolve(migrationPath));
          
          console.log(`Rolling back migration: ${migrationModule.name}`);
          await migrationModule.down(this.db);
          
          // Remove from migration history
          await this.removeMigrationRecord(filename);
          rolledBackList.push(migrationModule);
          
          console.log(`✅ Migration rolled back: ${migrationModule.name}`);
        } else {
          console.warn(`⚠️  Migration file not found: ${filename}`);
        }
      } catch (error) {
        console.error(`❌ Rollback failed: ${filename}`, error);
        throw error;
      }
    }

    return rolledBackList;
  }

  /**
   * Get migration status
   * @returns {Promise<Object>} Migration status
   */
  async getStatus() {
    await this.db.init();
    
    const appliedMigrations = await this.getAppliedMigrations();
    const availableMigrations = await this.getAvailableMigrations();
    
    const pendingMigrations = availableMigrations.filter(
      migration => !appliedMigrations.includes(migration.filename)
    );

    return {
      applied: appliedMigrations.length,
      pending: pendingMigrations.length,
      total: availableMigrations.length,
      appliedMigrations,
      pendingMigrations: pendingMigrations.map(m => m.filename),
      availableMigrations: availableMigrations.map(m => m.filename)
    };
  }

  /**
   * Create database export as migration
   * @param {Object} options - Export options
   * @returns {Promise<string>} Migration file path
   */
  async createDataMigration(options = {}) {
    const data = await this.db.export();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_data_export.js`;
    const migrationPath = path.join(this.migrationsPath, filename);

    // Ensure migrations directory exists
    await fs.mkdir(this.migrationsPath, { recursive: true });

    const migrationContent = this.generateDataMigration(data, options);
    await fs.writeFile(migrationPath, migrationContent, 'utf8');

    console.log(`Data migration created: ${migrationPath}`);
    return migrationPath;
  }

  /**
   * Generate data migration from export
   * @param {Object} data - Exported data
   * @param {Object} options - Migration options
   * @returns {string} Migration content
   */
  generateDataMigration(data, options) {
    const collectionsData = JSON.stringify(data.collections, null, 2);
    
    return `/**
 * Data Migration
 * Generated: ${new Date().toISOString()}
 * Description: ${options.description || 'Auto-generated data migration'}
 */

const collectionsData = ${collectionsData};

module.exports = {
  name: 'Data Export Migration',
  version: '${options.version || '1.0.0'}',
  description: '${options.description || 'Auto-generated data migration'}',
  
  async up(db) {
    // Import all collections and data
    for (const [collectionName, collectionData] of Object.entries(collectionsData)) {
      console.log(\`Creating collection: \${collectionName}\`);
      
      // Create collection with schema
      try {
        await db.createCollection(collectionName, {
          schema: collectionData.schema
        });
      } catch (error) {
        if (!error.message.includes('already exists')) {
          throw error;
        }
      }
      
      // Insert documents
      if (collectionData.documents && collectionData.documents.length > 0) {
        console.log(\`Inserting \${collectionData.documents.length} documents into \${collectionName}\`);
        
        for (const document of collectionData.documents) {
          try {
            await db.insert(collectionName, document);
          } catch (error) {
            console.warn(\`Failed to insert document: \${error.message}\`);
          }
        }
      }
    }
    
    console.log('Data migration completed');
  },
  
  async down(db) {
    // Remove all imported collections
    for (const collectionName of Object.keys(collectionsData)) {
      try {
        await db.dropCollection(collectionName);
        console.log(\`Dropped collection: \${collectionName}\`);
      } catch (error) {
        console.warn(\`Failed to drop collection \${collectionName}: \${error.message}\`);
      }
    }
    
    console.log('Data migration rolled back');
  }
};
`;
  }

  /**
   * Get applied migrations from database
   * @returns {Promise<Array>} Applied migration filenames
   */
  async getAppliedMigrations() {
    try {
      // Check if migrations collection exists
      if (!this.db.collections.has('_migrations')) {
        await this.db.createCollection('_migrations', {
          schema: {
            filename: { type: 'string', required: true, unique: true },
            name: { type: 'string', required: true },
            appliedAt: { type: 'date', default: () => new Date() },
            version: { type: 'string' },
            description: { type: 'string' }
          }
        });
        return [];
      }

      const migrations = await this.db.find('_migrations', {}, { sort: { appliedAt: 1 } });
      return migrations.map(m => m.filename);
    } catch (error) {
      console.warn('Failed to get applied migrations:', error.message);
      return [];
    }
  }

  /**
   * Get available migration files
   * @returns {Promise<Array>} Available migration files
   */
  async getAvailableMigrations() {
    try {
      if (!await this.fileExists(this.migrationsPath)) {
        return [];
      }

      const files = await fs.readdir(this.migrationsPath);
      const migrationFiles = files.filter(file => file.endsWith('.js'));

      const migrations = [];
      for (const filename of migrationFiles) {
        const migrationPath = path.join(this.migrationsPath, filename);
        
        try {
          const migrationModule = require(path.resolve(migrationPath));
          migrations.push({
            filename,
            name: migrationModule.name || filename,
            version: migrationModule.version,
            description: migrationModule.description,
            path: migrationPath
          });
        } catch (error) {
          console.warn(`Failed to load migration ${filename}:`, error.message);
        }
      }

      // Sort by filename (timestamp)
      migrations.sort((a, b) => a.filename.localeCompare(b.filename));
      
      return migrations;
    } catch (error) {
      console.warn('Failed to get available migrations:', error.message);
      return [];
    }
  }

  /**
   * Record migration as applied
   * @param {Object} migration - Migration details
   * @returns {Promise<void>}
   */
  async recordMigration(migration) {
    await this.db.insert('_migrations', {
      filename: migration.filename,
      name: migration.name,
      version: migration.version,
      description: migration.description,
      appliedAt: new Date()
    });
  }

  /**
   * Remove migration record
   * @param {string} filename - Migration filename
   * @returns {Promise<void>}
   */
  async removeMigrationRecord(filename) {
    await this.db.delete('_migrations', { filename });
  }

  /**
   * Check if file exists
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} File exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reset migration system (clear all migration records)
   * @returns {Promise<void>}
   */
  async reset() {
    try {
      await this.db.dropCollection('_migrations');
      console.log('Migration system reset');
    } catch (error) {
      console.warn('Failed to reset migration system:', error.message);
    }
  }

  /**
   * Validate migrations (check for missing files, syntax errors)
   * @returns {Promise<Object>} Validation results
   */
  async validate() {
    const results = {
      valid: true,
      errors: [],
      warnings: []
    };

    try {
      const appliedMigrations = await this.getAppliedMigrations();
      const availableMigrations = await this.getAvailableMigrations();
      
      // Check for missing migration files
      for (const appliedFilename of appliedMigrations) {
        const exists = availableMigrations.some(m => m.filename === appliedFilename);
        if (!exists) {
          results.errors.push(`Applied migration file missing: ${appliedFilename}`);
          results.valid = false;
        }
      }

      // Check for syntax errors in migration files
      for (const migration of availableMigrations) {
        try {
          const migrationModule = require(path.resolve(migration.path));
          
          if (!migrationModule.up || typeof migrationModule.up !== 'function') {
            results.errors.push(`Migration ${migration.filename} missing 'up' function`);
            results.valid = false;
          }
          
          if (!migrationModule.down || typeof migrationModule.down !== 'function') {
            results.warnings.push(`Migration ${migration.filename} missing 'down' function`);
          }
        } catch (error) {
          results.errors.push(`Migration ${migration.filename} syntax error: ${error.message}`);
          results.valid = false;
        }
      }

    } catch (error) {
      results.errors.push(`Validation failed: ${error.message}`);
      results.valid = false;
    }

    return results;
  }
}

// Export functions
async function createMigration(db, name, options = {}) {
  const migrationSystem = new MigrationSystem(db);
  return await migrationSystem.createMigration(name, options);
}

async function runMigration(db, action = 'up', options = {}) {
  const migrationSystem = new MigrationSystem(db);
  
  switch (action) {
    case 'up':
    case 'migrate':
      return await migrationSystem.migrate();
    case 'down':
    case 'rollback':
      return await migrationSystem.rollback(options.steps || 1);
    case 'status':
      return await migrationSystem.getStatus();
    case 'reset':
      return await migrationSystem.reset();
    case 'validate':
      return await migrationSystem.validate();
    default:
      throw new Error(`Unknown migration action: ${action}`);
  }
}

module.exports = {
  MigrationSystem,
  createMigration,
  runMigration
};