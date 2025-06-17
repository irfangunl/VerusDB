import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Switch,
  FormControlLabel,
  Button,
  TextField,
  Alert,
  Card,
  CardContent,
  Grid,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Palette as ThemeIcon,
  Storage as DatabaseIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import toast from 'react-hot-toast';
import apiService from '../../services/apiService';

function Settings() {
  const theme = useTheme();
  const [stats, setStats] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [showSystemInfo, setShowSystemInfo] = useState(false);
  const [changePasswordDialog, setChangePasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
    loadStats();
  }, []);

  const loadSettings = () => {
    // Load settings from localStorage
    const savedDarkMode = localStorage.getItem('verusdb_dark_mode') === 'true';
    const savedAutoRefresh = localStorage.getItem('verusdb_auto_refresh') === 'true';
    const savedRefreshInterval = parseInt(localStorage.getItem('verusdb_refresh_interval') || '30');
    
    setDarkMode(savedDarkMode);
    setAutoRefresh(savedAutoRefresh);
    setRefreshInterval(savedRefreshInterval);
  };

  const loadStats = async () => {
    try {
      const data = await apiService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const saveSettings = () => {
    localStorage.setItem('verusdb_dark_mode', darkMode);
    localStorage.setItem('verusdb_auto_refresh', autoRefresh);
    localStorage.setItem('verusdb_refresh_interval', refreshInterval);
    toast.success('Settings saved successfully');
  };

  const handleDarkModeChange = (event) => {
    setDarkMode(event.target.checked);
    // Note: In a real implementation, this would trigger a theme change
    toast.info('Theme changes will be applied in the next version');
  };

  const handleAutoRefreshChange = (event) => {
    setAutoRefresh(event.target.checked);
  };

  const changePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      // Note: This would need to be implemented in the API
      toast.info('Password change functionality will be implemented in the next version');
      setChangePasswordDialog(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error('Failed to change password: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const clearCache = () => {
    localStorage.removeItem('verusdb_query_history');
    toast.success('Query history cleared');
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        Configure your VerusDB admin panel preferences and database settings.
      </Typography>

      <Grid container spacing={3}>
        {/* Database Information */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <DatabaseIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Database Information
              </Typography>
              
              {stats ? (
                <List dense>
                  <ListItem>
                    <ListItemText 
                      primary="Database Path" 
                      secondary={stats.database?.path || 'Unknown'} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Database Size" 
                      secondary={formatFileSize(stats.database?.size)} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Collections" 
                      secondary={`${stats.collections?.count || 0} collections`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Indexes" 
                      secondary={`${stats.indexes?.count || 0} indexes`} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Encryption" 
                      secondary={
                        <Chip 
                          label={stats.database?.encrypted ? 'AES-256 Enabled' : 'Disabled'}
                          color={stats.database?.encrypted ? 'success' : 'error'}
                          size="small"
                        />
                      } 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Created" 
                      secondary={stats.database?.created ? new Date(stats.database.created).toLocaleString() : 'Unknown'} 
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText 
                      primary="Last Modified" 
                      secondary={stats.database?.modified ? new Date(stats.database.modified).toLocaleString() : 'Unknown'} 
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="Refresh">
                        <IconButton edge="end" onClick={loadStats}>
                          <RefreshIcon />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                </List>
              ) : (
                <Alert severity="info">Loading database information...</Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Security Settings */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Security Settings
              </Typography>
              
              <List>
                <ListItem>
                  <ListItemText 
                    primary="Admin Password" 
                    secondary="Change your admin panel password" 
                  />
                  <ListItemSecondaryAction>
                    <Button 
                      variant="outlined" 
                      size="small"
                      onClick={() => setChangePasswordDialog(true)}
                    >
                      Change
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Session Timeout" 
                    secondary="24 hours (cannot be changed)" 
                  />
                  <ListItemSecondaryAction>
                    <Chip label="24h" size="small" />
                  </ListItemSecondaryAction>
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Database Encryption" 
                    secondary="AES-256 encryption is enabled" 
                  />
                  <ListItemSecondaryAction>
                    <Chip label="Enabled" color="success" size="small" />
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Interface Settings */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <ThemeIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Interface Settings
              </Typography>
              
              <List>
                <ListItem>
                  <ListItemText 
                    primary="Dark Mode" 
                    secondary="Switch between light and dark theme" 
                  />
                  <ListItemSecondaryAction>
                    <FormControlLabel
                      control={
                        <Switch 
                          checked={darkMode} 
                          onChange={handleDarkModeChange}
                        />
                      }
                      label=""
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Auto Refresh" 
                    secondary="Automatically refresh data" 
                  />
                  <ListItemSecondaryAction>
                    <FormControlLabel
                      control={
                        <Switch 
                          checked={autoRefresh} 
                          onChange={handleAutoRefreshChange}
                        />
                      }
                      label=""
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Refresh Interval" 
                    secondary="How often to refresh data (seconds)" 
                  />
                  <ListItemSecondaryAction>
                    <TextField
                      type="number"
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 30)}
                      size="small"
                      sx={{ width: 80 }}
                      inputProps={{ min: 10, max: 300 }}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Save Settings" 
                    secondary="Apply and save current settings" 
                  />
                  <ListItemSecondaryAction>
                    <Button 
                      variant="contained" 
                      size="small"
                      onClick={saveSettings}
                    >
                      Save
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Application Settings */}
        <Grid item xs={12} lg={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <InfoIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Application Settings
              </Typography>
              
              <List>
                <ListItem>
                  <ListItemText 
                    primary="Clear Query History" 
                    secondary="Remove all saved query history" 
                  />
                  <ListItemSecondaryAction>
                    <Button 
                      variant="outlined" 
                      size="small"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={clearCache}
                    >
                      Clear
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="System Information" 
                    secondary="View detailed system information" 
                  />
                  <ListItemSecondaryAction>
                    <Button 
                      variant="outlined" 
                      size="small"
                      onClick={() => setShowSystemInfo(true)}
                    >
                      View
                    </Button>
                  </ListItemSecondaryAction>
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="VerusDB Version" 
                    secondary="v1.0.0" 
                  />
                  <ListItemSecondaryAction>
                    <Chip label="Latest" color="success" size="small" />
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        {/* Danger Zone */}
        <Grid item xs={12}>
          <Card sx={{ border: '1px solid', borderColor: 'error.main' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom color="error">
                <WarningIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Danger Zone
              </Typography>
              
              <Alert severity="warning" sx={{ mb: 2 }}>
                These actions are irreversible. Please be careful when using these features.
              </Alert>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={4}>
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    disabled
                  >
                    Reset Database
                  </Button>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    disabled
                  >
                    Clear All Data
                  </Button>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    disabled
                  >
                    Reset Settings
                  </Button>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordDialog} onClose={() => setChangePasswordDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Change Admin Password</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="New Password"
            type="password"
            fullWidth
            variant="outlined"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Confirm Password"
            type="password"
            fullWidth
            variant="outlined"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangePasswordDialog(false)}>Cancel</Button>
          <Button onClick={changePassword} variant="contained" disabled={loading}>
            Change Password
          </Button>
        </DialogActions>
      </Dialog>

      {/* System Information Dialog */}
      <Dialog open={showSystemInfo} onClose={() => setShowSystemInfo(false)} maxWidth="md" fullWidth>
        <DialogTitle>System Information</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" gutterBottom>
                Application
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText primary="Name" secondary="VerusDB Admin Panel" />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Version" secondary="1.0.0" />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Build" secondary="Production" />
                </ListItem>
              </List>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="subtitle2" gutterBottom>
                Browser
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText primary="User Agent" secondary={navigator.userAgent.split(' ')[0]} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Platform" secondary={navigator.platform} />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Language" secondary={navigator.language} />
                </ListItem>
              </List>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSystemInfo(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Settings;