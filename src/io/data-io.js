/**
 * VerusDB Import/Export Module
 * Handles data import/export in various formats (JSON, CSV, SQL, MongoDB)
 */

const fs = require('fs').promises;
const path = require('path');

class DataIO {
  constructor() {
    this.supportedFormats = ['json', 'csv', 'sql', 'mongodb', 'vdb'];
  }

  /**
   * Import data from various formats
   * @param {string} filePath - Source file path
   * @param {Object} options - Import options
   * @returns {Promise<Object>} Imported data
   */
  async importData(filePath, options = {}) {
    const format = options.format || this.detectFormat(filePath);
    
    if (!this.supportedFormats.includes(format)) {
      throw new Error(`Unsupported import format: ${format}`);
    }

    const content = await fs.readFile(filePath, 'utf8');
    
    switch (format) {
      case 'json':
        return this.importJSON(content, options);
      case 'csv':
        return this.importCSV(content, options);
      case 'sql':
        return this.importSQL(content, options);
      case 'mongodb':
        return this.importMongoDB(content, options);
      case 'vdb':
        throw new Error('VDB import should use direct file copy');
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Export data to various formats
   * @param {Object} data - Data to export
   * @param {string} filePath - Target file path
   * @param {Object} options - Export options
   * @returns {Promise<void>}
   */
  async exportData(data, filePath, options = {}) {
    const format = options.format || this.detectFormat(filePath);
    
    if (!this.supportedFormats.includes(format)) {
      throw new Error(`Unsupported export format: ${format}`);
    }

    let content;
    
    switch (format) {
      case 'json':
        content = this.exportJSON(data, options);
        break;
      case 'csv':
        content = this.exportCSV(data, options);
        break;
      case 'sql':
        content = this.exportSQL(data, options);
        break;
      case 'mongodb':
        content = this.exportMongoDB(data, options);
        break;
      case 'vdb':
        throw new Error('VDB export should use direct file copy');
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(filePath, content, 'utf8');
  }

  /**
   * Detect file format from extension
   * @param {string} filePath - File path
   * @returns {string} Detected format
   */
  detectFormat(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    switch (ext) {
      case '.json':
        return 'json';
      case '.csv':
        return 'csv';
      case '.sql':
        return 'sql';
      case '.bson':
      case '.mongodb':
        return 'mongodb';
      case '.vdb':
        return 'vdb';
      default:
        return 'json'; // Default to JSON
    }
  }

  /**
   * Import JSON data
   * @param {string} content - JSON content
   * @param {Object} options - Import options
   * @returns {Object} Parsed data
   */
  importJSON(content, options) {
    try {
      const data = JSON.parse(content);
      
      // Check if it's a VerusDB export format
      if (data.version && data.collections) {
        return data;
      }
      
      // Check if it's a MongoDB export (array of documents)
      if (Array.isArray(data)) {
        const collectionName = options.collection || 'imported_data';
        return {
          version: 1,
          created: new Date(),
          collections: {
            [collectionName]: {
              schema: this.inferSchema(data),
              documents: data
            }
          }
        };
      }
      
      // Check if it's a single document
      if (typeof data === 'object') {
        const collectionName = options.collection || 'imported_data';
        return {
          version: 1,
          created: new Date(),
          collections: {
            [collectionName]: {
              schema: this.inferSchema([data]),
              documents: [data]
            }
          }
        };
      }
      
      throw new Error('Invalid JSON format');
    } catch (error) {
      throw new Error(`JSON import error: ${error.message}`);
    }
  }

  /**
   * Import CSV data
   * @param {string} content - CSV content
   * @param {Object} options - Import options
   * @returns {Object} Parsed data
   */
  importCSV(content, options) {
    try {
      const lines = content.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('CSV must have at least header and one data row');
      }

      // Parse header
      const headers = this.parseCSVLine(lines[0]);
      
      // Parse data rows
      const documents = [];
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVLine(lines[i]);
        if (values.length === headers.length) {
          const doc = {};
          for (let j = 0; j < headers.length; j++) {
            doc[headers[j]] = this.parseCSVValue(values[j]);
          }
          documents.push(doc);
        }
      }

      const collectionName = options.collection || 'csv_import';
      
      return {
        version: 1,
        created: new Date(),
        collections: {
          [collectionName]: {
            schema: this.inferSchema(documents),
            documents
          }
        }
      };
    } catch (error) {
      throw new Error(`CSV import error: ${error.message}`);
    }
  }

  /**
   * Import SQL dump
   * @param {string} content - SQL content
   * @param {Object} options - Import options
   * @returns {Object} Parsed data
   */
  importSQL(content, options) {
    try {
      // This is a simplified SQL parser - in production, use a proper SQL parser
      const tables = {};
      const lines = content.split('\n').filter(line => line.trim());
      
      let currentTable = null;
      let currentSchema = {};
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // CREATE TABLE statement
        if (trimmed.toUpperCase().startsWith('CREATE TABLE')) {
          const match = trimmed.match(/CREATE TABLE\s+`?(\w+)`?\s*\(/i);
          if (match) {
            currentTable = match[1];
            currentSchema = {};
          }
        }
        
        // Column definition
        else if (currentTable && trimmed.includes(' ') && !trimmed.toUpperCase().startsWith('INSERT')) {
          const columnMatch = trimmed.match(/`?(\w+)`?\s+(\w+)/);
          if (columnMatch) {
            const [, columnName, sqlType] = columnMatch;
            currentSchema[columnName] = {
              type: this.sqlTypeToVerusType(sqlType),
              required: trimmed.toUpperCase().includes('NOT NULL')
            };
          }
        }
        
        // End of table definition
        else if (trimmed === ');' && currentTable) {
          if (!tables[currentTable]) {
            tables[currentTable] = { schema: currentSchema, documents: [] };
          }
          currentTable = null;
        }
        
        // INSERT statement
        else if (trimmed.toUpperCase().startsWith('INSERT INTO')) {
          const insertMatch = trimmed.match(/INSERT INTO\s+`?(\w+)`?\s*\([^)]+\)\s+VALUES\s*\(([^)]+)\)/i);
          if (insertMatch) {
            const tableName = insertMatch[1];
            const valuesStr = insertMatch[2];
            
            if (!tables[tableName]) {
              tables[tableName] = { schema: {}, documents: [] };
            }
            
            // Parse values (simplified)
            const values = this.parseSQLValues(valuesStr);
            const columnNames = Object.keys(tables[tableName].schema);
            
            if (values.length === columnNames.length) {
              const doc = {};
              for (let i = 0; i < columnNames.length; i++) {
                doc[columnNames[i]] = values[i];
              }
              tables[tableName].documents.push(doc);
            }
          }
        }
      }

      return {
        version: 1,
        created: new Date(),
        collections: tables
      };
    } catch (error) {
      throw new Error(`SQL import error: ${error.message}`);
    }
  }

  /**
   * Import MongoDB data (BSON/JSON export)
   * @param {string} content - MongoDB content
   * @param {Object} options - Import options
   * @returns {Object} Parsed data
   */
  importMongoDB(content, options) {
    try {
      // MongoDB exports are typically JSON lines or JSON array
      let data;
      
      if (content.trim().startsWith('[')) {
        // JSON array format
        data = JSON.parse(content);
      } else {
        // JSON lines format
        data = content.trim().split('\n').map(line => JSON.parse(line));
      }

      const collectionName = options.collection || 'mongodb_import';
      
      // Process MongoDB-specific fields
      const processedDocs = data.map(doc => {
        const processed = { ...doc };
        
        // Convert MongoDB ObjectId to string
        if (processed._id && processed._id.$oid) {
          processed._id = processed._id.$oid;
        }
        
        // Convert MongoDB dates
        if (processed.createdAt && processed.createdAt.$date) {
          processed.createdAt = new Date(processed.createdAt.$date);
        }
        
        return processed;
      });

      return {
        version: 1,
        created: new Date(),
        collections: {
          [collectionName]: {
            schema: this.inferSchema(processedDocs),
            documents: processedDocs
          }
        }
      };
    } catch (error) {
      throw new Error(`MongoDB import error: ${error.message}`);
    }
  }

  /**
   * Export to JSON format
   * @param {Object} data - Data to export
   * @param {Object} options - Export options
   * @returns {string} JSON content
   */
  exportJSON(data, options) {
    if (options.collection && data.collections[options.collection]) {
      // Export single collection
      if (options.documentsOnly) {
        return JSON.stringify(data.collections[options.collection].documents, null, 2);
      } else {
        return JSON.stringify({
          ...data,
          collections: {
            [options.collection]: data.collections[options.collection]
          }
        }, null, 2);
      }
    }
    
    // Export full database
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export to CSV format
   * @param {Object} data - Data to export
   * @param {Object} options - Export options
   * @returns {string} CSV content
   */
  exportCSV(data, options) {
    if (!options.collection) {
      throw new Error('Collection name required for CSV export');
    }

    const collection = data.collections[options.collection];
    if (!collection) {
      throw new Error(`Collection ${options.collection} not found`);
    }

    const documents = collection.documents;
    if (documents.length === 0) {
      return '';
    }

    // Get all unique fields
    const fields = new Set();
    documents.forEach(doc => {
      Object.keys(doc).forEach(key => fields.add(key));
    });

    const fieldArray = Array.from(fields);
    
    // Create CSV header
    const csvLines = [fieldArray.map(field => this.escapeCSVField(field)).join(',')];
    
    // Create data rows
    documents.forEach(doc => {
      const row = fieldArray.map(field => {
        const value = doc[field];
        return this.escapeCSVField(this.formatCSVValue(value));
      });
      csvLines.push(row.join(','));
    });

    return csvLines.join('\n');
  }

  /**
   * Export to SQL format
   * @param {Object} data - Data to export
   * @param {Object} options - Export options
   * @returns {string} SQL content
   */
  exportSQL(data, options) {
    const sqlLines = [];
    
    // Add header comment
    sqlLines.push('-- VerusDB SQL Export');
    sqlLines.push(`-- Generated on ${new Date().toISOString()}`);
    sqlLines.push('');

    for (const [collectionName, collection] of Object.entries(data.collections)) {
      if (options.collection && options.collection !== collectionName) {
        continue;
      }

      // Create table statement
      sqlLines.push(`-- Table: ${collectionName}`);
      sqlLines.push(`DROP TABLE IF EXISTS \`${collectionName}\`;`);
      
      const createTableSQL = this.generateCreateTableSQL(collectionName, collection.schema);
      sqlLines.push(createTableSQL);
      sqlLines.push('');

      // Insert data
      if (collection.documents.length > 0) {
        const fields = Object.keys(collection.schema);
        const insertPrefix = `INSERT INTO \`${collectionName}\` (${fields.map(f => `\`${f}\``).join(', ')}) VALUES`;
        
        const values = collection.documents.map(doc => {
          const valueList = fields.map(field => this.formatSQLValue(doc[field]));
          return `(${valueList.join(', ')})`;
        });

        sqlLines.push(`${insertPrefix}`);
        sqlLines.push(values.join(',\n') + ';');
        sqlLines.push('');
      }
    }

    return sqlLines.join('\n');
  }

  /**
   * Export to MongoDB format
   * @param {Object} data - Data to export
   * @param {Object} options - Export options
   * @returns {string} MongoDB content
   */
  exportMongoDB(data, options) {
    const exports = {};
    
    for (const [collectionName, collection] of Object.entries(data.collections)) {
      if (options.collection && options.collection !== collectionName) {
        continue;
      }

      // Convert to MongoDB format
      const mongoDocuments = collection.documents.map(doc => {
        const mongoDoc = { ...doc };
        
        // Convert _id to ObjectId format if it's a string
        if (typeof mongoDoc._id === 'string') {
          mongoDoc._id = { $oid: mongoDoc._id };
        }
        
        // Convert dates to MongoDB format
        Object.keys(mongoDoc).forEach(key => {
          if (mongoDoc[key] instanceof Date) {
            mongoDoc[key] = { $date: mongoDoc[key].toISOString() };
          }
        });
        
        return mongoDoc;
      });

      exports[collectionName] = mongoDocuments;
    }

    if (options.collection) {
      return JSON.stringify(exports[options.collection], null, 2);
    }

    return JSON.stringify(exports, null, 2);
  }

  // Helper methods

  /**
   * Infer schema from documents
   * @param {Array} documents - Array of documents
   * @returns {Object} Inferred schema
   */
  inferSchema(documents) {
    if (documents.length === 0) return {};
    
    const schema = {};
    const fieldTypes = {};
    
    // Analyze all documents
    documents.forEach(doc => {
      Object.keys(doc).forEach(key => {
        const value = doc[key];
        const type = this.inferFieldType(value);
        
        if (!fieldTypes[key]) {
          fieldTypes[key] = new Set();
        }
        fieldTypes[key].add(type);
      });
    });

    // Build schema
    Object.keys(fieldTypes).forEach(key => {
      const types = Array.from(fieldTypes[key]);
      
      schema[key] = {
        type: types.length === 1 ? types[0] : 'string', // Default to string for mixed types
        required: documents.every(doc => doc[key] !== undefined)
      };
    });

    return schema;
  }

  /**
   * Infer field type from value
   * @param {any} value - Field value
   * @returns {string} Inferred type
   */
  inferFieldType(value) {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    if (Array.isArray(value)) return 'array';
    if (Buffer.isBuffer(value)) return 'buffer';
    if (typeof value === 'object') return 'object';
    
    return 'string';
  }

  /**
   * Parse CSV line handling quotes and escapes
   * @param {string} line - CSV line
   * @returns {Array} Parsed values
   */
  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    values.push(current.trim());
    return values;
  }

  /**
   * Parse CSV value and convert to appropriate type
   * @param {string} value - CSV value
   * @returns {any} Parsed value
   */
  parseCSVValue(value) {
    // Remove quotes
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/""/g, '"');
    }
    
    // Try to parse as number
    if (/^-?\d+\.?\d*$/.test(value)) {
      return parseFloat(value);
    }
    
    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Try to parse as date
    if (!isNaN(Date.parse(value))) {
      return new Date(value);
    }
    
    return value;
  }

  /**
   * Escape CSV field
   * @param {string} field - Field to escape
   * @returns {string} Escaped field
   */
  escapeCSVField(field) {
    if (field.includes(',') || field.includes('"') || field.includes('\n')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  /**
   * Format value for CSV
   * @param {any} value - Value to format
   * @returns {string} Formatted value
   */
  formatCSVValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  /**
   * Convert SQL type to VerusDB type
   * @param {string} sqlType - SQL type
   * @returns {string} VerusDB type
   */
  sqlTypeToVerusType(sqlType) {
    const type = sqlType.toLowerCase();
    
    if (type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('double')) {
      return 'number';
    }
    if (type.includes('bool')) {
      return 'boolean';
    }
    if (type.includes('date') || type.includes('time')) {
      return 'date';
    }
    if (type.includes('text') || type.includes('blob')) {
      return 'object';
    }
    
    return 'string';
  }

  /**
   * Parse SQL values from INSERT statement
   * @param {string} valuesStr - Values string
   * @returns {Array} Parsed values
   */
  parseSQLValues(valuesStr) {
    const values = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;
    
    for (let i = 0; i < valuesStr.length; i++) {
      const char = valuesStr[i];
      
      if ((char === "'" || char === '"') && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = null;
      } else if (char === ',' && !inQuotes) {
        values.push(this.parseSQLValue(current.trim()));
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(this.parseSQLValue(current.trim()));
    return values;
  }

  /**
   * Parse individual SQL value
   * @param {string} value - SQL value
   * @returns {any} Parsed value
   */
  parseSQLValue(value) {
    if (value.toLowerCase() === 'null') return null;
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Remove quotes
    if ((value.startsWith("'") && value.endsWith("'")) || 
        (value.startsWith('"') && value.endsWith('"'))) {
      return value.slice(1, -1);
    }
    
    // Try parse as number
    if (/^-?\d+\.?\d*$/.test(value)) {
      return parseFloat(value);
    }
    
    return value;
  }

  /**
   * Generate CREATE TABLE SQL
   * @param {string} tableName - Table name
   * @param {Object} schema - Schema definition
   * @returns {string} CREATE TABLE SQL
   */
  generateCreateTableSQL(tableName, schema) {
    const columns = [];
    
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      let sqlType;
      
      switch (fieldDef.type) {
        case 'string':
          sqlType = 'VARCHAR(255)';
          break;
        case 'number':
          sqlType = 'DECIMAL(10,2)';
          break;
        case 'boolean':
          sqlType = 'BOOLEAN';
          break;
        case 'date':
          sqlType = 'DATETIME';
          break;
        case 'object':
        case 'array':
          sqlType = 'TEXT';
          break;
        default:
          sqlType = 'TEXT';
      }
      
      let columnDef = `\`${fieldName}\` ${sqlType}`;
      
      if (fieldDef.required) {
        columnDef += ' NOT NULL';
      }
      
      if (fieldName === '_id') {
        columnDef += ' PRIMARY KEY';
      }
      
      columns.push(columnDef);
    }

    return `CREATE TABLE \`${tableName}\` (\n  ${columns.join(',\n  ')}\n);`;
  }

  /**
   * Format value for SQL
   * @param {any} value - Value to format
   * @returns {string} Formatted SQL value
   */
  formatSQLValue(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value instanceof Date) return `'${value.toISOString()}'`;
    if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}

// Export functions
async function importData(filePath, options = {}) {
  const io = new DataIO();
  return await io.importData(filePath, options);
}

async function exportData(data, filePath, options = {}) {
  const io = new DataIO();
  return await io.exportData(data, filePath, options);
}

module.exports = {
  DataIO,
  importData,
  exportData
};