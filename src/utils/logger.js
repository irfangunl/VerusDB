/**
 * VerusDB Logging System
 * Production-ready logging with structured output and configurable levels
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.level = options.level || process.env.LOG_LEVEL || 'info';
    this.enableConsole = options.console !== false;
    this.enableFile = options.file !== false;
    this.logDir = options.logDir || './logs';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };

    if (this.enableFile) {
      this.ensureLogDirectory();
    }
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.level];
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      pid: process.pid,
      ...meta
    };

    return JSON.stringify(logEntry);
  }

  writeToFile(level, formattedMessage) {
    if (!this.enableFile) return;

    const filename = path.join(this.logDir, `verusdb-${level}.log`);
    
    try {
      // Check file size and rotate if needed
      if (fs.existsSync(filename)) {
        const stats = fs.statSync(filename);
        if (stats.size > this.maxFileSize) {
          this.rotateFile(filename);
        }
      }

      fs.appendFileSync(filename, formattedMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  rotateFile(filename) {
    try {
      const basename = path.basename(filename, '.log');
      const dirname = path.dirname(filename);

      // Remove oldest file if max files reached
      const oldestFile = path.join(dirname, `${basename}.${this.maxFiles}.log`);
      if (fs.existsSync(oldestFile)) {
        fs.unlinkSync(oldestFile);
      }

      // Rotate existing files
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const currentFile = path.join(dirname, `${basename}.${i}.log`);
        const nextFile = path.join(dirname, `${basename}.${i + 1}.log`);
        
        if (fs.existsSync(currentFile)) {
          fs.renameSync(currentFile, nextFile);
        }
      }

      // Move current file to .1
      const rotatedFile = path.join(dirname, `${basename}.1.log`);
      fs.renameSync(filename, rotatedFile);
    } catch (error) {
      console.error('Failed to rotate log file:', error.message);
    }
  }

  log(level, message, meta = {}) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, meta);

    if (this.enableConsole) {
      const colors = {
        error: '\x1b[31m',
        warn: '\x1b[33m',
        info: '\x1b[36m',
        debug: '\x1b[35m',
        trace: '\x1b[37m'
      };
      const reset = '\x1b[0m';
      
      console.log(`${colors[level] || ''}${formattedMessage}${reset}`);
    }

    this.writeToFile(level, formattedMessage);
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  trace(message, meta = {}) {
    this.log('trace', message, meta);
  }

  // Performance logging
  startTimer(label) {
    const start = process.hrtime.bigint();
    return {
      end: () => {
        const duration = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
        this.debug(`Timer ${label}`, { duration: `${duration.toFixed(2)}ms` });
        return duration;
      }
    };
  }

  // Audit logging for admin operations
  audit(action, details = {}) {
    this.info(`AUDIT: ${action}`, {
      audit: true,
      action,
      ...details,
      timestamp: new Date().toISOString()
    });
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = { Logger, logger };
