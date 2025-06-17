import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Alert,
  CircularProgress,
  Menu,
  MenuItem,
  Fab,
  Tooltip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  MoreVert as MoreVertIcon,
  Refresh as RefreshIcon,
  FileDownload as ExportIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import ReactJsonView from 'react-json-view';
import toast from 'react-hot-toast';
import apiService from '../../services/apiService';

function CollectionView() {
  const { name } = useParams();
  const navigate = useNavigate();
  
  const [documents, setDocuments] = useState([]);
  const [schema, setSchema] = useState({});
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [editDialog, setEditDialog] = useState(false);
  const [addDialog, setAddDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [editData, setEditData] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [menuAnchor, setMenuAnchor] = useState(null);

  useEffect(() => {
    loadData();
    loadSchema();
  }, [name, page, pageSize, searchQuery]);

  const loadData = async () => {
    try {
      setLoading(true);
      const filter = searchQuery ? { 
        $or: [
          { _id: { $regex: searchQuery, $options: 'i' } },
          // Add other searchable fields based on schema
        ]
      } : {};

      const response = await apiService.getDocuments(name, {
        page: page + 1,
        limit: pageSize,
        filter: Object.keys(filter).length > 0 ? filter : undefined
      });

      setDocuments(response.documents || []);
      setTotal(response.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast.error('Failed to load documents: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSchema = async () => {
    try {
      const response = await apiService.getSchema(name);
      setSchema(response.schema || {});
    } catch (error) {
      console.error('Failed to load schema:', error);
    }
  };

  const handleAddDocument = () => {
    setEditData({});
    setAddDialog(true);
  };

  const handleEditDocument = (doc) => {
    setSelectedDocument(doc);
    setEditData({ ...doc });
    setEditDialog(true);
    setMenuAnchor(null);
  };

  const handleDeleteDocument = (doc) => {
    setSelectedDocument(doc);
    setDeleteDialog(true);
    setMenuAnchor(null);
  };

  const saveDocument = async () => {
    try {
      if (selectedDocument) {
        // Update existing document
        await apiService.updateDocument(name, selectedDocument._id, editData);
        toast.success('Document updated successfully');
      } else {
        // Create new document
        await apiService.insertDocument(name, editData);
        toast.success('Document created successfully');
      }
      
      setEditDialog(false);
      setAddDialog(false);
      setEditData({});
      setSelectedDocument(null);
      loadData();
    } catch (error) {
      toast.error('Failed to save document: ' + error.message);
    }
  };

  const confirmDelete = async () => {
    try {
      await apiService.deleteDocument(name, selectedDocument._id);
      toast.success('Document deleted successfully');
      setDeleteDialog(false);
      setSelectedDocument(null);
      loadData();
    } catch (error) {
      toast.error('Failed to delete document: ' + error.message);
    }
  };

  const exportData = async () => {
    try {
      const response = await apiService.exportData({
        format: 'json',
        collections: [name]
      });
      
      const blob = new Blob([JSON.stringify(response, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast.success('Data exported successfully');
    } catch (error) {
      toast.error('Failed to export data: ' + error.message);
    }
  };

  const getColumns = () => {
    if (documents.length === 0) return [];

    // Get all unique keys from documents
    const allKeys = new Set();
    documents.forEach(doc => {
      Object.keys(doc).forEach(key => allKeys.add(key));
    });

    return Array.from(allKeys).map(key => ({
      field: key,
      headerName: key.charAt(0).toUpperCase() + key.slice(1),
      width: key === '_id' ? 200 : 150,
      flex: key === '_id' ? 0 : 1,
      renderCell: (params) => {
        const value = params.value;
        if (typeof value === 'object' && value !== null) {
          return (
            <Chip 
              label={Array.isArray(value) ? `Array(${value.length})` : 'Object'} 
              size="small"
              variant="outlined"
            />
          );
        }
        if (typeof value === 'boolean') {
          return <Chip label={value ? 'true' : 'false'} size="small" color={value ? 'success' : 'default'} />;
        }
        if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)))) {
          try {
            return new Date(value).toLocaleString();
          } catch {
            return String(value);
          }
        }
        return String(value || '');
      }
    }));
  };

  const rows = documents.map((doc, index) => ({
    id: doc._id || index,
    ...doc
  }));

  if (loading && documents.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            {name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {total} documents
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <TextField
            size="small"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
            sx={{ width: 250 }}
          />
          <Button
            variant="outlined"
            startIcon={<ExportIcon />}
            onClick={exportData}
          >
            Export
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadData}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddDocument}
          >
            Add Document
          </Button>
        </Box>
      </Box>

      {/* Data Grid */}
      <Paper>
        <DataGrid
          rows={rows}
          columns={[
            ...getColumns(),
            {
              field: 'actions',
              headerName: 'Actions',
              width: 120,
              sortable: false,
              renderCell: (params) => (
                <Box>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      setMenuAnchor(e.currentTarget);
                      setSelectedDocument(params.row);
                    }}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </Box>
              )
            }
          ]}
          pageSize={pageSize}
          rowsPerPageOptions={[10, 25, 50, 100]}
          pagination
          paginationMode="server"
          rowCount={total}
          page={page}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          loading={loading}
          disableSelectionOnClick
          autoHeight
          sx={{ minHeight: 400 }}
        />
      </Paper>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={() => handleEditDocument(selectedDocument)}>
          <EditIcon sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem 
          onClick={() => handleDeleteDocument(selectedDocument)}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Add/Edit Dialog */}
      <Dialog 
        open={editDialog || addDialog} 
        onClose={() => {
          setEditDialog(false);
          setAddDialog(false);
          setEditData({});
          setSelectedDocument(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedDocument ? 'Edit Document' : 'Add New Document'}
        </DialogTitle>
        <DialogContent>
          <Box mt={2}>
            <Typography variant="subtitle1" gutterBottom>
              JSON Editor
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, minHeight: 300 }}>
              <ReactJsonView
                src={editData}
                onEdit={(edit) => {
                  setEditData(edit.updated_src);
                }}
                onAdd={(add) => {
                  setEditData(add.updated_src);
                }}
                onDelete={(del) => {
                  setEditData(del.updated_src);
                }}
                theme="bright"
                style={{ fontSize: 14 }}
                displayDataTypes={false}
                displayObjectSize={false}
                enableClipboard={false}
                name="document"
              />
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setEditDialog(false);
              setAddDialog(false);
              setEditData({});
              setSelectedDocument(null);
            }}
          >
            Cancel
          </Button>
          <Button onClick={saveDocument} variant="contained">
            {selectedDocument ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog}
        onClose={() => setDeleteDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Document</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone.
          </Alert>
          <Typography>
            Are you sure you want to delete this document?
          </Typography>
          {selectedDocument && (
            <Box mt={2}>
              <Typography variant="body2" color="text.secondary">
                Document ID: {selectedDocument._id}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>
            Cancel
          </Button>
          <Button onClick={confirmDelete} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Floating Action Button for mobile */}
      <Fab
        color="primary"
        sx={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          display: { xs: 'flex', md: 'none' }
        }}
        onClick={handleAddDocument}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}

export default CollectionView;