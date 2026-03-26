const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const { authMiddleware } = require('../middleware/auth');
const axios = require('axios');

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8000';

// @route   GET /api/chat
// @desc    Get user chat history
router.get('/', authMiddleware, async (req, res) => {
  try {
    let chat = await Chat.findOne({ userId: req.user.id });
    if (!chat) {
      chat = new Chat({ userId: req.user.id, messages: [] });
      await chat.save();
    }
    res.json(chat);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/chat
// @desc    Send a message and get response
router.post('/', authMiddleware, async (req, res) => {
  const { content } = req.body;
  
  if (!content) return res.status(400).json({ message: 'Content is required' });

  try {
    let chat = await Chat.findOne({ userId: req.user.id });
    if (!chat) {
      chat = new Chat({ userId: req.user.id, messages: [] });
    }

    // Prepare chat history to send to Python, sending last 6 messages
    const recentMessages = chat.messages.slice(-6).map(m => ({
      role: m.role,
      content: m.content
    }));

    // Add user message to DB
    chat.messages.push({ role: 'user', content });
    await chat.save();

    // Query RAG microservice
    let aiResponse;
    try {
      const ragReq = await axios.post(`${RAG_SERVICE_URL}/query`, {
        query: content,
        chat_history: recentMessages
      });
      console.log('RAG Response:', ragReq.data);
      aiResponse = ragReq.data;
    } catch (err) {
      console.error('Error reaching RAG service:', err.message);
      aiResponse = { answer: "RAG Service is currently unavailable. Please try again later.", sources: [] };
    }

    // Add AI response to DB
    const assistantMessage = {
      role: 'assistant',
      content: aiResponse.answer,
      sources: aiResponse.sources || []
    };
    
    chat.messages.push(assistantMessage);
    await chat.save();

    // Return the newly created assistant message with its _id mapped for frontend
    const newMsg = chat.messages[chat.messages.length - 1];
    
    res.json(newMsg);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// @route   POST /api/chat/feedback/:messageId
// @desc    Provide feedback on a message
router.post('/feedback/:messageId', authMiddleware, async (req, res) => {
  const { feedback } = req.body; // 'like' or 'dislike'
  
  try {
    const chat = await Chat.findOne({ userId: req.user.id });
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    
    const message = chat.messages.id(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    message.feedback = feedback;
    await chat.save();

    res.json(message);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
