/**
 * API Service for VerusDB Admin Panel
 * Handles all HTTP requests to the backend API
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

class ApiService {
  constructor() {
    this.sessionId = this.getStoredSessionId();
  }

  getStoredSessionId() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem('verusdb_session');
      }
    } catch (error) {
      console.warn('localStorage not available:', error);
    }
    return null;
  }

  setSessionId(sessionId) {
    this.sessionId = sessionId;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('verusdb_session', sessionId);
      }
    } catch (error) {
      console.warn('Failed to store session:', error);
    }
  }

  clearSessionId() {
    this.sessionId = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('verusdb_session');
      }
    } catch (error) {
      console.warn('Failed to clear session:', error);
    }
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.sessionId) {
      headers['X-Session-ID'] = this.sessionId;
    }

    return headers;
  }

  hasValidSession() {
    return !!this.sessionId;
  }

  getSessionId() {
    return this.sessionId;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: this.getHeaders(),
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
    } catch (error) {
      console.error('API Request failed:', error);
      throw error;
    }
  }

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Database Stats
  async getStats() {
    return this.get('/api/stats');
  }

  // Collections
  async getCollections() {
    return this.get('/api/collections');
  }

  async createCollection(name, schema, indexes) {
    return this.post('/api/collections', { name, schema, indexes });
  }

  async deleteCollection(name) {
    return this.delete(`/api/collections/${name}`);
  }

  // Documents
  async getDocuments(collection, options = {}) {
    const params = new URLSearchParams();
    
    if (options.page) params.append('page', options.page);
    if (options.limit) params.append('limit', options.limit);
    if (options.filter) params.append('filter', JSON.stringify(options.filter));
    if (options.sort) params.append('sort', JSON.stringify(options.sort));

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.get(`/api/collections/${collection}/documents${query}`);
  }

  async insertDocument(collection, document) {
    return this.post(`/api/collections/${collection}/documents`, document);
  }

  async updateDocument(collection, id, document) {
    return this.put(`/api/collections/${collection}/documents/${id}`, document);
  }

  async deleteDocument(collection, id) {
    return this.delete(`/api/collections/${collection}/documents/${id}`);
  }

  // Schema
  async getSchema(collection) {
    return this.get(`/api/collections/${collection}/schema`);
  }

  async updateSchema(collection, schema) {
    return this.put(`/api/collections/${collection}/schema`, { schema });
  }

  // Indexes
  async getIndexes(collection) {
    return this.get(`/api/collections/${collection}/indexes`);
  }

  async createIndex(collection, field, options = {}) {
    return this.post(`/api/collections/${collection}/indexes`, {
      field,
      unique: options.unique || false,
      sparse: options.sparse || false,
    });
  }

  async deleteIndex(collection, field) {
    return this.delete(`/api/collections/${collection}/indexes/${field}`);
  }

  // Query
  async runQuery(collection, query, options = {}) {
    return this.post(`/api/collections/${collection}/query`, { query, options });
  }

  // Import/Export
  async exportData(options = {}) {
    return this.post('/api/export', options);
  }

  async importData(data) {
    return this.post('/api/import', data);
  }

  // Backup
  async createBackup() {
    return this.post('/api/backup', {});
  }

  async listBackups() {
    return this.get('/api/backup/list');
  }

  // File Upload
  async uploadFile(file, endpoint) {
    const formData = new FormData();
    formData.append('file', file);

    const headers = {};
    if (this.sessionId) {
      headers['X-Session-ID'] = this.sessionId;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // WebSocket connection for real-time updates
  connectWebSocket(onMessage) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      // Subscribe to updates
      ws.send(JSON.stringify({ type: 'subscribe', collections: [] }));
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
      }
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    // Ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);

    return ws;
  }
}

const apiService = new ApiService();
export default apiService;

// Named exports for convenience
export const {
  setSessionId,
  clearSessionId,
  hasValidSession,
  getSessionId,
  getStats,
  getCollections,
  createCollection,
  deleteCollection,
  getDocuments,
  insertDocument,
  updateDocument,
  deleteDocument,
  getSchema,
  updateSchema,
  getIndexes,
  createIndex,
  deleteIndex,
  runQuery,
  exportData,
  importData,
  createBackup,
  listBackups,
  uploadFile,
  connectWebSocket,
} = apiService;