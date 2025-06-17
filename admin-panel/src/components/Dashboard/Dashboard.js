import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  Alert,
} from '@mui/material';
import {
  Storage as StorageIcon,
  Security as SecurityIcon,
  Speed as SpeedIcon,
  Collections as CollectionsIcon,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import apiService from '../../services/apiService';
import toast from 'react-hot-toast';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Only load data if we have a session
    if (apiService.hasValidSession()) {
      loadDashboardData();
    } else {
      setLoading(false);
    }
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const [statsData, collectionsData] = await Promise.all([
        apiService.getStats(),
        apiService.getCollections()
      ]);

      setStats(statsData);
      setCollections(collectionsData);
      setError(null);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setError(error.message);
      toast.error('Failed to load dashboard data');
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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const getCollectionChartData = () => {
    return collections.map((collection, index) => ({
      name: collection.name,
      documents: collection.documentCount,
      fill: COLORS[index % COLORS.length]
    }));
  };

  if (loading) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Grid container spacing={3}>
        {/* Database Overview Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <StorageIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">Database Size</Typography>
              </Box>
              <Typography variant="h4" color="primary">
                {formatFileSize(stats?.database?.size || 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stats?.database?.path || 'N/A'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CollectionsIcon sx={{ mr: 1, color: 'success.main' }} />
                <Typography variant="h6">Collections</Typography>
              </Box>
              <Typography variant="h4" color="success.main">
                {stats?.collections?.count || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total collections
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <SpeedIcon sx={{ mr: 1, color: 'warning.main' }} />
                <Typography variant="h6">Indexes</Typography>
              </Box>
              <Typography variant="h4" color="warning.main">
                {stats?.indexes?.count || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total indexes
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <SecurityIcon sx={{ mr: 1, color: 'error.main' }} />
                <Typography variant="h6">Security</Typography>
              </Box>
              <Chip 
                label={stats?.database?.encrypted ? 'Encrypted' : 'Not Encrypted'}
                color={stats?.database?.encrypted ? 'success' : 'error'}
                sx={{ mb: 1 }}
              />
              <Typography variant="body2" color="text.secondary">
                AES-256 Encryption
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Database Information */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Database Information
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText 
                    primary="Database Path" 
                    secondary={stats?.database?.path || 'N/A'} 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Created" 
                    secondary={formatDate(stats?.database?.created)} 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Last Modified" 
                    secondary={formatDate(stats?.database?.modified)} 
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Encryption" 
                    secondary={
                      <Chip 
                        label={stats?.database?.encrypted ? 'AES-256 Enabled' : 'Disabled'}
                        color={stats?.database?.encrypted ? 'success' : 'error'}
                        size="small"
                      />
                    } 
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Collections Overview */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Collections Overview
              </Typography>
              {collections.length > 0 ? (
                <List dense>
                  {collections.slice(0, 5).map((collection) => (
                    <ListItem key={collection.name}>
                      <ListItemText
                        primary={collection.name}
                        secondary={`${collection.documentCount} documents, ${collection.indexes} indexes`}
                      />
                    </ListItem>
                  ))}
                  {collections.length > 5 && (
                    <ListItem>
                      <ListItemText
                        primary={`+${collections.length - 5} more collections`}
                        secondary="Click Collections to view all"
                      />
                    </ListItem>
                  )}
                </List>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No collections found. Create your first collection to get started.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Collection Distribution Chart */}
        {collections.length > 0 && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Document Distribution
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getCollectionChartData()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="documents"
                    >
                      {getCollectionChartData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Collection Statistics Bar Chart */}
        {collections.length > 0 && (
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Collection Statistics
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getCollectionChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="documents" fill="#1976d2" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Quick Actions */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Quick Start
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Welcome to VerusDB Admin Panel! Here are some things you can do:
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Chip label="Create your first collection" sx={{ mr: 1, mb: 1 }} />
              <Chip label="Import existing data" sx={{ mr: 1, mb: 1 }} />
              <Chip label="Run queries" sx={{ mr: 1, mb: 1 }} />
              <Chip label="Create backups" sx={{ mr: 1, mb: 1 }} />
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;