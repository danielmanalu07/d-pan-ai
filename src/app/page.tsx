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

const DEFAULT_MODEL = 'openrouter/free';
const DEFAULT_MODELS_FALLBACK = [
  { id: 'openrouter/free', name: 'Free Models Router' },
  { id: 'nex-agi/nex-n2-pro:free', name: 'Nex AGI: Nex-N2-Pro (free)' },
  { id: 'meta-llama/llama-3-8b-instruct:free', name: 'Llama 3 8B Instruct (Free)' },
];

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [models, setModels] = useState<Array<{ id: string; name: string }>>(DEFAULT_MODELS_FALLBACK);
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 1. Fetch available models from OpenRouter API proxy on mount
  useEffect(() => {
    async function fetchModels() {
      try {
        const response = await fetch('/api/models');
        if (!response.ok) throw new Error('Failed to fetch models');
        
        const data = await response.json();
        if (data.data && Array.isArray(data.data)) {
          // Format & map to basic structure
          const formatted = data.data
            .map((m: any) => ({
              id: m.id,
              name: m.name || m.id,
            }))
            // Filter to only include FREE models
            .filter((m: any) => m.id.endsWith(':free') || m.id === 'openrouter/free')
            // Sort models to put popular allowed ones at the top
            .sort((a: any, b: any) => {
              if (a.id === 'openrouter/free') return -1;
              if (b.id === 'openrouter/free') return 1;
              if (a.id === 'nex-agi/nex-n2-pro:free') return -1;
              if (b.id === 'nex-agi/nex-n2-pro:free') return 1;
              return a.name.localeCompare(b.name);
            });

          // Ensure 'openrouter/free' is prepended if not returned by API
          const hasFreeRouter = formatted.some((m: any) => m.id === 'openrouter/free');
          if (!hasFreeRouter) {
            formatted.unshift({ id: 'openrouter/free', name: 'Free Models Router' });
          }

          setModels(formatted);
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
            const isModelAllowed = storedModel === 'openrouter/free' || storedModel === 'nex-agi/nex-n2-pro:free';
            setSelectedModel(isModelAllowed ? storedModel : 'openrouter/free');
          }
        }

        if (list.length > 0) {
          setActiveSessionId(list[0].id);
          const currentModel = list[0].model;
          const isModelAllowed = currentModel === 'openrouter/free' || currentModel === 'nex-agi/nex-n2-pro:free';
          setSelectedModel(isModelAllowed ? currentModel : 'openrouter/free');
        } else {
          // Create initial empty session
          const storedModel = typeof window !== 'undefined' ? localStorage.getItem('d_pan_ai_default_model') : null;
          const isModelAllowed = storedModel === 'openrouter/free' || storedModel === 'nex-agi/nex-n2-pro:free';
          const initialModel = isModelAllowed ? storedModel! : DEFAULT_MODEL;
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
          const currentModel = currentSession.model;
          const isModelAllowed = currentModel === 'openrouter/free' || currentModel === 'nex-agi/nex-n2-pro:free';
          setSelectedModel(isModelAllowed ? currentModel : 'openrouter/free');
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

      // 3. Prepare messages for API request payload
      // Include past messages + the new user message
      const chatHistory = [...messages, userMsg];
      const apiMessages = chatHistory.map(msg => {
        // Handle new unified files format
        if (msg.role === 'user' && msg.files && msg.files.length > 0) {
          let textVal = msg.content;
          const textFiles = msg.files.filter(f => !f.type.startsWith('image/') && !f.type.startsWith('audio/') && !f.type.startsWith('video/') && f.textContent);
          
          if (textFiles.length > 0) {
            textVal += "\n\n---\n[Lampiran Dokumen]:";
            textFiles.forEach(f => {
              textVal += `\n\n=== NAMA FILE: ${f.name} ===\n${f.textContent}\n======================`;
            });
          }

          // If there are no image/audio/video files, return content as a simple string for maximum model compatibility
          const hasMultimodal = msg.files.some(f => f.type.startsWith('image/') || f.type.startsWith('audio/') || f.type.startsWith('video/'));
          if (!hasMultimodal) {
            return {
              role: 'user',
              content: textVal
            };
          }

          const contentItems: any[] = [{ type: 'text', text: textVal }];
          
          msg.files.forEach(f => {
            if (f.type.startsWith('image/')) {
              contentItems.push({
                type: 'image_url',
                image_url: { url: f.content }
              });
            } else if (f.type.startsWith('audio/')) {
              let format = 'wav';
              const mimeMatch = f.type.match(/audio\/([a-zA-Z0-9]+)/);
              if (mimeMatch) {
                format = mimeMatch[1];
              }
              const base64Data = f.content.split(';base64,')[1] || f.content;
              contentItems.push({
                type: 'input_audio',
                input_audio: {
                  data: base64Data,
                  format: format === 'mpeg' ? 'mp3' : format
                }
              });
            } else if (f.type.startsWith('video/')) {
              contentItems.push({
                type: 'video_url',
                video_url: {
                  url: f.content
                }
              });
            }
          });

          return {
            role: 'user',
            content: contentItems
          };
        } else if (msg.role === 'user' && msg.images && msg.images.length > 0) {
          // Legacy support for multiple images
          return {
            role: 'user',
            content: [
              { type: 'text', text: msg.content },
              ...msg.images.map(img => ({
                type: 'image_url',
                image_url: { url: img }
              }))
            ]
          };
        } else if (msg.role === 'user' && msg.image) {
          // Backward compatibility
          return {
            role: 'user',
            content: [
              { type: 'text', text: msg.content },
              { type: 'image_url', image_url: { url: msg.image } }
            ]
          };
        }
        return {
          role: msg.role,
          content: msg.content
        };
      });

      // 4. Create placeholder AI message in IndexedDB/State
      const assistantMsg = await addMessage(sessionId, 'assistant', '');
      setMessages(prev => [...prev, assistantMsg]);

      const isNativeAudioModel = selectedModel.includes('gpt-audio');

      // 5. Fetch streaming chat completions
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          stream: true,
          ...(requestAudio && isNativeAudioModel ? {
            modalities: ["text", "audio"],
            audio: {
              voice: "alloy",
              format: "wav"
            }
          } : {})
        })
      });

      if (!response.ok) {
        let errorDetail = response.statusText;
        try {
          const errorJson = await response.json();
          if (errorJson && errorJson.error) {
            errorDetail = errorJson.error;
          }
        } catch (_) {
          // Response body might not be JSON or reader failed
        }
        throw new Error(errorDetail);
      }

      // 6. Handle streaming SSE chunks
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let streamContent = '';
      let buffer = '';
      const audioDataChunks: string[] = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the incomplete line in buffer

          for (const line of lines) {
            const cleaned = line.trim();
            if (cleaned.startsWith('data: ')) {
              const dataStr = cleaned.slice(6).trim();
              if (dataStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(dataStr);
                const text = parsed.choices?.[0]?.delta?.content || '';
                
                // Parse audio data if present in modalities output
                const deltaAudio = parsed.choices?.[0]?.delta?.audio;
                let audioTranscript = '';
                if (deltaAudio) {
                  if (deltaAudio.transcript) {
                    audioTranscript = deltaAudio.transcript;
                  }
                  if (deltaAudio.data) {
                    audioDataChunks.push(deltaAudio.data);
                  }
                }

                streamContent += (text || audioTranscript);

                // Update UI state live
                setMessages(prev => 
                  prev.map(m => m.id === assistantMsg.id ? { ...m, content: streamContent } : m)
                );
              } catch (e) {
                // Ignore chunk parsing error for incomplete json
              }
            }
          }
        }

        // Finalize writing full text/audio content back to IndexedDB
        assistantMsg.content = streamContent || 'No response received.';
        let fullAudioB64 = audioDataChunks.join('');

        if (requestAudio && !isNativeAudioModel && streamContent) {
          try {
            // Strip markdown formatting before speaking
            const cleanText = streamContent
              .replace(/\[.*?\]\(.*?\)/g, '')
              .replace(/[*#`_\-]/g, '')
              .trim()
              .slice(0, 1000); // limit text to prevent huge synthesis
              
            if (cleanText) {
              const ttsRes = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input: cleanText }),
              });
              if (ttsRes.ok) {
                const blob = await ttsRes.blob();
                // Convert blob to base64 data url
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve) => {
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });
                const audioDataUrl = await base64Promise;
                assistantMsg.audioUrl = audioDataUrl;
                
                // Auto-play the voice response
                const audio = new Audio(audioDataUrl);
                audio.play().catch(e => console.error("Auto-play blocked or failed:", e));
              }
            }
          } catch (ttsErr) {
            console.error("Auto TTS generation failed:", ttsErr);
          }
        } else if (fullAudioB64) {
          assistantMsg.audioUrl = `data:audio/wav;base64,${fullAudioB64}`;
          // Auto-play native audio response
          const audio = new Audio(assistantMsg.audioUrl);
          audio.play().catch(e => console.error("Auto-play blocked or failed:", e));
        }

        await updateMessage(assistantMsg);

        // Update State
        setMessages(prev => 
          prev.map(m => m.id === assistantMsg.id ? { ...m, content: assistantMsg.content, audioUrl: assistantMsg.audioUrl } : m)
        );
      }
    } catch (err: any) {
      console.error('Error getting chat completion:', err);
      // Append error message to UI for clear debugging
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
  const activeModelName = models.find(m => m.id === selectedModel)?.name || selectedModel;

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
