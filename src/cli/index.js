#!/usr/bin/env node

/**
 * VerusDB CLI Tool
 * Command-line interface for database management
 */

const { Command } = require('commander');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs').promises;
const path = require('path');
const VerusDB = require('../engine/VerusDB');

const program = new Command();

program
  .name('verusdb')
  .description('VerusDB - Encrypted Node.js Embedded Database')
  .version('1.0.0');

/**
 * Initialize a new VerusDB database
 */
program
  .command('init')
  .description('Initialize a new VerusDB database')
  .option('-p, --path <path>', 'Database file path', './data.vdb')
  .option('-k, --key <key>', 'Encryption key')
  .action(async (options) => {
    try {
      console.log(chalk.blue('🔧 Initializing VerusDB...'));
      
      let encryptionKey = options.key;
      if (!encryptionKey) {
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'key',
            message: 'Enter encryption key:',
            validate: (input) => input.length >= 8 || 'Key must be at least 8 characters'
          }
        ]);
        encryptionKey = answers.key;
      }

      const db = new VerusDB({
        path: options.path,
        encryptionKey
      });

      await db.init();
      
      console.log(chalk.green('✅ VerusDB initialized successfully!'));
      console.log(chalk.gray(`   Database: ${options.path}`));
      console.log(chalk.gray(`   Encrypted: Yes`));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Interactive shell/REPL
 */
program
  .command('shell')
  .description('Open interactive VerusDB shell')
  .option('-p, --path <path>', 'Database file path', './data.vdb')
  .option('-k, --key <key>', 'Encryption key')
  .action(async (options) => {
    try {
      let encryptionKey = options.key;
      if (!encryptionKey) {
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'key',
            message: 'Enter encryption key:',
            mask: '*'
          }
        ]);
        encryptionKey = answers.key;
      }

      const db = new VerusDB({
        path: options.path,
        encryptionKey
      });

      await db.init();
      
      console.log(chalk.blue('🚀 VerusDB Interactive Shell'));
      console.log(chalk.gray('Type "help" for available commands, "exit" to quit'));
      console.log(chalk.gray(`Connected to: ${options.path}\n`));

      await startShell(db);
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Display schema information
 */
program
  .command('schema')
  .description('Display database schema information')
  .option('-p, --path <path>', 'Database file path', './data.vdb')
  .option('-k, --key <key>', 'Encryption key')
  .option('--print', 'Print detailed schema')
  .option('-c, --collection <name>', 'Specific collection')
  .action(async (options) => {
    try {
      let encryptionKey = options.key;
      if (!encryptionKey) {
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'key',
            message: 'Enter encryption key:',
            mask: '*'
          }
        ]);
        encryptionKey = answers.key;
      }

      const db = new VerusDB({
        path: options.path,
        encryptionKey
      });

      await db.init();

      if (options.collection) {
        const stats = await db.getStats(options.collection);
        console.log(chalk.blue(`\n📋 Collection: ${options.collection}`));
        console.log(chalk.gray(`Documents: ${stats.documentCount}`));
        console.log(chalk.gray(`Indexes: ${stats.indexes}`));
        
        if (options.print) {
          console.log(chalk.yellow('\n🏗️  Schema:'));
          console.log(JSON.stringify(stats.schema, null, 2));
        }
      } else {
        console.log(chalk.blue('\n📊 Database Schema Overview'));
        console.log(chalk.gray(`Database: ${options.path}\n`));

        for (const [name] of db.collections.entries()) {
          const stats = await db.getStats(name);
          console.log(chalk.green(`📁 ${name}`));
          console.log(chalk.gray(`   Documents: ${stats.documentCount}`));
          console.log(chalk.gray(`   Indexes: ${stats.indexes}`));
          
          if (options.print) {
            console.log(chalk.yellow('   Schema:'));
            console.log('  ', JSON.stringify(stats.schema, null, 2).replace(/\n/g, '\n   '));
          }
          console.log();
        }
      }
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Import data from external sources
 */
