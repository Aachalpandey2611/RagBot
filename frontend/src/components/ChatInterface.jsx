import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, Send, LogOut, CheckCircle, ThumbsUp, ThumbsDown, BookOpen, Loader2 } from 'lucide-react';
import axios from 'axios';

export default function ChatInterface({ auth, setAuth }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileMsg, setFileMsg] = useState('');
  const messagesEndRef = useRef(null);
  
  const token = auth.token;
  const isAdmin = auth.role === 'admin';

  // Axios instance
  const api = axios.create({
    baseURL: 'http://localhost:5000/api',
    headers: { Authorization: `Bearer ${token}` }
  });

  const fetchChat = async () => {
    try {
      const { data } = await api.get('/chat');
      setMessages(data.messages || []);
      scrollToBottom();
    } catch (err) {
      console.error(err);
      if(err.response?.status === 401) handleLogout();
    }
  };

  useEffect(() => {
    fetchChat();
    // Auto refresh every 10 seconds for real-time updates (Optional per requirements)
    const interval = setInterval(() => {
      fetchChat();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const userMessage = { _id: Date.now(), role: 'user', content: inputText };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setLoading(true);
    scrollToBottom();

    try {
      const { data } = await api.post('/chat', { content: userMessage.content });
      setMessages((prev) => [...prev.filter(m => m._id !== userMessage._id), userMessage, data]);
      scrollToBottom();
    } catch (err) {
      console.error(err);
      setMessages((prev) => [...prev, { _id: Date.now()+1, role: 'assistant', content: 'Connection error while processing query.', sources: [] }]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setFileMsg('');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post('/admin/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setFileMsg(`Success: ${data.message}`);
    } catch (err) {
      console.error(err);
      setFileMsg('Error uploading file');
    } finally {
      setUploading(false);
      e.target.value = null; // reset input
    }
  };

  const handleFeedback = async (msgId, type) => {
    try {
       await api.post(`/chat/feedback/${msgId}`, { feedback: type });
       // Update local state optimistic
       setMessages(prev => prev.map(m => m._id === msgId ? { ...m, feedback: type } : m));
    } catch (err) {
      console.error("Feedback failed", err);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    setAuth(null);
  };

  return (
    <div className="flex h-screen w-full relative">
      {/* Sidebar */}
      <motion.div 
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        className="w-72 glass m-4 flex flex-col hidden md:flex"
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
            Enterprise RAG
          </h1>
          <BookOpen className="text-indigo-400 w-5 h-5" />
        </div>
        
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="text-sm text-gray-400 mb-2 uppercase tracking-wider font-semibold">User Details</div>
          <div className="bg-white/5 p-3 rounded-lg mb-6">
            <span className="block text-white font-medium">{auth.username}</span>
            <span className="text-xs text-primary-400 uppercase bg-primary-900/40 px-2 py-0.5 rounded-full inline-block mt-1">
              Role: {auth.role}
            </span>
          </div>

          {isAdmin && (
            <div className="mb-6">
              <div className="text-sm text-gray-400 mb-2 uppercase tracking-wider font-semibold">Admin Panel</div>
              <label className="flex items-center justify-center gap-2 w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg cursor-pointer transition-all">
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
                <span className="text-sm font-medium text-gray-200">
                  {uploading ? 'Processing & Indexing...' : 'Upload Document'}
                </span>
                <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.txt,.json,.csv,.xlsx,.xls" />
              </label>
              {fileMsg && <div className="mt-2 text-xs text-green-400 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> {fileMsg}</div>}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors w-full p-2 rounded-lg hover:bg-white/5"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </motion.div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col p-4 pl-0 relative z-10 w-full">
        <div className="glass flex-1 flex flex-col overflow-hidden h-full relative">
          
          {/* Header Mobile */}
          <div className="md:hidden p-4 border-b border-white/10 flex justify-between items-center">
            <span className="font-bold">Enterprise RAG</span>
            <button onClick={handleLogout}><LogOut className="w-5 h-5" /></button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col gap-6">
            {messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <BookOpen className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-lg">Welcome to the inner knowledge-base.</p>
                <p className="text-sm opacity-50">Ask me anything about the uploaded documents.</p>
              </div>
            )}
            
            <AnimatePresence>
              {messages.map((msg, idx) => (
                <motion.div 
                  key={msg._id || idx}
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl ${
                    msg.role === 'user' 
                      ? 'bg-primary-600 text-white rounded-tr-sm' 
                      : 'bg-[#1c2128] border border-white/10 text-gray-200 rounded-tl-sm shadow-md'
                  }`}>
                    {msg.role === 'assistant' && <div className="text-xs text-primary-400 font-semibold mb-2 flex items-center gap-2">AI Assistant</div>}
                    
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed relative z-20">
                      {msg.content}
                    </div>

                    {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-white/10">
                        <div className="text-xs text-gray-400 mb-1">Sources:</div>
                        <div className="flex flex-wrap gap-2">
                          {msg.sources.map((s, i) => (
                            <span key={i} className="text-xs bg-dark-800/80 px-2 py-1 rounded-md text-gray-300 border border-white/5 cursor-default hover:border-white/20 transition-all select-all">
                              {s.source} {s.page !== 'N/A' && `(Page ${s.page})`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Feedback Buttons */}
                    {msg.role === 'assistant' && msg._id && (
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button onClick={() => handleFeedback(msg._id, 'like')} className={`p-1 rounded hover:bg-white/10 transition-colors ${msg.feedback === 'like' ? 'text-green-400' : 'text-gray-500'}`}>
                          <ThumbsUp className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleFeedback(msg._id, 'dislike')} className={`p-1 rounded hover:bg-white/10 transition-colors ${msg.feedback === 'dislike' ? 'text-red-400' : 'text-gray-500'}`}>
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                 <div className="bg-[#1c2128] border border-white/10 p-4 rounded-2xl rounded-tl-sm flex items-center gap-3">
                   <div className="flex gap-1">
                     <span className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                     <span className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                     <span className="w-2 h-2 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                   </div>
                   <span className="text-sm text-gray-400">Analyzing documents...</span>
                 </div>
              </motion.div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-white/10 bg-dark-900/50 backdrop-blur-md">
            <form onSubmit={handleSend} className="relative max-w-4xl mx-auto flex items-center gap-3">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask anything based on the documents..."
                className="w-full bg-[#1c2128] border border-white/10 rounded-xl pl-4 pr-12 py-3 text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 transition-all shadow-inner"
                disabled={loading}
              />
              <button 
                type="submit" 
                disabled={loading || !inputText.trim()}
                className="absolute right-2 p-2 bg-primary-600 hover:bg-primary-500 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="text-center mt-2 text-xs text-gray-500">
              Answers are generated exclusively from uploaded company data.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
