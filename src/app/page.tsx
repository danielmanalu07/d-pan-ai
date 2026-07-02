'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatWindow from '@/components/ChatWindow';
import { 
  getSessions, 
  createSession, 
  deleteSession, 
  clearAllSessions, 
  getMessages, 
  addMessage, 
  updateSessionTitle,
  updateSessionModel,
  updateMessage,
  ChatSession, 
  ChatMessage,
  AttachedFile
} from '@/utils/db';
import { chunkText, fetchEmbeddings, retrieveRelevantContext, ChunkWithEmbedding } from '@/utils/rag';

const DEFAULT_MODEL = 'gemini/gemini-2.5-flash';
const DEFAULT_MODELS_FALLBACK = [
  { id: 'gemini/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { id: 'gemini/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
];

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [models, setModels] = useState<Array<{ id: string; name: string }>>(DEFAULT_MODELS_FALLBACK);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 1. Fetch available models from API on mount
  useEffect(() => {
    async function fetchModels() {
      try {
        const response = await fetch('/api/models');
        if (!response.ok) throw new Error('Failed to fetch models');
        
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          // Format, filter, & map to basic structure
          const formatted = data.data
            .filter((m: any) => {
              const id = m.id.toLowerCase();
              return !id.startsWith('gc/') && !id.startsWith('gc');
            })
            .map((m: any) => {
              const displayName = m.name || m.id;
              const cleanName = displayName.replace(/^gemini\//i, '');
              return {
                id: m.id,
                name: cleanName,
              };
            })
            // Sort models alphabetically
            .sort((a: any, b: any) => a.name.localeCompare(b.name));

          setModels(formatted);

          // Select the first valid non-disabled Gemini chat model from endpoint
          const firstGeminiChatModel = formatted.find((m: any) => {
            const id = m.id.toLowerCase();
            const name = m.name.toLowerCase();
            const isEmbedding = id.includes('embed');
            const isImage = id.includes('image');
            const isPro = id.includes('pro') || name.includes('pro');
            const isGemini = id.includes('gemini') || id.includes('gemma');
            return isGemini && !isEmbedding && !isImage && !isPro;
          });

          if (firstGeminiChatModel) {
            setSelectedModel(prev => {
              const hasStored = typeof window !== 'undefined' && localStorage.getItem('d_pan_ai_default_model');
              if (hasStored) return prev;
              return firstGeminiChatModel.id;
            });
          }
        }
      } catch (err) {
        console.warn('Using default models fallback. Error fetching models:', err);
        // Fallback models are already in state
      }
    }
    fetchModels();
  }, []);

  // 2. Load sessions from IndexedDB on mount
  useEffect(() => {
    async function loadSessions() {
      try {
        const list = await getSessions();
        setSessions(list);
        
        // Load default model from localStorage if available
        if (typeof window !== 'undefined') {
          const storedModel = localStorage.getItem('d_pan_ai_default_model');
          if (storedModel) {
            setSelectedModel(storedModel);
          }
        }

        if (list.length > 0) {
          setActiveSessionId(list[0].id);
          setSelectedModel(list[0].model);
        } else {
          // Create initial empty session
          const storedModel = typeof window !== 'undefined' ? localStorage.getItem('d_pan_ai_default_model') : null;
          const initialModel = storedModel || DEFAULT_MODEL;
          const newSession = await createSession(initialModel, 'New Chat');
          setSessions([newSession]);
          setActiveSessionId(newSession.id);
          setSelectedModel(initialModel);
        }
      } catch (err) {
        console.error('Error initializing sessions:', err);
      }
    }
    loadSessions();
  }, []);

  // 3. Load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }

    async function loadMessages() {
      try {
        const list = await getMessages(activeSessionId!);
        setMessages(list);

        // Sync model selection with active session's model
        const currentSession = sessions.find(s => s.id === activeSessionId);
        if (currentSession) {
          setSelectedModel(currentSession.model);
        }
      } catch (err) {
        console.error('Error loading messages:', err);
      }
    }
    loadMessages();
  }, [activeSessionId]);

  // Handle creating a new chat session
  const handleCreateSession = async (model: string) => {
    try {
      const newSession = await createSession(model, 'New Chat');
      setSessions(prev => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      setSelectedModel(model);
    } catch (err) {
      console.error('Error creating session:', err);
    }
  };

  // Handle selecting a chat session
  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    const session = sessions.find(s => s.id === id);
    if (session) {
      setSelectedModel(session.model);
    }
  };

  // Handle deleting a single session
  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSession(id);
      const remaining = sessions.filter(s => s.id !== id);
      setSessions(remaining);

      if (activeSessionId === id) {
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
        } else {
          const newSession = await createSession(selectedModel, 'New Chat');
          setSessions([newSession]);
          setActiveSessionId(newSession.id);
        }
      }
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  // Handle clearing all chat sessions
  const handleClearAll = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus semua history chat? Tindakan ini tidak dapat dibatalkan.')) return;
    try {
      await clearAllSessions();
      const newSession = await createSession(selectedModel, 'New Chat');
      setSessions([newSession]);
      setActiveSessionId(newSession.id);
    } catch (err) {
      console.error('Error clearing sessions:', err);
    }
  };

  // Handle model change (and sync to DB for active session)
  const handleSelectModel = async (modelId: string) => {
    setSelectedModel(modelId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('d_pan_ai_default_model', modelId);
    }

    if (activeSessionId) {
      try {
        await updateSessionModel(activeSessionId, modelId);
        setSessions(prev => 
          prev.map(s => s.id === activeSessionId ? { ...s, model: modelId } : s)
        );
      } catch (err) {
        console.error('Error updating session model:', err);
      }
    }
  };

  // Send message and get streamed AI response
  const handleSendMessage = async (content: string, images?: string[], files?: AttachedFile[], requestAudio = false) => {
    if (!activeSessionId) return;

    setIsGenerating(true);
    const sessionId = activeSessionId;

    try {
      // 1. Add user message to IndexedDB and State
      const userMsg = await addMessage(sessionId, 'user', content, images, files);
      setMessages(prev => [...prev, userMsg]);

      // 2. Auto-generate / update title if first message
      if (messages.length === 0) {
        const title = content.trim().slice(0, 30) || (files && files.length > 0 ? files[0].name : 'Document Attachment');
        const formattedTitle = title.length >= 30 ? `${title}...` : title;
        await updateSessionTitle(sessionId, formattedTitle);
        setSessions(prev => 
          prev.map(s => s.id === sessionId ? { ...s, title: formattedTitle } : s)
        );
      }

      // 3. RAG pipeline for handling large text-based document attachments
      // Gather all text files in the session (past messages + new files)
      const sessionTextFiles: AttachedFile[] = [];
      messages.forEach(m => {
        if (m.files) {
          m.files.forEach(f => {
            if (!f.type.startsWith('image/') && !f.type.startsWith('audio/') && !f.type.startsWith('video/') && f.textContent) {
              if (!sessionTextFiles.some(existing => existing.name === f.name && existing.size === f.size)) {
                sessionTextFiles.push(f);
              }
            }
          });
        }
      });
      if (files) {
        files.forEach(f => {
          if (!f.type.startsWith('image/') && !f.type.startsWith('audio/') && !f.type.startsWith('video/') && f.textContent) {
            if (!sessionTextFiles.some(existing => existing.name === f.name && existing.size === f.size)) {
              sessionTextFiles.push(f);
            }
          }
        });
      }

      const totalTextLength = sessionTextFiles.reduce((sum, f) => sum + (f.textContent?.length || 0), 0);
      const useRAG = totalTextLength > 6000;

      let retrievedContext = '';
      if (useRAG) {
        console.log(`[RAG] Total session text content is ${totalTextLength} chars. Performing RAG with query: "${content}"`);
        const allChunks: { text: string; fileName: string }[] = [];
        sessionTextFiles.forEach(f => {
          if (f.textContent) {
            const chunks = chunkText(f.textContent, 1000, 200);
            chunks.forEach(chunk => {
              allChunks.push({
                text: `=== FILE: ${f.name} ===\n${chunk}`,
                fileName: f.name
              });
            });
          }
        });

        try {
          // Fetch embeddings in batches of 30
          const chunkTexts = allChunks.map(c => c.text);
          const embeddings: number[][] = [];
          const batchSize = 30;
          for (let i = 0; i < chunkTexts.length; i += batchSize) {
            const batch = chunkTexts.slice(i, i + batchSize);
            const batchEmbeddings = await fetchEmbeddings(batch);
            embeddings.push(...batchEmbeddings);
          }

          // Map chunks to embeddings
          const chunksWithEmbeddings: ChunkWithEmbedding[] = allChunks.map((chunk, idx) => ({
            text: chunk.text,
            embedding: embeddings[idx]
          }));

          // Retrieve relevant chunks matching query
          retrievedContext = await retrieveRelevantContext(content, chunksWithEmbeddings, 5);
        } catch (ragErr) {
          console.error('[RAG] Failed to run RAG context selection:', ragErr);
        }
      }

      // 4. Prepare messages for API request payload
      const chatHistory = [...messages, userMsg];
      const apiMessages = chatHistory.map((msg, index) => {
        const isCurrentMessage = index === chatHistory.length - 1;

        if (msg.role === 'user') {
          let textVal = msg.content;

          if (useRAG) {
            // For RAG mode: inject the retrieved context ONLY in the current user prompt payload
            if (isCurrentMessage && retrievedContext) {
              textVal += `\n\n---\n[Konteks Dokumen Relevan (Hasil Pencarian RAG)]:\n${retrievedContext}`;
            }
          } else {
            // For non-RAG mode: append text files of this message
            const msgFiles = isCurrentMessage ? (files || []) : (msg.files || []);
            const textFiles = msgFiles.filter(f => !f.type.startsWith('image/') && !f.type.startsWith('audio/') && !f.type.startsWith('video/') && f.textContent);
            if (textFiles.length > 0) {
              textVal += "\n\n---\n[Lampiran Dokumen]:";
              textFiles.forEach(f => {
                textVal += `\n\n=== NAMA FILE: ${f.name} ===\n${f.textContent}\n======================`;
              });
            }
          }

          // Gather image files for multimodal input
          const msgFiles = isCurrentMessage ? (files || []) : (msg.files || []);
          const imageFiles = msgFiles.filter(f => f.type.startsWith('image/'));

          if (imageFiles.length === 0) {
            return {
              role: 'user',
              content: textVal
            };
          }

          const contentItems: any[] = [{ type: 'text', text: textVal }];
          imageFiles.forEach(f => {
            contentItems.push({
              type: 'image_url',
              image_url: { url: f.content }
            });
          });

          return {
            role: 'user',
            content: contentItems
          };
        }

        return {
          role: msg.role,
          content: msg.content
        };
      });

      // 5. Create placeholder AI message in IndexedDB/State
      const assistantMsg = await addMessage(sessionId, 'assistant', '');
      setMessages(prev => [...prev, assistantMsg]);

      // 6. Fetch streaming completions from Rinel Router completions endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          stream: true,
        })
      });

      if (!response.ok) {
        let errorDetail = response.statusText;
        try {
          const errorJson = await response.json();
          if (errorJson && errorJson.error) {
            errorDetail = errorJson.error;
          }
        } catch (_) {}
        throw new Error(errorDetail);
      }

      // 7. Stream SSE chunks
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let streamContent = '';
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleaned = line.trim();
            if (cleaned.startsWith('data: ')) {
              const dataStr = cleaned.slice(6).trim();
              if (dataStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(dataStr);
                const text = parsed.choices?.[0]?.delta?.content || '';
                streamContent += text;

                // Update UI state live
                setMessages(prev => 
                  prev.map(m => m.id === assistantMsg.id ? { ...m, content: streamContent } : m)
                );
              } catch (e) {}
            }
          }
        }

        // Finalize writing full text content back to IndexedDB
        assistantMsg.content = streamContent || 'No response received.';
        await updateMessage(assistantMsg);

        // Update State
        setMessages(prev => 
          prev.map(m => m.id === assistantMsg.id ? { ...m, content: assistantMsg.content } : m)
        );
      }
    } catch (err: any) {
      console.error('Error getting chat completion:', err);
      setMessages(prev => 
        prev.map(m => {
          if (m.role === 'assistant' && m.content === '') {
            return { 
              ...m, 
              content: `Error: Gagal memproses request. Pastikan jaringan terhubung dan coba lagi. (Detail: ${err.message})` 
            };
          }
          return m;
        })
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const activeModelName = (models.find(m => m.id === selectedModel)?.name || selectedModel).replace(/^gemini\//i, '');

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar Navigation */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onCreateSession={handleCreateSession}
        onDeleteSession={handleDeleteSession}
        onClearAll={handleClearAll}
        selectedModel={selectedModel}
        onSelectModel={handleSelectModel}
        models={models}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Chat Window */}
      <ChatWindow
        session={activeSession}
        messages={messages}
        onSendMessage={handleSendMessage}
        isGenerating={isGenerating}
        onToggleSidebar={() => setIsSidebarOpen(true)}
        activeModelName={activeModelName}
      />
    </div>
  );
}
