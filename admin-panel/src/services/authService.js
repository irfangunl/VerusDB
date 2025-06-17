/**
 * Authentication Service for VerusDB Admin Panel
 * Handles login, logout, and password setup
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

export const checkAuthStatus = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/status`);
    
    if (!response.ok) {
      throw new Error('Failed to check auth status');
    }

    return await response.json();
  } catch (error) {
    console.error('Auth status check failed:', error);
    throw error;
  }
};

export const login = async (password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    return data;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
};

export const logout = async () => {
  try {
    const sessionId = localStorage.getItem('verusdb_session');
    
    const response = await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
      },
    });

    if (!response.ok) {
      throw new Error('Logout failed');
    }

    localStorage.removeItem('verusdb_session');
    return await response.json();
  } catch (error) {
    console.error('Logout failed:', error);
    throw error;
  }
};

export const setupPassword = async (password) => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/setup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Password setup failed');
    }

    return data;
  } catch (error) {
    console.error('Password setup failed:', error);
    throw error;
  }
};