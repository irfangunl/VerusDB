/**
 * VerusDB Admin Panel API Server
 * Provides REST API and WebSocket connections for the admin panel
 * Production-ready with security, monitoring, and error handling
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs').promises;
const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const { logger } = require('../utils/logger');
const { config } = require('../utils/config');
const { performanceMonitor } = require('../utils/performance');
const { SecurityMiddleware } = require('../utils/security');
const { 
  ErrorFactory, 
  AuthenticationError, 
  ValidationError,
  DatabaseError 
} = require('../utils/errors');

class VerusAdmin {
  constructor(database, options = {}) {
    this.db = database;
    this.port = options.port || config.get('admin.port');
    this.host = options.host || config.get('admin.host');
    this.password = options.password;
    this.sessions = new Map();
    
    this.app = express();
    
    // Security middleware
    this.security = new SecurityMiddleware(config);
    
    // Create HTTP or HTTPS server
    if (config.get('admin.enableHttps')) {
      this.server = https.createServer({
        cert: fs.readFileSync(config.get('admin.tlsCert')),
        key: fs.readFileSync(config.get('admin.tlsKey'))
      }, this.app);
    } else {
      this.server = http.createServer(this.app);
    }
    
    this.wss = new WebSocket.Server({ server: this.server });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
    
    logger.info('VerusAdmin server created', { 
      port: this.port, 
      host: this.host,
      https: config.get('admin.enableHttps')
    });
  }
  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Compression
    this.app.use(compression());
    
    // Security headers
    this.app.use(this.security.createSecurityHeaders());
    
    // Request logging
    this.app.use(this.security.createRequestLogger());
    
    // Rate limiting
    this.app.use(this.security.createRateLimiter());
    
    // CORS
    if (config.get('admin.enableCors')) {
      this.app.use(cors(this.security.configureCors()));
    }
    
    // Body parsing with size limits
    this.app.use(express.json({ 
      limit: config.get('admin.maxRequestSize'),
      verify: (req, res, buf) => {
        // Store raw body for signature verification if needed
        req.rawBody = buf;
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true,
      limit: config.get('admin.maxRequestSize')
    }));
    
    // Input sanitization
    this.app.use(this.security.sanitizeInput());
    
    // Serve static files for admin panel
    const adminPanelPath = path.join(__dirname, '../../admin-panel/build');
    this.app.use(express.static(adminPanelPath, {
      maxAge: config.isDevelopment() ? 0 : '1d',
      etag: true
    }));
    
    logger.debug('Admin server middleware configured');
  }
  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint (no auth required)
    this.app.get('/health', this.handleHealthCheck.bind(this));
    
    // Metrics endpoint (no auth required, but can be disabled)
    if (config.get('monitoring.enableMetrics')) {
      this.app.get('/metrics', this.handleMetrics.bind(this));
    }
    
    // Authentication routes (no auth required)
    this.app.post('/auth/login', 
      this.security.createAuthRateLimiter(),
      this.security.validateRequest({
        required: ['password'],
        fields: {
          password: { type: 'string', minLength: 1 }
        }
      }),
      this.handleLogin.bind(this)
    );
    this.app.post('/auth/logout', this.handleLogout.bind(this));
    this.app.get('/auth/status', this.handleAuthStatus.bind(this));
    this.app.post('/auth/setup', 
      this.security.validateRequest({
        required: ['password'],
        fields: {
          password: { type: 'string', minLength: 6 }
        }
      }),
      this.handleSetupPassword.bind(this)
    );

    // Database routes (auth required)
    this.app.get('/api/stats', this.authenticateSession.bind(this), this.handleGetStats.bind(this));
    this.app.get('/api/collections', this.authenticateSession.bind(this), this.handleGetCollections.bind(this));
    this.app.post('/api/collections', 
      this.authenticateSession.bind(this),
      this.security.validateRequest({
        required: ['name'],
        fields: {
          name: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z][a-zA-Z0-9_]*$' },
          schema: { type: 'object' },
          indexes: { type: 'array' }
        }
      }),
      this.handleCreateCollection.bind(this)
    );
    this.app.delete('/api/collections/:name', this.authenticateSession.bind(this), this.handleDeleteCollection.bind(this));
    
    // Document routes (auth required)
    this.app.get('/api/collections/:name/documents', this.authenticateSession.bind(this), this.handleGetDocuments.bind(this));
    this.app.post('/api/collections/:name/documents', 
      this.authenticateSession.bind(this),
      this.security.validateRequest({
        fields: {
          // Document validation will be handled by schema
        }
      }),
      this.handleInsertDocument.bind(this)
    );
    this.app.put('/api/collections/:name/documents/:id', this.authenticateSession.bind(this), this.handleUpdateDocument.bind(this));
    this.app.delete('/api/collections/:name/documents/:id', this.authenticateSession.bind(this), this.handleDeleteDocument.bind(this));
    
    // Schema routes (auth required)
    this.app.get('/api/collections/:name/schema', this.authenticateSession.bind(this), this.handleGetSchema.bind(this));
    this.app.put('/api/collections/:name/schema', 
      this.authenticateSession.bind(this),
      this.security.validateRequest({
        required: ['schema'],
        fields: {
          schema: { type: 'object' }
        }
      }),
      this.handleUpdateSchema.bind(this)
    );
    
    // Index routes (auth required)
    this.app.get('/api/collections/:name/indexes', this.authenticateSession.bind(this), this.handleGetIndexes.bind(this));
    this.app.post('/api/collections/:name/indexes', 
      this.authenticateSession.bind(this),
      this.security.validateRequest({
        required: ['field'],
        fields: {
          field: { type: 'string', minLength: 1 },
          unique: { type: 'boolean' },
          sparse: { type: 'boolean' }
        }
      }),
      this.handleCreateIndex.bind(this)
    );
    this.app.delete('/api/collections/:name/indexes/:field', this.authenticateSession.bind(this), this.handleDeleteIndex.bind(this));
    
    // Query routes (auth required)
    this.app.post('/api/collections/:name/query', 
      this.authenticateSession.bind(this),
      this.security.validateRequest({
        fields: {
          query: { type: 'object' },
          options: { type: 'object' }
        }
      }),
      this.handleQuery.bind(this)
    );
    
    // Import/Export routes (auth required)
    this.app.post('/api/export', this.authenticateSession.bind(this), this.handleExport.bind(this));
    this.app.post('/api/import', this.authenticateSession.bind(this), this.handleImport.bind(this));
    
    // Backup routes (auth required)
    this.app.post('/api/backup', this.authenticateSession.bind(this), this.handleBackup.bind(this));
    this.app.get('/api/backup/list', this.authenticateSession.bind(this), this.handleListBackups.bind(this));
    
    // Serve admin panel for all other routes
    this.app.get('*', (req, res) => {
      const indexPath = path.join(__dirname, '../../admin-panel/build/index.html');
      res.sendFile(indexPath);
    });
    
    logger.debug('Admin server routes configured');
  }

  /**
   * Setup WebSocket connection for real-time updates
   */
  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      console.log('Admin panel client connected');
      
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          ws.send(JSON.stringify({ error: error.message }));
        }
      });
      
      ws.on('close', () => {
        console.log('Admin panel client disconnected');
      });
    });
  }
  /**
   * Start the admin server
   * @returns {Promise<VerusAdmin>} Admin server instance
   */
  async start() {
    await this.ensurePasswordSetup();
    
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`VerusDB Admin Panel started at http://${this.host}:${this.port}`);
          // Add url property to the instance for convenience
          this.url = `http://${this.host}:${this.port}`;
          resolve(this);
        }
      });
    });
  }

  /**
   * Stop the admin server
   * @returns {Promise<void>}
   */
  async stop() {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('VerusDB Admin Panel stopped');
        resolve();
      });
    });
  }

  /**
   * Ensure admin password is set up
   */
  async ensurePasswordSetup() {
    const credentialsPath = '.verusdb/credentials.json';
    
    try {
      await fs.access(credentialsPath);
      const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));
      this.hashedPassword = credentials.hashedPassword;
    } catch {
      // No credentials file exists, prompt for password setup
      if (!this.password) {
        console.log('\n⚠️  No admin password set. Please create one:');
        const inquirer = require('inquirer');
        
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'password',
            message: 'Enter admin password:',
            validate: (input) => input.length >= 6 || 'Password must be at least 6 characters'
          },
          {
            type: 'password',
            name: 'confirmPassword',
            message: 'Confirm password:',
            validate: (input, answers) => input === answers.password || 'Passwords do not match'
          }
        ]);
        
        this.password = answers.password;
      }
      
      // Hash and save password
      this.hashedPassword = await this.db.encryption.hashPassword(this.password);
      await this.saveCredentials();
    }
  }

  /**
   * Save admin credentials
   */
  async saveCredentials() {
    const credentialsPath = '.verusdb/credentials.json';
    const credentialsDir = path.dirname(credentialsPath);
    
    await fs.mkdir(credentialsDir, { recursive: true });
    
    const credentials = {
      hashedPassword: this.hashedPassword,
      created: new Date().toISOString()
    };
    
    await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2));
    console.log('✅ Admin credentials stored securely');
  }

  /**
   * Authenticate session middleware
   */
  async authenticateSession(req, res, next) {
    const sessionId = req.headers['x-session-id'];
    
    if (!sessionId || !this.sessions.has(sessionId)) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const session = this.sessions.get(sessionId);
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return res.status(401).json({ error: 'Session expired' });
    }
    
    // Extend session
    session.expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    next();
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return Math.random().toString(36).substr(2, 16) + Date.now().toString(36);
  }

  // Route handlers

  async handleLogin(req, res) {
    try {
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ error: 'Password required' });
      }
      
      const isValid = await this.db.encryption.verifyPassword(password, this.hashedPassword);
      
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid password' });
      }
      
      const sessionId = this.generateSessionId();
      this.sessions.set(sessionId, {
        createdAt: Date.now(),
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      });
      
      res.json({ sessionId, success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleLogout(req, res) {
    const sessionId = req.headers['x-session-id'];
    if (sessionId) {
      this.sessions.delete(sessionId);
    }
    res.json({ success: true });
  }

  async handleAuthStatus(req, res) {
    try {
      const hasPassword = !!this.hashedPassword;
      const sessionId = req.headers['x-session-id'];
      let authenticated = false;
      
      if (sessionId && this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId);
        authenticated = Date.now() < session.expiresAt;
      }
      
      res.json({ hasPassword, authenticated });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleSetupPassword(req, res) {
    try {
      const { password } = req.body;
      
      if (this.hashedPassword) {
        return res.status(400).json({ error: 'Password already set' });
      }
      
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      
      this.hashedPassword = await this.db.encryption.hashPassword(password);
      await this.saveCredentials();
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetStats(req, res) {
    try {
      const stats = await this.db.storage.getFileStats();
      const collections = Array.from(this.db.collections.keys());
      
      res.json({
        database: {
          path: this.db.path,
          size: stats?.size || 0,
          created: stats?.created,
          modified: stats?.modified,
          encrypted: true
        },
        collections: {
          count: collections.length,
          names: collections
        },
        indexes: {
          count: this.db.indexes.size
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetCollections(req, res) {
    try {
      const collections = [];
      
      for (const [name, collection] of this.db.collections.entries()) {
        const stats = await this.db.getStats(name);
        collections.push(stats);
      }
      
      res.json(collections);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleCreateCollection(req, res) {
    try {
      const { name, schema, indexes } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Collection name required' });
      }
      
      await this.db.createCollection(name, { schema, indexes });
      
      res.json({ success: true, name });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleDeleteCollection(req, res) {
    try {
      const { name } = req.params;
      await this.db.dropCollection(name);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetDocuments(req, res) {
    try {
      const { name } = req.params;
      const { page = 1, limit = 50, filter, sort } = req.query;
      
      const query = filter ? JSON.parse(filter) : {};
      const options = {
        skip: (page - 1) * limit,
        limit: parseInt(limit)
      };
      
      if (sort) {
        options.sort = JSON.parse(sort);
      }
      
      const documents = await this.db.find(name, query, options);
      const total = (await this.db.find(name, query)).length;
      
      res.json({
        documents,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleInsertDocument(req, res) {
    try {
      const { name } = req.params;
      const document = req.body;
      
      const result = await this.db.insert(name, document);
      
      res.json({ success: true, document: result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleUpdateDocument(req, res) {
    try {
      const { name, id } = req.params;
      const update = req.body;
      
      const result = await this.db.update(name, { _id: id }, { $set: update });
      
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleDeleteDocument(req, res) {
    try {
      const { name, id } = req.params;
      
      const result = await this.db.delete(name, { _id: id });
      
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetSchema(req, res) {
    try {
      const { name } = req.params;
      const collection = this.db.getCollection(name);
      
      res.json({ schema: collection.schema });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleUpdateSchema(req, res) {
    try {
      const { name } = req.params;
      const { schema } = req.body;
      
      const collection = this.db.getCollection(name);
      collection.schema = this.db.schema.validateSchema(schema);
      
      await this.db.saveCollection(name);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetIndexes(req, res) {
    try {
      const { name } = req.params;
      const indexes = [];
      
      for (const [key, index] of this.db.indexes.entries()) {
        if (key.startsWith(`${name}.`)) {
          indexes.push({
            field: index.field,
            unique: index.unique,
            sparse: index.sparse
          });
        }
      }
      
      res.json(indexes);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleCreateIndex(req, res) {
    try {
      const { name } = req.params;
      const { field, unique, sparse } = req.body;
      
      await this.db.createIndex(name, field, { unique, sparse });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleDeleteIndex(req, res) {
    try {
      const { name, field } = req.params;
      
      await this.db.dropIndex(name, field);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleQuery(req, res) {
    try {
      const { name } = req.params;
      const { query, options } = req.body;
      
      const startTime = Date.now();
      const results = await this.db.find(name, query, options);
      const executionTime = Date.now() - startTime;
      
      res.json({
        results,
        meta: {
          count: results.length,
          executionTime: `${executionTime}ms`
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleExport(req, res) {
    try {
      const { format = 'json', collections } = req.body;
      
      let data = await this.db.export();
      
      if (collections && Array.isArray(collections)) {
        // Filter specific collections
        const filteredData = { ...data, collections: {} };
        for (const collectionName of collections) {
          if (data.collections[collectionName]) {
            filteredData.collections[collectionName] = data.collections[collectionName];
          }
        }
        data = filteredData;
      }
      
      switch (format) {
        case 'json':
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename="verusdb-export.json"');
          res.json(data);
          break;
        default:
          res.status(400).json({ error: 'Unsupported export format' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleImport(req, res) {
    try {
      const data = req.body;
      
      await this.db.import(data);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleBackup(req, res) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `./backups/verusdb-${timestamp}.vdb`;
      
      await this.db.storage.backup(backupPath);
      
      res.json({ 
        success: true, 
        backupPath,
        timestamp 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleListBackups(req, res) {
    try {
      const backupsDir = './backups';
      const files = await fs.readdir(backupsDir).catch(() => []);
      
      const backups = [];
      for (const file of files) {
        if (file.endsWith('.vdb')) {
          const stats = await fs.stat(path.join(backupsDir, file));
          backups.push({
            filename: file,
            size: stats.size,
            created: stats.birthtime
          });
        }
      }
      
      res.json(backups);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleWebSocketMessage(ws, data) {
    switch (data.type) {
      case 'subscribe':
        // Handle real-time subscriptions
        ws.subscriptions = data.collections || [];
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  }

  /**
   * Broadcast updates to connected clients
   */
  broadcastUpdate(type, data) {
    const message = JSON.stringify({ type, data, timestamp: new Date() });
    
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Setup error handling middleware
   */
  setupErrorHandling() {
    // Handle 404 for API routes
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        error: 'API endpoint not found',
        code: 'NOT_FOUND',
        path: req.path
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      // Log error
      logger.error('Admin server error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });

      // Track error metrics
      performanceMonitor.incrementCounter('admin_errors_total', 1, {
        path: req.path,
        method: req.method,
        errorType: error.constructor.name
      });

      // Send error response
      const statusCode = error.statusCode || 500;
      const response = {
        error: error.message || 'Internal server error',
        code: error.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      };

      // Add stack trace in development
      if (config.isDevelopment() && error.stack) {
        response.stack = error.stack;
      }

      res.status(statusCode).json(response);
    });

    logger.debug('Error handling middleware configured');
  }

  // Health check and metrics handlers
  async handleHealthCheck(req, res) {
    try {
      const health = performanceMonitor.getHealthStatus();
      
      // Check database connectivity
      if (this.db && typeof this.db.isInitialized === 'boolean' && this.db.isInitialized) {
        health.database = { status: 'connected' };
      } else {
        health.database = { status: 'disconnected' };
        health.status = 'unhealthy';
        health.issues = health.issues || [];
        health.issues.push('Database not connected');
      }

      // Check file system access
      try {
        if (this.db && this.db.path) {
          await fs.access(this.db.path);
          health.storage = { status: 'accessible' };
        } else {
          health.storage = { status: 'unknown' };
        }
      } catch {
        health.storage = { status: 'inaccessible' };
        health.status = 'unhealthy';
        health.issues = health.issues || [];
        health.issues.push('Storage not accessible');
      }

      const statusCode = health.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(health);
      
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      res.status(503).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleMetrics(req, res) {
    try {
      const metrics = performanceMonitor.getAllMetrics();
      
      // Add admin-specific metrics
      metrics.admin = {
        activeSessions: this.sessions.size,
        activeConnections: this.wss.clients.size,
        uptime: Date.now() - (this.startTime || Date.now())
      };

      res.json(metrics);
      
    } catch (error) {
      logger.error('Metrics collection failed', { error: error.message });
      res.status(500).json({
        error: 'Failed to collect metrics',
        timestamp: new Date().toISOString()
      });
    }
  }
}

module.exports = { VerusAdmin };