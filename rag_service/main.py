import os
import io
import json
import uuid
import hashlib
import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_core.embeddings import Embeddings

load_dotenv()

app = FastAPI(title="RAG Microservice", description="Handles Document Ingestion and Querying via FAISS")

# Setup Paths and config
OPENAI_INDEX_DIR = "faiss_index"
LOCAL_INDEX_DIR = "faiss_index_local"
DATA_DIR = "data_uploads"
os.makedirs(OPENAI_INDEX_DIR, exist_ok=True)
os.makedirs(LOCAL_INDEX_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Try initializing LLM and Embeddings
llm = None
embeddings = None
vectorstore = None
ai_mode = "local"
active_index_dir = LOCAL_INDEX_DIR


class LocalHashEmbeddings(Embeddings):
    """Deterministic local embeddings so uploads work without external API keys."""

    def __init__(self, dim: int = 256):
        self.dim = dim

    def _embed(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        tokens = (text or "").lower().split()
        if not tokens:
            return vec
        for tok in tokens:
            h = int(hashlib.md5(tok.encode("utf-8", errors="ignore")).hexdigest(), 16)
            vec[h % self.dim] += 1.0
        norm = sum(v * v for v in vec) ** 0.5
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._embed(text)

def init_ai():
    global llm, embeddings, vectorstore, ai_mode, active_index_dir
    api_key = os.getenv("OPENAI_API_KEY")
    try:
        if api_key:
            ai_mode = "openai"
            active_index_dir = OPENAI_INDEX_DIR
            llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0, api_key=api_key)
            embeddings = OpenAIEmbeddings(api_key=api_key)
            if os.path.exists(os.path.join(active_index_dir, "index.faiss")):
                vectorstore = FAISS.load_local(active_index_dir, embeddings, allow_dangerous_deserialization=True)
                print("Loaded existing FAISS index.")
            else:
                vectorstore = None
                print("OpenAI mode enabled. No existing index yet; waiting for uploads.")
        else:
            ai_mode = "local"
            active_index_dir = LOCAL_INDEX_DIR
            llm = None
            embeddings = LocalHashEmbeddings(dim=256)
            if os.path.exists(os.path.join(active_index_dir, "index.faiss")):
                vectorstore = FAISS.load_local(active_index_dir, embeddings, allow_dangerous_deserialization=True)
                print("Loaded local fallback FAISS index.")
            else:
                vectorstore = None
                print("OPENAI_API_KEY not found. Running in local fallback mode.")
        return True
    except Exception as e:
        print(f"Error initializing AI components: {e}")
        return False

# Initialize at startup
init_ai()

@app.on_event("startup")
async def startup_event():
    init_ai()

@app.get("/status")
async def status():
    return {
        "status": "online",
        "ai_initialized": llm is not None,
        "vectorstore_ready": vectorstore is not None,
        "mode": ai_mode
    }

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not embeddings:
        success = init_ai()
        if not success:
            raise HTTPException(status_code=500, detail="AI components not initialized. Please ensure OPENAI_API_KEY is set.")
            
    filename = file.filename
    file_path = os.path.join(DATA_DIR, filename)
    with open(file_path, "wb") as f:
        f.write(await file.read())
        
    documents = []
    
    # Process based on extension
    ext = filename.split(".")[-1].lower()
    try:
        if ext == "pdf":
            loader = PyPDFLoader(file_path)
            docs = loader.load()
            for i, d in enumerate(docs):
                d.metadata["source"] = filename
                d.metadata["page"] = i + 1
            documents.extend(docs)
            
        elif ext in ["txt", "md", "markdown"]:
            # Using basic file read as TextLoader has encoding issues sometimes
            with open(file_path, "r", encoding="utf-8-sig", errors="ignore") as f:
                content = f.read()
            documents.append(Document(page_content=content, metadata={"source": filename, "page": 1}))
            
        elif ext == "json":
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Flatten or stringify json cleanly
            content = json.dumps(data, indent=2)
            documents.append(Document(page_content=content, metadata={"source": filename, "page": 1}))
            
        elif ext in ["xlsx", "xls", "csv"]:
            if ext == "csv":
                df = pd.read_csv(file_path)
            else:
                df = pd.read_excel(file_path)
            content = df.to_string()
            documents.append(Document(page_content=content, metadata={"source": filename, "page": 1}))
            
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
            
        # Chunking
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
        chunks = text_splitter.split_documents(documents)

        if not chunks:
            raise HTTPException(status_code=400, detail="No readable text content found in uploaded file.")
        
        # Add to vector store
        global vectorstore
        if vectorstore is None:
            vectorstore = FAISS.from_documents(chunks, embeddings)
        else:
            vectorstore.add_documents(chunks)
        vectorstore.save_local(active_index_dir)
        
        mode_hint = " (local fallback mode)" if ai_mode == "local" else ""
        return {"message": f"Successfully ingested {filename}{mode_hint}", "chunks": len(chunks), "mode": ai_mode}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class QueryRequest(BaseModel):
    query: str
    chat_history: Optional[List[dict]] = []

@app.post("/query")
async def query_endpoint(req: QueryRequest):
    if not embeddings:
        success = init_ai()
        if not success:
             raise HTTPException(status_code=500, detail="AI component missing api key")
             
    # Retrieve top chunks
    retriever = vectorstore.as_retriever(search_type="similarity", search_kwargs={"k": 4})
    retrieved_docs = retriever.invoke(req.query)
    
    # If no docs retrieved, return strict fallback.
    if not retrieved_docs:
        return {
            "answer": "Information not available in provided data",
            "sources": []
        }

    if llm is None:
        # Local fallback mode when OPENAI_API_KEY is unavailable.
        sources = []
        seen = set()
        for d in retrieved_docs:
            src = d.metadata.get("source", "Unknown")
            page = d.metadata.get("page", "N/A")
            key = f"{src}-page-{page}"
            if key not in seen:
                seen.add(key)
                sources.append({"source": src, "page": page})

        excerpt = "\n\n".join([d.page_content[:450] for d in retrieved_docs if d.page_content]).strip()
        if not excerpt:
            return {
                "answer": "Information not available in provided data",
                "sources": []
            }

        return {
            "answer": f"OPENAI_API_KEY is not configured, so this is a local excerpt-based answer:\n\n{excerpt}",
            "sources": sources
        }
        
    # Build strict prompt
    template = """You are a helpful AI chatbot. Your main goal is to answer the user's questions based ONLY on the provided context.
    If the answer is not found in the context, respond EXACTLY with: "Information not available in provided data"
    Do not use any external knowledge. Do not hallucinate.

    Context: {context}
    
    Previous Chat History: {chat_history}
    
    User Query: {query}
    
    Answer:"""
    
    prompt = ChatPromptTemplate.from_template(template)
    
    # Format chat history for context
    chat_history_str = ""
    for msg in req.chat_history:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        chat_history_str += f"{role}: {content}\n"
        
    context_str = "\n\n---\n\n".join([d.page_content for d in retrieved_docs])
    
    chain = prompt | llm | StrOutputParser()
    
    response = chain.invoke({
        "context": context_str,
        "chat_history": chat_history_str,
        "query": req.query
    })
    
    # Format sources and remove duplicates
    sources = []
    seen = set()
    for d in retrieved_docs:
        # Ignore our dummy doc
         if d.metadata.get("source") == "none":
             continue
         src = d.metadata.get("source", "Unknown")
         page = d.metadata.get("page", "N/A")
         key = f"{src}-page-{page}"
         if key not in seen:
             seen.add(key)
             sources.append({"source": src, "page": page})
             
    # Safety fallback
    if response.strip().lower() == "information not available in provided data" or response.strip().lower() == '"information not available in provided data"':
        sources = []
        response = "Information not available in provided data"
        
    return {
        "answer": response,
        "sources": sources
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
