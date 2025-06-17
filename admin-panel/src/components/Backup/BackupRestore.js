import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  Card,
  CardContent,
  Grid,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
} from '@mui/material';
import {
  Backup as BackupIcon,
  Restore as RestoreIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  CloudUpload as CloudUploadIcon,
  FileDownload as ExportIcon,
  Assessment as StatsIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import apiService from '../../services/apiService';

function BackupRestore() {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createBackupDialog, setCreateBackupDialog] = useState(false);
  const [restoreDialog, setRestoreDialog] = useState(false);
  const [exportDialog, setExportDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [collections, setCollections] = useState([]);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [exportFormat, setExportFormat] = useState('json');
  const [importFile, setImportFile] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadBackups();
    loadCollections();
    loadStats();
  }, []);

  const loadBackups = async () => {
    try {
      const data = await apiService.listBackups();
      setBackups(data.sort((a, b) => new Date(b.created) - new Date(a.created)));
    } catch (error) {
      console.error('Failed to load backups:', error);
      toast.error('Failed to load backups');
    }
  };

  const loadCollections = async () => {
    try {
      const data = await apiService.getCollections();
      setCollections(data);
    } catch (error) {
      console.error('Failed to load collections:', error);
    }
  };

  const loadStats = async () => {
    try {
      const data = await apiService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const createBackup = async () => {
    try {
      setLoading(true);
      const result = await apiService.createBackup();
      toast.success('Backup created successfully');
      setCreateBackupDialog(false);
      loadBackups();
    } catch (error) {
      toast.error('Failed to create backup: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const exportData = async () => {
    try {
      setLoading(true);
      
      const exportOptions = {
        format: exportFormat,
        collections: selectedCollections.length > 0 ? selectedCollections : undefined
      };

      const data = await apiService.exportData(exportOptions);
      
      // Create and download file
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verusdb-export-${format(new Date(), 'yyyy-MM-dd-HH-mm-ss')}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Data exported successfully');
      setExportDialog(false);
    } catch (error) {
      toast.error('Failed to export data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error('Please select a file to import');
      return;
    }

    try {
      setLoading(true);
      
      const text = await importFile.text();
      const data = JSON.parse(text);
      
      await apiService.importData(data);
      
      toast.success('Data imported successfully');
      setImportDialog(false);
      setImportFile(null);
      loadCollections();
      loadStats();
    } catch (error) {
      toast.error('Failed to import data: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Backup & Restore
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        Manage database backups, export data to various formats, and import data from external sources.
      </Typography>

      {/* Database Stats */}
      {stats && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              <StatsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Database Overview
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="primary">
                    {formatFileSize(stats.database?.size || 0)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Database Size
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="success.main">
                    {stats.collections?.count || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Collections
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box textAlign="center">
                  <Typography variant="h4" color="warning.main">
                    {stats.indexes?.count || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Indexes
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box textAlign="center">
                  <Chip 
                    label={stats.database?.encrypted ? 'Encrypted' : 'Not Encrypted'}
                    color={stats.database?.encrypted ? 'success' : 'error'}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Security Status
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Button
            fullWidth
            variant="contained"
            startIcon={<BackupIcon />}
            onClick={() => setCreateBackupDialog(true)}
            size="large"
          >
            Create Backup
          </Button>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<ExportIcon />}
            onClick={() => setExportDialog(true)}
            size="large"
          >
            Export Data
          </Button>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<UploadIcon />}
            onClick={() => setImportDialog(true)}
            size="large"
          >
            Import Data
          </Button>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<ScheduleIcon />}
            disabled
            size="large"
          >
            Schedule Backup
          </Button>
        </Grid>
      </Grid>

      {/* Backup List */}
      <Paper>
        <Box p={2}>
          <Typography variant="h6" gutterBottom>
            Available Backups
          </Typography>
          
          {backups.length === 0 ? (
            <Alert severity="info">
              No backups available. Create your first backup to get started.
            </Alert>
          ) : (
            <List>
              {backups.map((backup, index) => (
                <React.Fragment key={backup.filename}>
                  <ListItem>
                    <ListItemText
                      primary={backup.filename}
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            Created: {format(new Date(backup.created), 'PPpp')}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Size: {formatFileSize(backup.size)}
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        onClick={() => {
                          setSelectedBackup(backup);
                          setRestoreDialog(true);
                        }}
                        sx={{ mr: 1 }}
                      >
                        <RestoreIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        onClick={() => {
                          // Download backup file
                          toast.info('Download functionality would be implemented here');
                        }}
                        sx={{ mr: 1 }}
                      >
                        <DownloadIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        color="error"
                        onClick={() => {
                          // Delete backup
                          toast.info('Delete functionality would be implemented here');
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                  {index < backups.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
      </Paper>

      {/* Create Backup Dialog */}
      <Dialog open={createBackupDialog} onClose={() => setCreateBackupDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Database Backup</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            This will create a complete backup of your database including all collections, documents, and indexes.
          </Alert>
          <Typography variant="body2" color="text.secondary">
            The backup will be saved as a .vdb file that can be used to restore your database later.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateBackupDialog(false)}>Cancel</Button>
          <Button onClick={createBackup} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Create Backup'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Export Data Dialog */}
      <Dialog open={exportDialog} onClose={() => setExportDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Export Data</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mb: 2, mt: 1 }}>
            <InputLabel>Export Format</InputLabel>
            <Select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              label="Export Format"
            >
              <MenuItem value="json">JSON</MenuItem>
              <MenuItem value="csv">CSV (Coming Soon)</MenuItem>
              <MenuItem value="sql">SQL (Coming Soon)</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Collections</InputLabel>
            <Select
              multiple
              value={selectedCollections}
              onChange={(e) => setSelectedCollections(e.target.value)}
              label="Collections"
            >
              {collections.map((collection) => (
                <MenuItem key={collection.name} value={collection.name}>
                  {collection.name} ({collection.documentCount} documents)
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="body2" color="text.secondary">
            Leave collections empty to export all data.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialog(false)}>Cancel</Button>
          <Button onClick={exportData} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : 'Export'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Data Dialog */}
      <Dialog open={importDialog} onClose={() => setImportDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Data</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Importing data will add to existing collections. Duplicate documents may be created.
          </Alert>
          
          <Button
            variant="outlined"
            component="label"
            startIcon={<CloudUploadIcon />}
            fullWidth
            sx={{ mb: 2, mt: 1 }}
          >
            Select File to Import
            <input
              type="file"
              hidden
              accept=".json"
              onChange={(e) => setImportFile(e.target.files[0])}
            />
          </Button>

          {importFile && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Selected: {importFile.name} ({formatFileSize(importFile.size)})
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary">
            Supported formats: JSON (VerusDB export format)
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setImportDialog(false);
            setImportFile(null);
          }}>
            Cancel
          </Button>
          <Button onClick={handleImport} variant="contained" disabled={loading || !importFile}>
            {loading ? <CircularProgress size={20} /> : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore Dialog */}
      <Dialog open={restoreDialog} onClose={() => setRestoreDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Restore from Backup</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This will replace your current database with the backup. This action cannot be undone.
          </Alert>
          
          {selectedBackup && (
            <Box>
              <Typography variant="body1" gutterBottom>
                <strong>Backup:</strong> {selectedBackup.filename}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Created: {format(new Date(selectedBackup.created), 'PPpp')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Size: {formatFileSize(selectedBackup.size)}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreDialog(false)}>Cancel</Button>
          <Button 
            onClick={() => {
              toast.info('Restore functionality would be implemented here');
              setRestoreDialog(false);
            }} 
            variant="contained" 
            color="warning"
          >
            Restore Database
          </Button>
        </DialogActions>
      </Dialog>

      {loading && (
        <LinearProgress sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }} />
      )}
    </Box>
  );
}

export default BackupRestore;