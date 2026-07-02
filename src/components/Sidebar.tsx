import React, { useState } from 'react';
import {
  MessageSquare, Plus, Trash2, Search, Bot, Sparkles, X, Menu, Trash
} from 'lucide-react';
import { ChatSession } from '@/utils/db';
import Image from "next/image";

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: (model: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  onClearAll: () => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  models: Array<{ id: string; name: string }>;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onClearAll,
  selectedModel,
  onSelectModel,
  models,
  isOpen,
  onClose
}: SidebarProps) {
  const [modelSearch, setModelSearch] = useState('');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

  // Helper to extract version group name
  const getModelVersionGroup = (modelId: string, modelName: string): string => {
    const idLower = modelId.toLowerCase();
    const nameLower = modelName.toLowerCase();
    
    if (idLower.includes('gemini-3.1') || nameLower.includes('gemini 3.1')) return 'Gemini 3.1';
    if (idLower.includes('gemini-3') || nameLower.includes('gemini 3')) return 'Gemini 3.0';
    if (idLower.includes('gemini-2.5') || nameLower.includes('gemini 2.5')) return 'Gemini 2.5';
    if (idLower.includes('gemini-2.0') || nameLower.includes('gemini 2.0')) return 'Gemini 2.0';
    if (idLower.includes('gemma-4') || nameLower.includes('gemma 4')) return 'Gemma 4';
    
    return 'Lainnya';
  };

  // Filter only chat-compatible Gemini & Gemma models (excl. embedding and image models)
  const chatModels = models.filter(m => {
    const id = m.id.toLowerCase();
    const isEmbedding = id.includes('embed');
    const isImage = id.includes('image');
    const isGeminiOrGemma = id.includes('gemini') || id.includes('gemma');
    return isGeminiOrGemma && !isEmbedding && !isImage;
  });

  // Filter models based on search term
  const filteredModels = chatModels.filter(m =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
    m.id.toLowerCase().includes(modelSearch.toLowerCase())
  );

  // Group filteredModels by version group
  const groupedModels: { [groupName: string]: typeof filteredModels } = {};
  filteredModels.forEach(m => {
    const groupName = getModelVersionGroup(m.id, m.name);
    if (!groupedModels[groupName]) {
      groupedModels[groupName] = [];
    }
    groupedModels[groupName].push(m);
  });

  // Define display order for groups
  const groupOrder = ['Gemini 3.1', 'Gemini 3.0', 'Gemini 2.5', 'Gemini 2.0', 'Gemma 4', 'Lainnya'];

  const activeModelName = (models.find(m => m.id === selectedModel)?.name || selectedModel).replace(/^gemini\//i, '');

  const handleSelectModel = (modelId: string) => {
    onSelectModel(modelId);
    setIsModelDropdownOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col w-72 bg-sidebar border-r border-border-color transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:flex-shrink-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {/* Header / Logo */}
        <div className="flex items-center justify-between p-4 border-b border-border-color">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
              <Image
                src="/logo.png"
                alt="D-Pan-AI Logo"
                width={100}
                height={100}
                className="object-contain"
              />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-200 via-indigo-400 to-violet-400 bg-clip-text text-transparent">
                D-Pan-AI
              </h1>
              <span className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">Prompt Chat Web Client</span>
            </div>
          </div>
          <button
            className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Model Selector Section */}
        <div className="p-4 border-b border-border-color">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            AI Model
          </label>
          <div className="relative">
            <button
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-gray-900/60 border border-border-color rounded-xl text-left text-sm text-gray-200 hover:bg-gray-900 hover:border-gray-700 transition duration-200"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <Sparkles size={16} className="text-indigo-400 shrink-0" />
                <span className="truncate font-medium">{activeModelName}</span>
              </div>
              <span className="text-gray-500 text-xs shrink-0 select-none font-sans">▼</span>
            </button>

            {isModelDropdownOpen && (
              <div className="absolute left-0 right-0 mt-2 z-50 rounded-xl bg-gray-900 border border-border-color shadow-2xl overflow-hidden glass">
                <div className="p-2 border-b border-border-color flex items-center gap-2 bg-gray-950/60">
                  <Search size={14} className="text-gray-500 shrink-0" />
                  <input
                    type="text"
                    placeholder="Search model..."
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    className="w-full bg-transparent border-0 text-xs text-gray-200 placeholder-gray-500 focus:ring-0 focus:outline-none py-1"
                    autoFocus
                  />
                </div>
                <div className="max-h-60 overflow-y-auto divide-y divide-gray-800/40">
                  {filteredModels.length > 0 ? (
                    groupOrder.map(groupName => {
                      const groupModels = groupedModels[groupName];
                      if (!groupModels || groupModels.length === 0) return null;
                      
                      return (
                        <div key={groupName} className="py-1">
                          <div className="px-3 py-1.5 text-[9px] font-bold text-indigo-400/80 tracking-wider uppercase bg-gray-950/40 select-none">
                            {groupName}
                          </div>
                          <ul className="divide-y divide-gray-800/10">
                            {groupModels.map((model) => {
                              const isDisabled = model.id.toLowerCase().includes('pro') || model.name.toLowerCase().includes('pro');
                              return (
                                <li key={model.id}>
                                  <button
                                    onClick={() => !isDisabled && handleSelectModel(model.id)}
                                    disabled={isDisabled}
                                    className={`w-full px-3 py-2.5 text-left text-xs transition duration-150 flex flex-col gap-0.5 ${
                                      model.id === selectedModel 
                                        ? 'bg-indigo-600/10 text-indigo-400 font-semibold' 
                                        : isDisabled 
                                          ? 'opacity-40 cursor-not-allowed text-gray-500' 
                                          : 'text-gray-400 hover:bg-indigo-600/20 hover:text-indigo-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 justify-between w-full">
                                      <span className="truncate font-medium">{model.name}</span>
                                      {isDisabled && (
                                        <span className="text-[8px] bg-gray-950 px-1 py-0.5 rounded text-gray-500 font-sans border border-border-color/25 uppercase font-semibold">Disabled</span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-gray-650 truncate">{model.id}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-3 py-4 text-center text-xs text-gray-500">
                      No models found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* New Chat Button */}
        <div className="p-4">
          <button
            onClick={() => {
              onCreateSession(selectedModel);
              if (window.innerWidth < 1024) onClose();
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/25 active:scale-[0.98]"
          >
            <Plus size={16} />
            <span>New Chat</span>
          </button>
        </div>

        {/* Chat Sessions History List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1 py-2">
          <h2 className="px-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            History Chat
          </h2>
          {sessions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-500 bg-gray-900/20 rounded-xl border border-dashed border-gray-800/40">
              No conversations yet
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  onClick={() => {
                    onSelectSession(session.id);
                    if (window.innerWidth < 1024) onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      onSelectSession(session.id);
                      if (window.innerWidth < 1024) onClose();
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-left text-xs transition duration-200 group relative cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500/30 ${isActive
                    ? 'bg-gray-800/60 text-white border border-gray-700/50'
                    : 'text-gray-400 hover:bg-gray-900/60 hover:text-gray-200 border border-transparent'
                    }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MessageSquare size={14} className={isActive ? 'text-indigo-400' : 'text-gray-500'} />
                    <span className="truncate pr-4">{session.title}</span>
                  </div>
                  <button
                    onClick={(e) => onDeleteSession(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-900/30 hover:text-red-400 text-gray-500 rounded transition absolute right-2 bg-gray-900/80"
                    title="Delete Chat"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        {sessions.length > 0 && (
          <div className="p-4 border-t border-border-color">
            <button
              onClick={onClearAll}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-950/20 hover:bg-red-950/40 text-red-400/90 hover:text-red-400 rounded-xl text-xs font-medium border border-red-900/10 hover:border-red-900/30 transition duration-200"
            >
              <Trash size={14} />
              <span>Clear All History</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
