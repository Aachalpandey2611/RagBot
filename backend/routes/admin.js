const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/auth');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8000';

const upload = multer({ dest: 'uploads/' });

// @route   POST /api/admin/upload
// @desc    Upload document for indexing
router.post('/upload', adminMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname
    });

    const response = await axios.post(`${RAG_SERVICE_URL}/upload`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });

    // Cleanup local temp file
    fs.unlinkSync(req.file.path);

    res.json({ message: 'File uploaded and indexed successfully', details: response.data });
  } catch (err) {
    console.error('Upload Error:', err.message);
    if (req.file) fs.unlinkSync(req.file.path); // cleanup anyway
    res.status(500).json({ message: 'Error uploading to RAG Service' });
  }
});

module.exports = router;
