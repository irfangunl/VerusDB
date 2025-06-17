/**
 * VerusDB Performance Monitoring
 * Metrics collection and performance tracking
 */

const EventEmitter = require('events');
const { logger } = require('./logger');

class PerformanceMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.timers = new Map();
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    
    this.startTime = Date.now();
    this.systemMetrics = {
      operationCount: 0,
      errorCount: 0,
      totalOperationTime: 0,
      peakMemoryUsage: 0,
      currentConnections: 0
    };

    // Start background metrics collection
    this.startMetricsCollection();
  }

  startMetricsCollection() {
    // Collect system metrics every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Clean old metrics every 5 minutes
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 5 * 60 * 1000);
  }

  collectSystemMetrics() {
    const memUsage = process.memoryUsage();
    
    this.recordGauge('system_memory_used', memUsage.heapUsed);
    this.recordGauge('system_memory_total', memUsage.heapTotal);
    this.recordGauge('system_memory_external', memUsage.external);
    this.recordGauge('system_memory_rss', memUsage.rss);
    
    if (memUsage.heapUsed > this.systemMetrics.peakMemoryUsage) {
      this.systemMetrics.peakMemoryUsage = memUsage.heapUsed;
    }

    // CPU usage (simple approximation)
    const cpuUsage = process.cpuUsage();
    this.recordGauge('system_cpu_user', cpuUsage.user);
    this.recordGauge('system_cpu_system', cpuUsage.system);

    // Uptime
    this.recordGauge('system_uptime', Date.now() - this.startTime);

    // Event loop lag
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      this.recordGauge('system_event_loop_lag', lag);
    });
  }

  cleanupOldMetrics() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const [key, entries] of this.histograms.entries()) {
      this.histograms.set(key, entries.filter(entry => entry.timestamp > cutoff));
    }
    
    logger.debug('Cleaned up old performance metrics');
  }

  // Timer operations
  startTimer(name, metadata = {}) {
    const timerId = `${name}_${Date.now()}_${Math.random()}`;
    this.timers.set(timerId, {
      name,
      startTime: process.hrtime.bigint(),
      metadata
    });
    return timerId;
  }

  endTimer(timerId) {
    const timer = this.timers.get(timerId);
    if (!timer) {
      logger.warn(`Timer ${timerId} not found`);
      return null;
    }

    const duration = Number(process.hrtime.bigint() - timer.startTime) / 1000000; // Convert to ms
    this.timers.delete(timerId);
    
    this.recordHistogram(timer.name, duration, timer.metadata);
    this.systemMetrics.totalOperationTime += duration;
    
    return duration;
  }

  // Counter operations
  incrementCounter(name, value = 1, metadata = {}) {
    const current = this.counters.get(name) || { value: 0, metadata: {} };
    current.value += value;
    current.metadata = { ...current.metadata, ...metadata };
    current.lastUpdated = Date.now();
    
    this.counters.set(name, current);
    
    if (name.includes('operation')) {
      this.systemMetrics.operationCount += value;
    }
    if (name.includes('error')) {
      this.systemMetrics.errorCount += value;
    }
  }

  // Gauge operations (single values that can go up or down)
  recordGauge(name, value, metadata = {}) {
    this.gauges.set(name, {
      value,
      metadata,
      timestamp: Date.now()
    });
  }

  // Histogram operations (for tracking distributions)
  recordHistogram(name, value, metadata = {}) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    
    const entries = this.histograms.get(name);
    entries.push({
      value,
      metadata,
      timestamp: Date.now()
    });
    
    // Keep only last 10000 entries per histogram
    if (entries.length > 10000) {
      entries.splice(0, entries.length - 10000);
    }
  }

  // Database-specific metrics
  recordDatabaseOperation(operation, collection, duration, success = true, metadata = {}) {
    this.incrementCounter(`db_operations_total`, 1, { operation, collection });
    this.incrementCounter(`db_operations_${operation}`, 1, { collection });
    
    if (success) {
      this.incrementCounter(`db_operations_success`, 1, { operation, collection });
    } else {
      this.incrementCounter(`db_operations_error`, 1, { operation, collection });
    }
    
    this.recordHistogram(`db_operation_duration`, duration, { operation, collection, ...metadata });
    this.recordHistogram(`db_operation_duration_${operation}`, duration, { collection, ...metadata });
  }

  recordQueryPerformance(query, collection, resultCount, duration, metadata = {}) {
    this.recordHistogram(`db_query_duration`, duration, { collection, resultCount, ...metadata });
    this.recordHistogram(`db_query_result_count`, resultCount, { collection, ...metadata });
    
    // Track slow queries (> 1 second)
    if (duration > 1000) {
      this.incrementCounter(`db_slow_queries`, 1, { collection });
      logger.warn('Slow query detected', {
        collection,
        duration,
        resultCount,
        query: JSON.stringify(query).substring(0, 500) // Truncate long queries
      });
    }
  }

  recordCacheHit(cacheType, hit = true) {
    this.incrementCounter(`cache_${cacheType}_total`, 1);
    this.incrementCounter(`cache_${cacheType}_${hit ? 'hits' : 'misses'}`, 1);
  }

  recordConnectionEvent(event, count = 1) {
    this.incrementCounter(`connections_${event}`, count);
    
    if (event === 'opened') {
      this.systemMetrics.currentConnections += count;
    } else if (event === 'closed') {
      this.systemMetrics.currentConnections -= count;
    }
    
    this.recordGauge('connections_current', this.systemMetrics.currentConnections);
  }

  // Metrics aggregation
  getCounterValue(name) {
    const counter = this.counters.get(name);
    return counter ? counter.value : 0;
  }

  getGaugeValue(name) {
    const gauge = this.gauges.get(name);
    return gauge ? gauge.value : null;
  }

  getHistogramStats(name, timeWindow = 60000) { // Default 1 minute
    const entries = this.histograms.get(name);
    if (!entries || entries.length === 0) {
      return null;
    }

    const cutoff = Date.now() - timeWindow;
    const recentEntries = entries.filter(entry => entry.timestamp > cutoff);
    
    if (recentEntries.length === 0) {
      return null;
    }

    const values = recentEntries.map(entry => entry.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / count;
    
    return {
      count,
      sum,
      mean,
      min: values[0],
      max: values[count - 1],
      median: values[Math.floor(count / 2)],
      p95: values[Math.floor(count * 0.95)],
      p99: values[Math.floor(count * 0.99)]
    };
  }

  getAllMetrics() {
    const metrics = {
      system: this.systemMetrics,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      counters: {},
      gauges: {},
      histograms: {}
    };

    // Collect counter values
    for (const [name, counter] of this.counters.entries()) {
      metrics.counters[name] = {
        value: counter.value,
        lastUpdated: counter.lastUpdated
      };
    }

    // Collect gauge values
    for (const [name, gauge] of this.gauges.entries()) {
      metrics.gauges[name] = {
        value: gauge.value,
        timestamp: gauge.timestamp
      };
    }

    // Collect histogram statistics
    for (const [name] of this.histograms.entries()) {
      const stats = this.getHistogramStats(name);
      if (stats) {
        metrics.histograms[name] = stats;
      }
    }

    return metrics;
  }

  // Health check
  getHealthStatus() {
    const memUsage = process.memoryUsage();
    const uptime = Date.now() - this.startTime;
    
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      uptime,
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      },
      operations: {
        total: this.systemMetrics.operationCount,
        errors: this.systemMetrics.errorCount,
        errorRate: this.systemMetrics.operationCount > 0 ? 
          (this.systemMetrics.errorCount / this.systemMetrics.operationCount) * 100 : 0
      },
      connections: this.systemMetrics.currentConnections
    };

    // Determine health status
    if (health.memory.percentage > 90) {
      health.status = 'unhealthy';
      health.issues = health.issues || [];
      health.issues.push('High memory usage');
    }

    if (health.operations.errorRate > 10) {
      health.status = 'unhealthy';
      health.issues = health.issues || [];
      health.issues.push('High error rate');
    }

    if (uptime < 30000) { // Less than 30 seconds
      health.status = 'starting';
    }

    return health;
  }

  // Reset all metrics (useful for testing)
  reset() {
    this.metrics.clear();
    this.timers.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    
    this.systemMetrics = {
      operationCount: 0,
      errorCount: 0,
      totalOperationTime: 0,
      peakMemoryUsage: 0,
      currentConnections: 0
    };
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = { PerformanceMonitor, performanceMonitor };
