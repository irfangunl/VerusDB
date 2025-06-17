import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Storage as StorageIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Code as SchemaIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import apiService from '../../services/apiService';

function Collections() {
  const navigate = useNavigate();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    // Only load data if we have a session
    if (apiService.hasValidSession()) {
      loadCollections();
    } else {
      setLoading(false);
    }
  }, []);

  const loadCollections = async () => {
    try {
      setLoading(true);
      const data = await apiService.getCollections();
      setCollections(data);
      setError(null);
    } catch (error) {
      console.error('Failed to load collections:', error);
      setError(error.message);
      toast.error('Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) {
      toast.error('Collection name is required');
      return;
    }

    try {
      await apiService.createCollection(newCollectionName.trim(), {}, []);
      toast.success('Collection created successfully');
      setCreateDialogOpen(false);
      setNewCollectionName('');
      loadCollections();
    } catch (error) {
      toast.error('Failed to create collection: ' + error.message);
    }
  };

  const handleDeleteCollection = async () => {
    if (!selectedCollection) return;

    try {
      await apiService.deleteCollection(selectedCollection.name);
      toast.success('Collection deleted successfully');
      setDeleteDialogOpen(false);
      setSelectedCollection(null);
      loadCollections();
    } catch (error) {
      toast.error('Failed to delete collection: ' + error.message);
    }
  };

  const handleMenuOpen = (event, collection) => {
    setMenuAnchor(event.currentTarget);
    setSelectedCollection(collection);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setSelectedCollection(null);
  };

  const handleViewCollection = (collection) => {
    navigate(`/collections/${collection.name}`);
    handleMenuClose();
  };

  const handleEditSchema = (collection) => {
    navigate(`/schema/${collection.name}`);
    handleMenuClose();
  };

  const handleDeleteClick = (collection) => {
    setSelectedCollection(collection);
    setDeleteDialogOpen(true);
    handleMenuClose();
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Collections
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Collections
        </Typography>
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Collections
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Create Collection
        </Button>
      </Box>

      {collections.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <StorageIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Collections Found
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Create your first collection to start storing data.
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
            >
              Create First Collection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={3}>
          {collections.map((collection) => (
            <Grid item xs={12} sm={6} md={4} key={collection.name}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        {collection.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {collection.documentCount} documents
                      </Typography>
                      <Box mt={1}>
                        <Chip
                          label={`${collection.indexes} indexes`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      </Box>
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, collection)}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </Box>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<ViewIcon />}
                    onClick={() => handleViewCollection(collection)}
                  >
                    View Data
                  </Button>
                  <Button
                    size="small"
                    startIcon={<SchemaIcon />}
                    onClick={() => handleEditSchema(collection)}
                  >
                    Schema
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleViewCollection(selectedCollection)}>
          <ViewIcon sx={{ mr: 1 }} />
          View Documents
        </MenuItem>
        <MenuItem onClick={() => handleEditSchema(selectedCollection)}>
          <EditIcon sx={{ mr: 1 }} />
          Edit Schema
        </MenuItem>
        <MenuItem 
          onClick={() => handleDeleteClick(selectedCollection)}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          Delete Collection
        </MenuItem>
      </Menu>

      {/* Create Collection Dialog */}
      <Dialog 
        open={createDialogOpen} 
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Create New Collection</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Collection Name"
            fullWidth
            variant="outlined"
            value={newCollectionName}
            onChange={(e) => setNewCollectionName(e.target.value)}
            placeholder="e.g., users, products, orders"
            helperText="Collection name should be descriptive and use lowercase with underscores"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreateCollection}
            variant="contained"
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Collection</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone. All documents and indexes in this collection will be permanently deleted.
          </Alert>
          <Typography>
            Are you sure you want to delete the collection{' '}
            <strong>{selectedCollection?.name}</strong>?
          </Typography>
          {selectedCollection && (
            <Box mt={2}>
              <Typography variant="body2" color="text.secondary">
                This collection contains {selectedCollection.documentCount} documents.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteCollection}
            variant="contained"
            color="error"
          >
            Delete Collection
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Collections;