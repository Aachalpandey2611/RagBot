import os
import io
import json
import uuid
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

load_dotenv()

app = FastAPI(title="RAG Microservice", description="Handles Document Ingestion and Querying via FAISS")

# Setup Paths and config
INDEX_DIR = "faiss_index"
DATA_DIR = "data_uploads"
os.makedirs(INDEX_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Try initializing LLM and Embeddings
llm = None
embeddings = None
vectorstore = None

def init_ai():
    global llm, embeddings, vectorstore
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY not found. Waiting for it to be provided.")
        return False
    try:
        if llm is None:
            llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0, api_key=api_key)
            embeddings = OpenAIEmbeddings(api_key=api_key)
            
            # Load existing FAISS index if available
            if os.path.exists(os.path.join(INDEX_DIR, "index.faiss")):
                vectorstore = FAISS.load_local(INDEX_DIR, embeddings, allow_dangerous_deserialization=True)
                print("Loaded existing FAISS index.")
            else:
                # Create empty vectorstore gracefully by creating a dummy doc then deleting it, or initialize empty
                dummy_doc = Document(page_content="initialization dummy document", metadata={"source": "none"})
                vectorstore = FAISS.from_documents([dummy_doc], embeddings)
                print("Created new FAISS index.")
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
        "vectorstore_ready": vectorstore is not None
    }

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not vectorstore:
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
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
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
        
        # Add to vector store
        vectorstore.add_documents(chunks)
        vectorstore.save_local(INDEX_DIR)
        
        return {"message": f"Successfully ingested {filename}", "chunks": len(chunks)}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class QueryRequest(BaseModel):
    query: str
    chat_history: Optional[List[dict]] = []

@app.post("/query")
async def query_endpoint(req: QueryRequest):
    if not vectorstore:
        success = init_ai()
        if not success:
             raise HTTPException(status_code=500, detail="AI component missing api key")
             
    # Retrieve top chunks
    retriever = vectorstore.as_retriever(search_type="similarity", search_kwargs={"k": 4})
    retrieved_docs = retriever.invoke(req.query)
    
    # If no docs retrieved from the dummy or real index, it should return not available
    if not retrieved_docs or (len(retrieved_docs) == 1 and retrieved_docs[0].metadata.get("source") == "none"):
        return {
            "answer": "Information not available in provided data",
            "sources": []
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
