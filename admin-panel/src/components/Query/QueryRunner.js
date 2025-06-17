import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  PlayArrow as RunIcon,
  ExpandMore as ExpandMoreIcon,
  Clear as ClearIcon,
  History as HistoryIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import AceEditor from 'react-ace';
import ReactJsonView from 'react-json-view';
import toast from 'react-hot-toast';
import apiService from '../../services/apiService';

// Import ace editor modes and themes
import 'ace-builds/src-noconflict/mode-javascript';
import 'ace-builds/src-noconflict/theme-github';
import 'ace-builds/src-noconflict/theme-monokai';

const QUERY_EXAMPLES = {
  'Find All': '{}',
  'Find by ID': '{ "_id": "document_id_here" }',
  'Find by Field': '{ "fieldName": "value" }',
  'Greater Than': '{ "age": { "$gt": 18 } }',
  'Text Search': '{ "name": { "$regex": "john", "$options": "i" } }',
  'Range Query': '{ "age": { "$gte": 18, "$lte": 65 } }',
  'Array Contains': '{ "tags": { "$in": ["tag1", "tag2"] } }',
  'Complex Query': '{ "$and": [{ "active": true }, { "age": { "$gte": 21 } }] }'
};

const OPTIONS_EXAMPLES = {
  'Basic': '{}',
  'Sort Ascending': '{ "sort": { "createdAt": 1 } }',
  'Sort Descending': '{ "sort": { "createdAt": -1 } }',
  'Limit Results': '{ "limit": 10 }',
  'Skip Results': '{ "skip": 5 }',
  'Sort & Limit': '{ "sort": { "name": 1 }, "limit": 20 }'
};

