# AI-Powered RAG Chatbot

An enterprise-ready, production-grade Artificial Intelligence Chatbot powered by Retrieval-Augmented Generation (RAG).
This system ensures highly accurate, zero-hallucination answers strictly based on your private company data (PDF, JSON, Excel, CSV, Text).

## Architecture
- **Frontend**: React (Vite) + Tailwind CSS + Framer Motion + Three.js
- **Backend**: Node.js + Express + MongoDB
- **RAG Microservice**: Python (FastAPI + LangChain + FAISS + PyPDF + Pandas)

## Features
- **Strict RAG Answers:** Only answers from uploaded data, cites sources, zero hallucination.
- **Smart Context:** Multiturn conversation memory.
- **Role-Based Access:** Secures upload privileges to Admin users only.
- **Premium UI:** Glassmorphism, particles background, dark theme, fluid animations.
- **Multi-Format Ingestion:** Seamlessly chunks and embeds PDF, XML, JSON, CSV files.
- **Feedback Loop:** Built-in like/dislike recording for future enhancements.

## Setup Instructions

### 1. Prerequisites
- Docker & Docker Compose
- Node.js (for local dev)
- Python 3.10+ (for local dev)
- MongoDB (if not using docker)
- OpenAI API Key

### 2. Environment Variables
You need to configure your OpenAI API Key before running.
Rename `rag_service/.env.example` to `rag_service/.env` and insert your actual `OPENAI_API_KEY`:

```bash
cp rag_service/.env.example rag_service/.env
# Replace the file content with: OPENAI_API_KEY=sk-...
```

### 3. Running with Docker (Recommended)
This requires just a single command to spin up the entire application stack:

```bash
docker-compose up --build
```

The services will be available here:
- Frontend: `http://localhost:3000`
- API Backend: `http://localhost:5000`
- Python RAG AI Service: `http://localhost:8000`
- MongoDB: `mongodb://localhost:27017`

### 4. Running Locally without Docker

**Terminal 1 [Python Microservice]:**
```bash
cd rag_service
python -m venv venv
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python main.py
```

**Terminal 2 [Node.js Backend]:**
```bash
cd backend
npm install
# Set MONGO_URI in a .env file if it isn't running on localhost:27017
npm start
```

**Terminal 3 [React Frontend]:**
```bash
cd frontend
npm install
npm run dev
```

## How to use:
1. Register a new user with the role **"admin"** on the registration page.
2. Login and upload your corporate documents (PDF, text, excel) via the "Upload Document" button in the Sidebar.
3. Chat with the AI regarding the uploaded data.
4. If you ask out-of-bounds questions, it will gracefully respond with "Information not available in provided data".

## Security Note
This implementation uses a local filesystem-based FAISS index. The index directory `rag_service/faiss_index` will store the encoded vectorized data representation of documents. For a true highly distributed production setup, switch FAISS to Pinecone or managed PostgreSQL.
