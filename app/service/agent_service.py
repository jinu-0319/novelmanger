from typing import List, Dict, Any
from app.service.vector_service import VectorService
from app.core.llm import get_llm


class AgentService:
    def __init__(self, vector_service: VectorService):
        self.llm = get_llm(temperature=0.3)
        self.vector_service = vector_service

    def process_query(self, query: str, context_limit: int = 3) -> Dict[str, Any]:
        # Step 1: Retrieve relevant documents using vector search
        search_results = self.vector_service.search(query, n_results=context_limit)

        # Step 2: Prepare context from retrieved documents
        context = self._prepare_context(search_results)

        # Step 3: Generate response using Gemini LLM
        response = self._generate_response(query, context)

        return {
            "query": query,
            "response": response,
            "retrieved_documents": search_results["documents"],
            "document_distances": search_results["distances"],
            "context_used": context
        }

    def _prepare_context(self, search_results: Dict[str, Any]) -> str:
        documents = search_results["documents"]
        metadatas = search_results["metadatas"]

        context_parts = []
        for i, doc in enumerate(documents):
            metadata = metadatas[i] if metadatas else {}
            context_part = f"Document {i+1}:\n{doc}\n"
            if metadata:
                context_part += f"Metadata: {metadata}\n"
            context_parts.append(context_part)

        return "\n".join(context_parts)

    def _generate_response(self, query: str, context: str) -> str:
        from langchain_core.messages import SystemMessage, HumanMessage

        system_prompt = """You are a helpful AI assistant. Use the provided context to answer the user's question accurately and concisely.
        If the context doesn't contain enough information to answer the question, say so clearly."""

        user_prompt = f"""Context:
{context}

Question: {query}

Please provide a helpful response based on the context above."""

        try:
            response = self.llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt),
            ])
            return response.content
        except Exception as e:
            return f"Error generating response: {str(e)}"

    def add_knowledge(self, documents: List[str], metadatas: List[Dict[str, Any]] = None) -> Dict[str, str]:
        try:
            self.vector_service.add_documents(documents, metadatas)
            return {"status": "success", "message": f"Added {len(documents)} documents to knowledge base"}
        except Exception as e:
            return {"status": "error", "message": f"Failed to add documents: {str(e)}"}

    def get_knowledge_stats(self) -> Dict[str, Any]:
        return self.vector_service.get_collection_info()