function QueryRunner() {
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [query, setQuery] = useState('{}');
  const [options, setOptions] = useState('{}');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [executionTime, setExecutionTime] = useState('');
  const [resultCount, setResultCount] = useState(0);
  const [queryHistory, setQueryHistory] = useState([]);

  useEffect(() => {
    loadCollections();
    loadQueryHistory();
  }, []);

  const loadCollections = async () => {
    try {
      const data = await apiService.getCollections();
      setCollections(data);
      if (data.length > 0 && !selectedCollection) {
        setSelectedCollection(data[0].name);
      }
    } catch (error) {
      console.error('Failed to load collections:', error);
      toast.error('Failed to load collections');
    }
  };

  const loadQueryHistory = () => {
    const history = localStorage.getItem('verusdb_query_history');
    if (history) {
      try {
        setQueryHistory(JSON.parse(history));
      } catch (error) {
        console.error('Failed to load query history:', error);
      }
    }
  };

  const saveQueryHistory = (newQuery) => {
    const history = [newQuery, ...queryHistory.slice(0, 9)]; // Keep only last 10
    setQueryHistory(history);
    localStorage.setItem('verusdb_query_history', JSON.stringify(history));
  };

  const runQuery = async () => {
    if (!selectedCollection) {
      toast.error('Please select a collection');
      return;
    }

    try {
      setLoading(true);
      setError('');

      let parsedQuery, parsedOptions;
      
      try {
        parsedQuery = JSON.parse(query);
      } catch (err) {
        throw new Error('Invalid JSON in query field');
      }

      try {
        parsedOptions = JSON.parse(options);
      } catch (err) {
        throw new Error('Invalid JSON in options field');
      }

      const startTime = Date.now();
      const response = await apiService.runQuery(selectedCollection, parsedQuery, parsedOptions);
      const endTime = Date.now();

      setResults(response.results);
      setExecutionTime(`${endTime - startTime}ms`);
      setResultCount(response.results?.length || 0);

      // Save to history
      const historyItem = {
        collection: selectedCollection,
        query,
        options,
        timestamp: new Date().toISOString(),
        resultCount: response.results?.length || 0,
        executionTime: `${endTime - startTime}ms`
      };
      saveQueryHistory(historyItem);

      toast.success(`Query executed successfully in ${endTime - startTime}ms`);
    } catch (error) {
      setError(error.message);
      setResults(null);
      toast.error('Query failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const clearQuery = () => {
    setQuery('{}');
    setOptions('{}');
    setResults(null);
    setError('');
    setExecutionTime('');
    setResultCount(0);
  };

  const loadQueryExample = (exampleQuery) => {
    setQuery(exampleQuery);
  };

  const loadOptionsExample = (exampleOptions) => {
    setOptions(exampleOptions);
  };

  const loadFromHistory = (historyItem) => {
    setSelectedCollection(historyItem.collection);
    setQuery(historyItem.query);
    setOptions(historyItem.options);
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Query Runner
      </Typography>
      
      <Typography variant="body1" color="text.secondary" paragraph>
        Execute MongoDB-style queries against your collections with live results and performance metrics.
      </Typography>

      {/* Collection Selection */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Collection & Query
        </Typography>
        
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Select Collection</InputLabel>
          <Select
            value={selectedCollection}
            onChange={(e) => setSelectedCollection(e.target.value)}
            label="Select Collection"
          >
            {collections.map((collection) => (
              <MenuItem key={collection.name} value={collection.name}>
                {collection.name} ({collection.documentCount} documents)
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Query Editor */}
        <Box sx={{ mb: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
            <Typography variant="subtitle1">
              Query (MongoDB syntax)
            </Typography>
            <Box>
              <Button
                size="small"
                startIcon={<ClearIcon />}
                onClick={clearQuery}
                sx={{ mr: 1 }}
              >
                Clear
              </Button>
              <Button
                variant="contained"
                startIcon={<RunIcon />}
                onClick={runQuery}
                disabled={loading || !selectedCollection}
              >
                {loading ? <CircularProgress size={20} /> : 'Run Query'}
              </Button>
            </Box>
          </Box>
          
          <AceEditor
            mode="javascript"
            theme="github"
            name="query-editor"
            value={query}
            onChange={setQuery}
            width="100%"
            height="150px"
            fontSize={14}
            showPrintMargin={false}
            showGutter={true}
            highlightActiveLine={true}
            setOptions={{
              enableBasicAutocompletion: true,
              enableLiveAutocompletion: true,
              enableSnippets: true,
              showLineNumbers: true,
              tabSize: 2,
            }}
          />
        </Box>

        {/* Options Editor */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            Options (sort, limit, skip)
          </Typography>
          
          <AceEditor
            mode="javascript"
            theme="github"
            name="options-editor"
            value={options}
            onChange={setOptions}
            width="100%"
            height="100px"
            fontSize={14}
            showPrintMargin={false}
            showGutter={true}
            highlightActiveLine={true}
            setOptions={{
              enableBasicAutocompletion: true,
              enableLiveAutocompletion: true,
              enableSnippets: true,
              showLineNumbers: true,
              tabSize: 2,
            }}
          />
        </Box>

        {/* Execution Info */}
        {(results || error) && (
          <Box display="flex" gap={2} mb={2}>
            {executionTime && (
              <Chip 
                label={`Execution Time: ${executionTime}`} 
                color="info" 
                size="small" 
              />
            )}
            {resultCount > 0 && (
              <Chip 
                label={`Results: ${resultCount}`} 
                color="success" 
                size="small" 
              />
            )}
          </Box>
        )}

        {/* Error Display */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {/* Query Examples */}
      <Accordion sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6">Query Examples</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box display="flex" flexWrap="wrap" gap={1} mb={2}>
            {Object.entries(QUERY_EXAMPLES).map(([name, example]) => (
              <Button
                key={name}
                variant="outlined"
                size="small"
                onClick={() => loadQueryExample(example)}
              >
                {name}
              </Button>
            ))}
          </Box>
          <Typography variant="subtitle2" gutterBottom>
            Options Examples:
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1}>
            {Object.entries(OPTIONS_EXAMPLES).map(([name, example]) => (
              <Button
                key={name}
                variant="outlined"
                size="small"
                onClick={() => loadOptionsExample(example)}
              >
                {name}
              </Button>
            ))}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Query History */}
      {queryHistory.length > 0 && (
        <Accordion sx={{ mb: 3 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">
              <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              Query History
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box>
              {queryHistory.map((item, index) => (
                <Paper 
                  key={index} 
                  variant="outlined" 
                  sx={{ p: 2, mb: 1, cursor: 'pointer' }}
                  onClick={() => loadFromHistory(item)}
                >
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        {item.collection}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(item.timestamp).toLocaleString()}
                      </Typography>
                    </Box>
                    <Box display="flex" gap={1}>
                      <Chip label={item.resultCount + ' results'} size="small" />
                      <Chip label={item.executionTime} size="small" color="info" />
                    </Box>
                  </Box>
                  <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace' }}>
                    {item.query.length > 100 ? item.query.substring(0, 100) + '...' : item.query}
                  </Typography>
                </Paper>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Results Display */}
      {results && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Query Results
          </Typography>
          
          {results.length === 0 ? (
            <Alert severity="info">
              No documents found matching your query.
            </Alert>
          ) : (
            <Box>
              <ReactJsonView
                src={results}
                theme="bright"
                style={{ fontSize: 14 }}
                displayDataTypes={false}
                displayObjectSize={true}
                enableClipboard={true}
                name="results"
                collapsed={results.length > 5 ? 2 : false}
              />
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
}

export default QueryRunner;