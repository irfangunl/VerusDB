import React from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography } from '@mui/material';

function SchemaEditor() {
  const { name } = useParams();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Schema Editor: {name}
      </Typography>
      <Typography variant="body1">
        Schema editor component - will provide visual schema editing with drag-and-drop field management.
      </Typography>
    </Box>
  );
}

export default SchemaEditor;