program
  .command('import')
  .description('Import data from external sources')
  .option('-p, --path <path>', 'Database file path', './data.vdb')
  .option('-k, --key <key>', 'Encryption key')
  .option('--from <file>', 'Source file to import from')
  .option('--format <format>', 'Source format (json, csv, sql)', 'json')
  .option('--collection <name>', 'Target collection name')
  .action(async (options) => {
    try {
      if (!options.from) {
        console.error(chalk.red('❌ Source file is required (--from)'));
        process.exit(1);
      }

      let encryptionKey = options.key;
      if (!encryptionKey) {
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'key',
            message: 'Enter encryption key:',
            mask: '*'
          }
        ]);
        encryptionKey = answers.key;
      }

      const db = new VerusDB({
        path: options.path,
        encryptionKey
      });

      await db.init();

      console.log(chalk.blue(`📥 Importing from ${options.from}...`));

      const importData = await loadImportData(options.from, options.format);
      await db.import(importData);

      console.log(chalk.green('✅ Import completed successfully!'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Export data to external formats
 */
program
  .command('export')
  .description('Export data to external formats')
  .option('-p, --path <path>', 'Database file path', './data.vdb')
  .option('-k, --key <key>', 'Encryption key')
  .option('--to <file>', 'Target file to export to')
  .option('--format <format>', 'Export format (json, csv, sql)', 'json')
  .option('--collection <name>', 'Specific collection to export')
  .action(async (options) => {
    try {
      if (!options.to) {
        console.error(chalk.red('❌ Target file is required (--to)'));
        process.exit(1);
      }

      let encryptionKey = options.key;
      if (!encryptionKey) {
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'key',
            message: 'Enter encryption key:',
            mask: '*'
          }
        ]);
        encryptionKey = answers.key;
      }

      const db = new VerusDB({
        path: options.path,
        encryptionKey
      });

      await db.init();

      console.log(chalk.blue(`📤 Exporting to ${options.to}...`));

      const exportData = await db.export();
      await saveExportData(exportData, options.to, options.format, options.collection);

      console.log(chalk.green('✅ Export completed successfully!'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Create database backup
 */
program
  .command('backup')
  .description('Create database backup')
  .option('-p, --path <path>', 'Database file path', './data.vdb')
  .option('--out <file>', 'Backup file path')
  .action(async (options) => {
    try {
      let backupPath = options.out;
      if (!backupPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupPath = `./backup-${timestamp}.vdb`;
      }

      await fs.copyFile(options.path, backupPath);

      console.log(chalk.green('✅ Backup created successfully!'));
      console.log(chalk.gray(`   Backup: ${backupPath}`));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Serve admin panel
 */
program
  .command('serve')
  .description('Start VerusDB admin panel')
  .option('-p, --path <path>', 'Database file path', './data.vdb')
  .option('-k, --key <key>', 'Encryption key')
  .option('--port <port>', 'Server port', '4321')
  .option('--host <host>', 'Server host', 'localhost')
  .action(async (options) => {
    try {
      let encryptionKey = options.key;
      if (!encryptionKey) {
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'key',
            message: 'Enter encryption key:',
            mask: '*'
          }
        ]);
        encryptionKey = answers.key;
      }

      const db = new VerusDB({
        path: options.path,
        encryptionKey
      });

      await db.init();

      const server = await db.serveAdmin({
        port: parseInt(options.port),
        host: options.host
      });

      console.log(chalk.green('🌐 Admin panel started!'));
      console.log(chalk.blue(`   URL: ${server.url}`));
      console.log(chalk.gray('   Press Ctrl+C to stop'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

/**
 * Interactive shell implementation
 */
async function startShell(db) {
  const history = [];
  
  while (true) {
    try {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'command',
          message: chalk.cyan('verusdb>'),
          validate: (input) => input.trim().length > 0 || 'Please enter a command'
        }
      ]);

      const command = answers.command.trim();
      
      if (command === 'exit' || command === 'quit') {
        console.log(chalk.yellow('👋 Goodbye!'));
        break;
      }

      if (command === 'help') {
        showShellHelp();
        continue;
      }

      if (command === 'collections') {
        const collections = Array.from(db.collections.keys());
        console.log(chalk.green('\n📁 Collections:'));
        collections.forEach(name => console.log(`   ${name}`));
        console.log();
        continue;
      }

      if (command.startsWith('stats ')) {
        const collectionName = command.split(' ')[1];
        try {
          const stats = await db.getStats(collectionName);
          console.log(chalk.green(`\n📊 Stats for ${collectionName}:`));
          console.log(`   Documents: ${stats.documentCount}`);
          console.log(`   Indexes: ${stats.indexes}`);
          console.log();
        } catch (error) {
          console.log(chalk.red(`❌ ${error.message}`));
        }
        continue;
      }

      // Try to evaluate as JavaScript expression
      try {
        // Create safe evaluation context
        const result = await evaluateCommand(db, command);
        if (result !== undefined) {
          console.log(chalk.green('\n📄 Result:'));
          console.log(JSON.stringify(result, null, 2));
          console.log();
        }
        history.push(command);
      } catch (error) {
        console.log(chalk.red(`❌ ${error.message}\n`));
      }
    } catch (error) {
      if (error.isTtyError) {
        console.log(chalk.yellow('\n👋 Goodbye!'));
        break;
      }
      console.error(chalk.red('❌ Shell error:'), error.message);
    }
  }
}

/**
 * Show shell help
 */
function showShellHelp() {
  console.log(chalk.blue('\n🔧 VerusDB Shell Commands:'));
  console.log(chalk.gray('  help                          - Show this help'));
  console.log(chalk.gray('  exit, quit                    - Exit shell'));
  console.log(chalk.gray('  collections                   - List all collections'));
  console.log(chalk.gray('  stats <collection>            - Show collection statistics'));
  console.log(chalk.gray(''));
  console.log(chalk.blue('🔍 Database Operations (JavaScript):'));
  console.log(chalk.gray('  await db.find("users", {})              - Find documents'));
  console.log(chalk.gray('  await db.insert("users", {...})         - Insert document'));
  console.log(chalk.gray('  await db.update("users", {}, {...})     - Update documents'));
  console.log(chalk.gray('  await db.delete("users", {...})         - Delete documents'));
  console.log(chalk.gray('  await db.createCollection("name", {...}) - Create collection'));
  console.log(chalk.gray('  await db.dropCollection("name")         - Drop collection'));
  console.log();
}

/**
 * Evaluate command in safe context
 */
async function evaluateCommand(db, command) {
  // Simple command evaluation with db context
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const func = new AsyncFunction('db', `return ${command}`);
  return await func(db);
}

/**
 * Load import data from file
 */
async function loadImportData(filePath, format) {
  const content = await fs.readFile(filePath, 'utf8');
  
  switch (format) {
    case 'json':
      return JSON.parse(content);
    case 'csv':
      // Simple CSV parsing - in real implementation, use a proper CSV parser
      throw new Error('CSV import not yet implemented');
    case 'sql':
      throw new Error('SQL import not yet implemented');
    default:
      throw new Error(`Unsupported import format: ${format}`);
  }
}

/**
 * Save export data to file
 */
async function saveExportData(data, filePath, format, collection) {
  let content;
  
  // Filter by collection if specified
  if (collection && data.collections[collection]) {
    data = {
      ...data,
      collections: {
        [collection]: data.collections[collection]
      }
    };
  }

  switch (format) {
    case 'json':
      content = JSON.stringify(data, null, 2);
      break;
    case 'csv':
      throw new Error('CSV export not yet implemented');
    case 'sql':
      throw new Error('SQL export not yet implemented');
    default:
      throw new Error(`Unsupported export format: ${format}`);
  }

  await fs.writeFile(filePath, content, 'utf8');
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection:'), reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error.message);
  process.exit(1);
});

// Parse command line arguments
program.parse();