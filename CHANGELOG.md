# Changelog

All notable changes to VerusDB will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-06-17

### Added
- Initial public release of VerusDB
- Encrypted embedded database with AES-256 encryption
- MongoDB-style query interface with full-text search
- Schema validation and enforcement
- Web-based admin panel with modern UI
- Command-line interface for database management
- Data import/export functionality
- Backup and restore capabilities
- Comprehensive test suite (42 tests)
- Docker support with docker-compose
- Production-ready logging and monitoring
- Examples and documentation

### Features
- **Database Engine**: Single-file encrypted storage (.vdb format)
- **Queries**: MongoDB-like query syntax with advanced operators
- **Schema**: Flexible schema definition with validation
- **Security**: Built-in encryption, rate limiting, and audit logging
- **Admin Panel**: React-based web interface for database management
- **CLI**: Full-featured command-line interface
- **Performance**: Optimized for small to medium datasets
- **Portability**: Everything in a single encrypted file

### Documentation
- Complete README with examples and usage instructions
- MIT license
- Contributing guidelines
- Docker deployment examples

### Supported Platforms
- Node.js 14.0.0 or higher
- Windows, macOS, Linux
- Docker environments
