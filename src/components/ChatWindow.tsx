import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Plus, Image, X, Menu, Bot, User, Copy, Check, Sparkles, UploadCloud, CornerDownLeft,
  FileText, FileSpreadsheet, FileCode, File, Download, Video, Music, Volume2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatSession, ChatMessage, AttachedFile } from '@/utils/db';
import Logo from "next/image";

interface ChatWindowProps {
  session: ChatSession | null;
  messages: ChatMessage[];
  onSendMessage: (content: string, images?: string[], files?: AttachedFile[], requestAudio?: boolean) => Promise<void>;
  isGenerating: boolean;
  onToggleSidebar: () => void;
  activeModelName: string;
}

// Helper to dynamically load external scripts from CDN
function loadScript(url: string, globalName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && (window as any)[globalName]) {
      resolve((window as any)[globalName]);
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      resolve((window as any)[globalName]);
    };
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
}





// Copyable CodeBlock Component
function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="relative my-4 rounded-xl overflow-hidden border border-border-color bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-border-color text-xs text-gray-400 font-mono">
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-white transition duration-150"
        >
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span className="text-emerald-400 font-medium">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-sm">
        <pre className="!bg-transparent !p-0 !border-0 m-0">
          <code className="text-gray-300 font-mono">{value}</code>
        </pre>
      </div>
    </div>
  );
}

// Compress images using canvas to make database size lightweight
function compressImage(dataUrl: string, maxWidth = 1024, maxHeight = 1024, quality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.src = dataUrl;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      resolve(dataUrl);
    };
  });
}

// Get file type icon
function getFileIcon(type: string) {
  if (type.startsWith('image/')) return <Image size={18} />;
  if (type === 'application/pdf') return <FileText size={18} className="text-rose-400" />;
  if (type.includes('spreadsheet') || type.includes('excel') || type.endsWith('csv')) return <FileSpreadsheet size={18} className="text-emerald-450" />;
  if (type.includes('word') || type.includes('officedocument.wordprocessingml')) return <FileText size={18} className="text-blue-405" />;
  if (type.includes('text') || type.includes('json') || type.includes('javascript') || type.includes('typescript')) return <FileCode size={18} className="text-amber-450" />;
  if (type.startsWith('audio/') || type.includes('audio') || type.includes('music')) return <Music size={18} className="text-cyan-400" />;
  if (type.startsWith('video/') || type.includes('video') || type.includes('mp4')) return <Video size={18} className="text-pink-400" />;
  return <File size={18} className="text-gray-400" />;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function ChatWindow({
  session,
  messages,
  onSendMessage,
  isGenerating,
  onToggleSidebar,
  activeModelName,
}: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [previewFile, setPreviewFile] = useState<AttachedFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Multimodal & Voice states
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [uploadAccept, setUploadAccept] = useState('image/*,application/pdf,text/*,.doc,.docx,.xls,.xlsx,.csv,audio/*,video/*');
  const [voiceResponseEnabled, setVoiceResponseEnabled] = useState(false);
  const [audioRecording, setAudioRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Image generation states
  const [isShowImageGenModal, setIsShowImageGenModal] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenPrompt, setImageGenPrompt] = useState('');
  const [imageGenModel, setImageGenModel] = useState('gemini/gemini-2.5-flash-image');
  const [imageGenResult, setImageGenResult] = useState('');
  const [imageGenError, setImageGenError] = useState('');
  const [imageGenRatio, setImageGenRatio] = useState('1:1');

  // Video generation states
  const [isShowVideoGenModal, setIsShowVideoGenModal] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoGenPrompt, setVideoGenPrompt] = useState('');
  const [videoGenModel, setVideoGenModel] = useState('google/veo-3.1');
  const [videoGenResult, setVideoGenResult] = useState('');
  const [videoGenError, setVideoGenError] = useState('');
  const [videoGenStatus, setVideoGenStatus] = useState<'idle' | 'pending' | 'in_progress' | 'completed' | 'failed'>('idle');
  const [videoGenRatio, setVideoGenRatio] = useState('16:9');
  const [videoGenJobId, setVideoGenJobId] = useState('');
  const pollingIntervalRef = useRef<any>(null);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Trigger file upload with dynamic accept filter
  const triggerUpload = (acceptFilter: string) => {
    setUploadAccept(acceptFilter);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  // Click outside listener to close the popover menu
  useEffect(() => {
    const handleOutsideClick = () => {
      if (showAttachmentMenu) {
        setShowAttachmentMenu(false);
      }
    };
    if (showAttachmentMenu) {
      window.addEventListener('click', handleOutsideClick);
    }
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, [showAttachmentMenu]);



  // Video Generation job submit & status polling
  const handleGenerateVideo = async () => {
    if (!videoGenPrompt.trim()) return;
    setIsGeneratingVideo(true);
    setVideoGenError('');
    setVideoGenResult('');
    setVideoGenStatus('pending');

    try {
      const res = await fetch('/api/video-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoGenPrompt,
          model: videoGenModel,
          aspect_ratio: videoGenRatio,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Video Gen error: ${errText}`);
      }

      const data = await res.json();
      const jobId = data.id;

      if (!jobId) {
        throw new Error("Gagal memperoleh ID pekerjaan video.");
      }

      setVideoGenJobId(jobId);

      // Start polling
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/video-gen?id=${jobId}`);
          if (!pollRes.ok) return;

          const pollData = await pollRes.json();
          const status = pollData.status;

          if (status === 'completed') {
            clearInterval(pollingIntervalRef.current);
            setVideoGenStatus('completed');
            setIsGeneratingVideo(false);
            if (pollData.unsigned_urls && pollData.unsigned_urls.length > 0) {
              setVideoGenResult(pollData.unsigned_urls[0]);
            } else {
              setVideoGenError("Hasil video berhasil digenerasi tetapi URL tidak ditemukan.");
            }
          } else if (status === 'failed') {
            clearInterval(pollingIntervalRef.current);
            setVideoGenStatus('failed');
            setIsGeneratingVideo(false);
            setVideoGenError(pollData.error || "Proses penjanaan video gagal.");
          } else if (status === 'in_progress') {
            setVideoGenStatus('in_progress');
          }
        } catch (pollErr) {
          console.error("Polling error:", pollErr);
        }
      }, 5000);

    } catch (err: any) {
      console.error(err);
      setVideoGenError(err.message || 'Gagal mengirim pekerjaan video. Silakan coba lagi.');
      setVideoGenStatus('failed');
      setIsGeneratingVideo(false);
    }
  };

  // Image generation handler
  const handleGenerateImage = async () => {
    if (!imageGenPrompt.trim()) return;
    setIsGeneratingImage(true);
    setImageGenError('');
    setImageGenResult('');

    try {
      const res = await fetch('/api/image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: imageGenModel,
          prompt: imageGenPrompt,
          aspect_ratio: imageGenRatio || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Gagal memanggil API: ${res.statusText}`);
      }

      if (data.imageUrl) {
        setImageGenResult(data.imageUrl);
      } else {
        throw new Error('Model tidak mengembalikan gambar. Coba ganti model atau prompt.');
      }
    } catch (err: any) {
      console.error('[image-gen]', err);
      setImageGenError(err.message || 'Gagal menghasilkan gambar. Coba ganti model atau prompt.');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleFileChange = async (files: FileList | File[] | null) => {
    if (!files) return;
    const fileList = Array.from(files);

    const processedFiles = await Promise.all(
      fileList.map(async (file) => {
        const isImage = file.type.startsWith('image/');
        const isText =
          file.type.startsWith('text/') ||
          /\.(json|js|ts|tsx|jsx|md|xml|yaml|yml|csv)$/i.test(file.name);
        const isPDF = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const isDocx = /\.docx$/i.test(file.name);
        const isXlsx = /\.(xlsx|xls)$/i.test(file.name);

        let content = '';
        let textContent: string | undefined = undefined;
        let htmlContent: string | undefined = undefined;

        try {
          if (isImage) {
            // Read as Data URL
            const rawDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.onerror = (err) => reject(err);
              reader.readAsDataURL(file);
            });

            // Compress image to save database space!
            content = await compressImage(rawDataUrl);
          } else {
            // Read as Data URL
            content = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.onerror = (err) => reject(err);
              reader.readAsDataURL(file);
            });

            // Read arrayBuffer for PDF / DOCX / XLSX parsers
            const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
              reader.onerror = (err) => reject(err);
              reader.readAsArrayBuffer(file);
            });

            if (isText) {
              // Read as raw text
              textContent = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.onerror = (err) => reject(err);
                reader.readAsText(file);
              });
            } else if (isPDF) {
              try {
                // Dynamically load PDF.js from CDN
                const pdfjsLib = await loadScript(
                  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
                  'pdfjsLib'
                );
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
                const pdf = await loadingTask.promise;
                let fullText = '';

                for (let i = 1; i <= pdf.numPages; i++) {
                  const page = await pdf.getPage(i);
                  const textContentObj = await page.getTextContent();
                  const pageText = textContentObj.items.map((item: any) => item.str).join(' ');
                  fullText += `--- HALAMAN ${i} ---\n${pageText}\n\n`;
                }

                textContent = fullText.trim();
              } catch (pdfError) {
                console.error("Gagal mengekstrak PDF:", pdfError);
                textContent = "[Gagal mengekstrak teks PDF]";
              }
            } else if (isDocx) {
              try {
                // Dynamically load Mammoth from CDN
                const mammoth = await loadScript(
                  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
                  'mammoth'
                );

                // Extract text for AI
                const textResult = await mammoth.extractRawText({ arrayBuffer });
                textContent = textResult.value.trim();

                // Convert to HTML for premium rendering preview
                const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
                htmlContent = htmlResult.value;
              } catch (docxError) {
                console.error("Gagal mengekstrak Word:", docxError);
                textContent = "[Gagal mengekstrak teks Word]";
              }
            } else if (isXlsx) {
              try {
                // Dynamically load SheetJS from CDN
                const XLSX = await loadScript(
                  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
                  'XLSX'
                );

                const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                let fullText = '';
                let htmlText = '';

                workbook.SheetNames.forEach((sheetName: string) => {
                  const sheet = workbook.Sheets[sheetName];

                  // Convert to CSV for prompt analysis
                  const csv = XLSX.utils.sheet_to_csv(sheet);
                  fullText += `=== SHEET: ${sheetName} ===\n${csv}\n\n`;

                  // Convert to HTML tables for visual preview
                  const html = XLSX.utils.sheet_to_html(sheet);
                  htmlText += `
                    <div class="excel-sheet-preview mb-6">
                      <h4 class="text-xs font-bold text-indigo-400 mb-2 border-b border-indigo-500/20 pb-1">${sheetName}</h4>
                      <div class="overflow-auto max-h-80 border border-gray-850 rounded-lg bg-gray-950 p-2 text-xs text-gray-300">
                        ${html}
                      </div>
                    </div>
                  `;
                });

                textContent = fullText.trim();
                htmlContent = htmlText;
              } catch (xlsxError) {
                console.error("Gagal mengekstrak Excel:", xlsxError);
                textContent = "[Gagal mengekstrak teks Excel]";
              }
            }
          }
        } catch (error) {
          console.error("Gagal memproses file:", file.name, error);
        }

        return {
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          content,
          textContent,
          htmlContent
        };
      })
    );

    setAttachedFiles((prev) => [...prev, ...processedFiles]);
  };

  const handleImageUploadClick = () => {
    fileInputRef.current?.click();
  };

  const removeFile = (indexToRemove: number) => {
    setAttachedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachedFiles.length === 0) || isGenerating) return;

    const currentInput = input;
    const currentFiles = attachedFiles.length > 0 ? attachedFiles : undefined;

    setInput('');
    setAttachedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    await onSendMessage(currentInput, undefined, currentFiles, voiceResponseEnabled);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileChange(files);
    }
  };

  // Clipboard paste handler
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
      handleFileChange(pastedFiles);
    }
  };

  // Suggestion click
  const handleSuggestionClick = (promptText: string) => {
    setInput(promptText);
    textareaRef.current?.focus();
  };

  const suggestions = [
    {
      title: "Konsep Kuantum",
      desc: "Jelaskan konsep Quantum Computing secara sederhana",
      prompt: "Jelaskan konsep Quantum Computing secara sederhana untuk orang awam."
    },
    {
      title: "Email Follow-up",
      desc: "Buat email follow-up profesional untuk klien",
      prompt: "Tulis email follow-up profesional yang sopan dan efektif untuk klien setelah meeting penawaran proyek."
    },
    {
      title: "Debug Kode",
      desc: "Bantu saya memperbaiki bug kode JavaScript",
      prompt: "Bantu saya debug kode javascript ini. Mengapa hasilnya undefined?\n\n```javascript\nconst user = { name: 'D-Pan' };\nconsole.log(user.profile.age);\n```"
    },
    {
      title: "Analisis Gambar",
      desc: "Upload gambar lalu minta penjelasan detail",
      prompt: "Jelaskan gambar ini secara mendetail."
    }
  ];

  return (
    <div
      className="flex-1 flex flex-col h-full bg-background relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay indicator */}
      {isDragging && (
        <div className="absolute inset-0 bg-indigo-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-2 border-dashed border-indigo-500 m-4 rounded-2xl pointer-events-none">
          <UploadCloud size={48} className="text-indigo-400 animate-bounce mb-3" />
          <h3 className="text-lg font-semibold text-white">Lepaskan gambar di sini</h3>
          <p className="text-xs text-gray-400 mt-1">Format JPG, PNG, WEBP, atau GIF</p>
        </div>
      )}

      {/* Top Navigation / Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border-color glass z-10 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white lg:hidden transition"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <div>
              <h2 className="text-xs font-semibold text-gray-300">
                {session ? session.title : 'D-Pan-AI Chat'}
              </h2>
              <p className="text-[10px] text-gray-500 truncate max-w-[180px] sm:max-w-xs font-mono">
                {activeModelName}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium bg-gray-900/60 border border-border-color px-2.5 py-1 rounded-full shrink-0">
          <Sparkles size={12} className="text-indigo-400" />
          <span>Active</span>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        {messages.length === 0 ? (
          /* Empty / Welcoming Landing State */
          <div className="max-w-2xl mx-auto h-full flex flex-col justify-center items-center py-12 px-2">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/5 animate-pulse-glow">
              <Logo
                src="/logo.png"
                alt="D-Pan-AI Logo"
                width={500}
                height={500}
                className="object-contain"
              />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-center tracking-tight mb-3 bg-gradient-to-r from-white via-indigo-100 to-indigo-300 bg-clip-text text-transparent">
              D-Pan-AI
            </h1>

            <p className="text-gray-400 text-center text-sm sm:text-base max-w-md mb-10 leading-relaxed font-light">
              Bagaimana saya bisa membantu Anda hari ini? Pilih saran di bawah atau mulai ketik pesan Anda.
            </p>

            {/* Quick Suggestions Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full">
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(s.prompt)}
                  className="p-4 text-left rounded-2xl glass-card hover:bg-indigo-950/20 hover:border-indigo-500/30 transition duration-300 group border border-border-color"
                >
                  <h3 className="text-xs font-semibold text-indigo-400 group-hover:text-indigo-300 mb-1">
                    {s.title}
                  </h3>
                  <p className="text-xs text-gray-400 group-hover:text-gray-300 leading-normal line-clamp-2">
                    {s.desc}
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Conversation Thread */
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, index) => {
              const isAssistant = msg.role === 'assistant';
              const isLast = index === messages.length - 1;
              const isPending = isAssistant && !msg.content && isGenerating && isLast;

              return (
                <div
                  key={msg.id}
                  className={`flex gap-4 animate-fade-in ${isAssistant ? 'justify-start' : 'justify-end'
                    }`}
                >
                  {/* Avatar for AI */}
                  {isAssistant && (
                    <div className="w-8 h-8 rounded-lg bg-indigo-600/15 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0 shadow-md">
                      <Logo
                        src="/logo.png"
                        alt="D-Pan-AI Logo"
                        width={500}
                        height={500}
                        className="object-contain"
                      />
                    </div>
                  )}

                  {/* Message bubble */}
                  <div className={`max-w-[85%] flex flex-col gap-1 ${isAssistant ? 'items-start' : 'items-end'}`}>
                    <div
                      className={`w-full rounded-2xl p-4 text-sm leading-relaxed ${isAssistant
                        ? 'bg-gray-900/30 border border-border-color text-gray-200 shadow-sm'
                        : 'bg-indigo-600/90 text-white shadow-md shadow-indigo-600/10'
                        }`}
                    >
                      {/* User upload files display */}
                      {!isAssistant && msg.files && msg.files.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {msg.files.map((file, index) => {
                            const isImg = file.type.startsWith('image/');
                            return (
                              <div
                                key={index}
                                onClick={() => setPreviewFile(file)}
                                className="cursor-pointer group relative rounded-xl overflow-hidden border border-white/10 hover:border-indigo-500/40 bg-gray-900/60 hover:bg-gray-950/80 transition duration-200"
                              >
                                {isImg ? (
                                  <div className="h-28 w-28 md:h-36 md:w-36 overflow-hidden">
                                    <img
                                      src={file.content}
                                      alt={file.name}
                                      className="w-full h-full object-cover group-hover:scale-105 transition duration-350"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-3 p-3 w-48 max-w-full">
                                    <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-lg shrink-0">
                                      {getFileIcon(file.type)}
                                    </div>
                                    <div className="min-w-0 text-left">
                                      <p className="text-xs font-semibold text-gray-200 truncate group-hover:text-indigo-300">{file.name}</p>
                                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">{formatFileSize(file.size)}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Legacy multiple images display */}
                      {!isAssistant && msg.images && msg.images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {msg.images.map((img, index) => (
                            <div
                              key={index}
                              onClick={() => setPreviewFile({ name: `Attachment ${index + 1}`, type: 'image/jpeg', size: 0, content: img })}
                              className="cursor-pointer rounded-lg overflow-hidden border border-white/10 max-h-40 max-w-[180px] shadow-sm hover:border-indigo-500/40 transition"
                            >
                              <img
                                src={img}
                                alt={`Uploaded Attachment ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Legacy single image support */}
                      {!isAssistant && msg.image && (
                        <div
                          onClick={() => setPreviewFile({ name: 'Attachment', type: 'image/jpeg', size: 0, content: msg.image! })}
                          className="cursor-pointer mb-3 rounded-lg overflow-hidden border border-white/10 max-h-60 max-w-sm hover:border-indigo-500/40 transition"
                        >
                          <img
                            src={msg.image}
                            alt="Uploaded Attachment"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      {/* Content text (or markdown for assistant) */}
                      {isAssistant ? (
                        isPending ? (
                          <div className="flex items-center gap-2 py-1 px-0.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            <span className="text-xs text-indigo-300/80 font-medium font-sans ml-1.5 animate-pulse tracking-wide">D-Pan-AI sedang memproses...</span>
                          </div>
                        ) : (
                          <div className="prose prose-invert max-w-none text-gray-200 prose-headings:text-indigo-300 prose-a:text-indigo-400 prose-strong:text-white prose-code:text-indigo-300">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({ className, children, ...props }) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  const codeVal = String(children).replace(/\n$/, '');
                                  return match ? (
                                    <CodeBlock language={match[1]} value={codeVal} />
                                  ) : (
                                    <code className="bg-gray-950/80 text-indigo-300 px-1.5 py-0.5 rounded-md text-xs font-mono border border-border-color" {...props}>
                                      {children}
                                    </code>
                                  );
                                }
                              }}
                            >
                              {isGenerating && isLast ? `${msg.content} ▋` : msg.content}
                            </ReactMarkdown>
                          </div>
                        )
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>

                    {/* Assistant Message Actions Toolbar */}
                    {isAssistant && msg.content && !isPending && (
                      <div className="flex items-center gap-1.5 mt-0.5 px-1 self-start">
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(msg.content);
                            alert("Pesan disalin ke papan klip!");
                          }}
                          className="p-1 flex items-center justify-center rounded-lg border border-border-color/40 bg-gray-950/40 text-gray-500 hover:text-gray-350 hover:bg-gray-800/60 transition"
                          title="Salin Pesan"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Avatar for User */}
                  {!isAssistant && (
                    <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 flex items-center justify-center shrink-0 shadow-md">
                      <User size={16} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading/Typing Indicator */}
            {isGenerating && (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') && (
              <div className="flex gap-4 justify-start animate-fade-in">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/15 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <Logo
                    src="/logo.png"
                    alt="D-Pan-AI Logo"
                    width={500}
                    height={500}
                    className="object-contain"
                  />
                </div>
                <div className="bg-gray-900/30 border border-border-color rounded-2xl px-5 py-4 flex items-center gap-1.5 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Form area */}
      <footer className="p-4 bg-background border-t border-border-color shrink-0">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">

          {/* File/Image Upload Preview Container */}
          {attachedFiles.length > 0 && (
            <div className="absolute bottom-full mb-3 left-0 bg-gray-900 border border-border-color p-3 rounded-2xl flex flex-wrap gap-2.5 max-w-full sm:max-w-2xl animate-fade-in glass shadow-2xl overflow-y-auto max-h-40">
              {attachedFiles.map((file, idx) => {
                const isImg = file.type.startsWith('image/');
                return (
                  <div key={idx} className="relative rounded-lg overflow-hidden border border-border-color shrink-0 cursor-pointer bg-gray-950/65" onClick={() => setPreviewFile(file)}>
                    {isImg ? (
                      <div className="w-14 h-14">
                        <img src={file.content} alt={file.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-14 w-32 px-2.5 py-1.5 flex items-center gap-2">
                        <div className="p-1 bg-indigo-500/10 text-indigo-400 rounded shrink-0">
                          {getFileIcon(file.type)}
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="text-[10px] font-semibold text-gray-300 truncate">{file.name}</p>
                          <p className="text-[8px] text-gray-500 font-mono mt-0.5">{formatFileSize(file.size)}</p>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(idx);
                      }}
                      className="absolute -top-1 -right-1 p-0.5 bg-black/85 hover:bg-black text-white rounded-full transition z-10"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
              <div className="text-xs flex flex-col justify-center pr-2 shrink-0">
                <p className="font-semibold text-gray-300">{attachedFiles.length} File terpilih</p>
                <p className="text-[10px] text-gray-500 font-light">Klik untuk pratinjau</p>
              </div>
            </div>
          )}

          {/* Actual Input Capsule */}
          <div className="glass-input rounded-2xl p-2.5 flex items-end gap-2 shadow-xl">

            {/* Multimodal Popover Menu */}
            {showAttachmentMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute bottom-full mb-3 left-4 w-64 bg-gray-950/95 border border-border-color rounded-2xl p-2.5 glass shadow-2xl z-20 flex flex-col gap-1 animate-fade-in"
              >
                <div className="px-2.5 py-1.5 border-b border-white/5 mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">Pilih Mode Multimodal</span>
                </div>                <button
                  type="button"
                  onClick={() => {
                    setShowAttachmentMenu(false);
                    triggerUpload('application/pdf,text/*,.doc,.docx,.xls,.xlsx,.csv,.json,.md,.html,.txt');
                  }}
                  className="flex items-center gap-3 px-2.5 py-2 hover:bg-gray-900 text-gray-300 rounded-xl transition text-left text-xs"
                >
                  <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
                    <UploadCloud size={14} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-200">Upload Files</p>
                    <p className="text-[9px] text-gray-500 font-light">PDF, TXT, DOCX, XLSX, HTML, dll.</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAttachmentMenu(false);
                    setIsShowImageGenModal(true);
                  }}
                  className="flex items-center gap-3 px-2.5 py-2 hover:bg-gray-900 text-gray-300 rounded-xl transition text-left text-xs border-t border-white/5 mt-1 pt-2"
                >
                  <div className="p-1.5 bg-purple-500/10 text-purple-400 rounded-lg">
                    <Sparkles size={14} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-255">AI Image Generator</p>
                    <p className="text-[9px] text-gray-500 font-light">Buat gambar AI dengan teks</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAttachmentMenu(false);
                    setIsShowVideoGenModal(true);
                  }}
                  className="flex items-center gap-3 px-2.5 py-2 hover:bg-gray-900 text-gray-300 rounded-xl transition text-left text-xs"
                >
                  <div className="p-1.5 bg-pink-500/10 text-pink-400 rounded-lg">
                    <Video size={14} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-255">AI Video Generator</p>
                    <p className="text-[9px] text-gray-500 font-light">Buat video AI asinkron dengan teks</p>
                  </div>
                </button>
              </div>
            )}

            {/* Attachment Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAttachmentMenu(!showAttachmentMenu);
              }}
              className={`p-2.5 rounded-xl transition shrink-0 ${showAttachmentMenu
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/15'
                : 'text-gray-400 hover:text-indigo-400 hover:bg-gray-800/60'
                }`}
              title="Multimodal Inputs"
            >
              <Plus size={20} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => {
                handleFileChange(e.target.files);
              }}
              multiple
              accept={uploadAccept}
              className="hidden"
            />

            {/* Input Textarea */}
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Tulis pesan ke D-Pan-AI... (Tekan Shift+Enter untuk baris baru)"
              className="flex-1 bg-transparent border-0 text-sm text-gray-200 placeholder-gray-500 focus:ring-0 focus:outline-none py-2 resize-none max-h-[180px] min-h-[36px]"
            />



            {/* Send Button */}
            <button
              type="submit"
              disabled={(!input.trim() && attachedFiles.length === 0) || isGenerating}
              className={`p-2.5 rounded-xl transition shrink-0 active:scale-95 ${(input.trim() || attachedFiles.length > 0) && !isGenerating
                ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/15'
                : 'bg-gray-800/40 text-gray-600 cursor-not-allowed'
                }`}
            >
              <Send size={16} />
            </button>
          </div>

          <div className="text-center mt-2">
            <span className="text-[10px] text-gray-650 font-light">
              D-Pan-AI dapat membuat kesalahan. Pertimbangkan untuk memeriksa informasi penting.
            </span>
          </div>
        </form>
      </footer>

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4 md:p-8 animate-fade-in" onClick={() => setPreviewFile(null)}>
          <div className="w-full max-w-4xl bg-gray-900 border border-border-color rounded-2xl overflow-hidden glass shadow-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>

            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-color bg-gray-950/60">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg shrink-0">
                  {getFileIcon(previewFile.type)}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-200 truncate">{previewFile.name}</h3>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                    {previewFile.type} • {formatFileSize(previewFile.size)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={previewFile.content}
                  download={previewFile.name}
                  className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
                  title="Download File"
                >
                  <Download size={18} />
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
                  title="Close Preview"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-gray-950/20">
              <style dangerouslySetInnerHTML={{
                __html: `
                .sheet-table-container table {
                  width: 100%;
                  border-collapse: collapse;
                  font-family: monospace;
                  font-size: 11px;
                  margin-bottom: 1.5rem;
                }
                .sheet-table-container th, .sheet-table-container td {
                  border: 1px solid rgba(255, 255, 255, 0.08);
                  padding: 6px 10px;
                  text-align: left;
                }
                .sheet-table-container tr:nth-child(even) {
                  background-color: rgba(255, 255, 255, 0.02);
                }
                .sheet-table-container p {
                  margin-bottom: 1rem;
                  line-height: 1.6;
                }
              `}} />
              {previewFile.type.startsWith('image/') ? (
                <div className="relative max-w-full max-h-[60vh]">
                  <img
                    src={previewFile.content}
                    alt={previewFile.name}
                    className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg border border-white/5"
                  />
                </div>
              ) : previewFile.type === 'application/pdf' ? (
                <iframe
                  src={previewFile.content}
                  title={previewFile.name}
                  className="w-full h-[60vh] rounded-lg border border-border-color bg-white"
                />
              ) : previewFile.type.startsWith('audio/') ? (
                <div className="w-full max-w-md bg-gray-950 p-8 rounded-2xl border border-border-color flex flex-col items-center gap-5 text-center shadow-xl">
                  <div className="p-4 bg-indigo-500/10 text-indigo-400 rounded-full animate-pulse border border-indigo-500/25">
                    <Volume2 size={32} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-200 truncate max-w-xs">{previewFile.name}</h4>
                    <p className="text-[10px] text-gray-500 mt-1">{formatFileSize(previewFile.size)}</p>
                  </div>
                  <audio controls className="w-full bg-gray-900 rounded-xl p-1 animate-fade-in" src={previewFile.content} />
                </div>
              ) : previewFile.type.startsWith('video/') ? (
                <div className="relative max-w-full max-h-[60vh] flex flex-col items-center">
                  <video controls className="max-w-full max-h-[50vh] rounded-lg border border-border-color bg-black animate-fade-in" src={previewFile.content} />
                  <span className="text-[10px] text-gray-500 mt-3">{previewFile.name} ({formatFileSize(previewFile.size)})</span>
                </div>
              ) : previewFile.htmlContent !== undefined ? (
                <div
                  className="w-full max-h-[60vh] overflow-auto rounded-lg border border-border-color bg-gray-950 p-6 text-xs text-gray-300 text-left sheet-table-container prose prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewFile.htmlContent }}
                />
              ) : previewFile.textContent !== undefined ? (
                <div className="w-full max-h-[60vh] overflow-auto rounded-lg border border-border-color bg-gray-950 p-4 font-mono text-xs text-gray-300 text-left whitespace-pre">
                  {previewFile.textContent}
                </div>
              ) : (
                /* Unsupported file types (Word, Excel, Zip, etc.) */
                <div className="py-12 flex flex-col items-center justify-center text-center max-w-md mx-auto">
                  <div className="p-5 bg-indigo-500/10 text-indigo-400 rounded-2xl mb-4 border border-indigo-500/20 animate-pulse">
                    {getFileIcon(previewFile.type)}
                  </div>
                  <h4 className="text-sm font-semibold text-gray-200 mb-1">Pratinjau tidak tersedia</h4>
                  <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                    Browser tidak dapat membuka pratinjau untuk file tipe ini secara langsung. Silakan download file untuk membukanya di perangkat Anda.
                  </p>
                  <a
                    href={previewFile.content}
                    download={previewFile.name}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-650 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-650/15 transition active:scale-95"
                  >
                    <Download size={14} />
                    <span>Download File ({formatFileSize(previewFile.size)})</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}



      {/* Image Generation Modal */}
      {isShowImageGenModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={() => setIsShowImageGenModal(false)}>
          <div className="w-full max-w-md bg-gray-900 border border-border-color rounded-2xl overflow-hidden glass shadow-2xl p-6 flex flex-col gap-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="text-purple-400" size={18} />
                <h3 className="text-sm font-bold text-gray-200 font-sans">AI Image Generator</h3>
              </div>
              <button onClick={() => setIsShowImageGenModal(false)} className="text-gray-400 hover:text-white transition">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 font-sans">Model Pilihan</label>
                <select
                  disabled
                  className="w-full text-xs bg-gray-950/50 border border-border-color rounded-xl p-2.5 text-gray-400 focus:outline-none font-sans cursor-not-allowed"
                >
                  <option value="gemini/gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 font-sans">Rasio Aspek</label>
                <select
                  value={imageGenRatio}
                  onChange={(e) => setImageGenRatio(e.target.value)}
                  className="w-full text-xs bg-gray-950 border border-border-color rounded-xl p-2.5 text-gray-300 focus:outline-none focus:border-indigo-500 font-sans"
                >
                  <option value="1:1">Kotak (1:1)</option>
                  <option value="16:9">Lanskap (16:9)</option>
                  <option value="9:16">Potret (9:16)</option>
                  <option value="4:3">Standar (4:3)</option>
                  <option value="3:4">Potret Standar (3:4)</option>
                  <option value="3:2">Foto (3:2)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 font-sans">Prompt Gambar</label>
              <textarea
                value={imageGenPrompt}
                onChange={(e) => setImageGenPrompt(e.target.value)}
                placeholder="Jelaskan detail gambar yang ingin Anda buat..."
                rows={3}
                className="w-full text-xs bg-gray-950 border border-border-color rounded-xl p-2.5 text-gray-300 placeholder-gray-650 focus:outline-none focus:border-indigo-500 resize-none font-sans"
              />
            </div>

            {imageGenResult && (
              <div className="relative rounded-xl overflow-hidden border border-white/5 aspect-video w-full bg-black/30 flex flex-col items-center justify-center p-2">
                <img src={imageGenResult} alt="Generated result" className="object-contain max-h-40 w-full rounded-lg" />
              </div>
            )}

            {imageGenError && (
              <p className="text-xs text-red-400 font-light">{imageGenError}</p>
            )}

            <div className="flex gap-2.5 mt-2 justify-end">
              {imageGenResult ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedFiles(prev => [
                        ...prev,
                        {
                          name: `flux_gen_${Date.now().toString().slice(-4)}.jpg`,
                          type: 'image/jpeg',
                          size: 100000,
                          content: imageGenResult
                        }
                      ]);
                      setImageGenResult('');
                      setImageGenPrompt('');
                      setIsShowImageGenModal(false);
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-555 text-white rounded-xl text-xs font-semibold transition text-center active:scale-95"
                  >
                    Attach to Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageGenResult('')}
                    className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold transition active:scale-95"
                  >
                    Reset
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsShowImageGenModal(false)}
                    className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-350 rounded-xl text-xs font-semibold transition active:scale-95"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateImage}
                    disabled={isGeneratingImage || !imageGenPrompt.trim()}
                    className="flex-1 py-2.5 bg-indigo-650 hover:bg-indigo-550 disabled:bg-gray-800 disabled:text-gray-650 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95 font-sans"
                  >
                    {isGeneratingImage ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        <span>Generating...</span>
                      </>
                    ) : (
                      <span>Generate</span>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Video Generation Modal */}
      {isShowVideoGenModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={() => setIsShowVideoGenModal(false)}>
          <div className="w-full max-w-md bg-gray-900 border border-border-color rounded-2xl overflow-hidden glass shadow-2xl p-6 flex flex-col gap-4 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Video className="text-pink-400" size={18} />
                <h3 className="text-sm font-bold text-gray-200 font-sans">AI Video Generator</h3>
              </div>
              <button
                onClick={() => {
                  if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
                  setIsShowVideoGenModal(false);
                }}
                className="text-gray-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 font-sans">Model Video</label>
              <select
                value={videoGenModel}
                onChange={(e) => setVideoGenModel(e.target.value)}
                className="w-full text-xs bg-gray-950 border border-border-color rounded-xl p-2.5 text-gray-300 focus:outline-none focus:border-indigo-500 font-sans"
              >
                <option value="google/veo-3.1">Google Veo 3.1 (Sangat Realistis)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 font-sans">Rasio Aspek</label>
                <select
                  value={videoGenRatio}
                  onChange={(e) => setVideoGenRatio(e.target.value)}
                  className="w-full text-xs bg-gray-950 border border-border-color rounded-xl p-2.5 text-gray-300 focus:outline-none focus:border-indigo-500 font-sans"
                >
                  <option value="16:9">Lanskap (16:9)</option>
                  <option value="9:16">Potret (9:16)</option>
                  <option value="1:1">Kotak (1:1)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 font-sans">Status Pekerjaan</label>
                <div className="w-full text-xs bg-gray-950/40 border border-border-color/60 rounded-xl p-2.5 text-gray-400 font-sans capitalize font-medium flex items-center gap-1.5">
                  {videoGenStatus === 'pending' && <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
                  {videoGenStatus === 'in_progress' && <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-spin border border-indigo-400 border-t-transparent"></span>}
                  {videoGenStatus === 'completed' && <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>}
                  {videoGenStatus === 'failed' && <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>}
                  {videoGenStatus === 'idle' && <span className="inline-block w-2 h-2 rounded-full bg-gray-650"></span>}
                  <span>{videoGenStatus}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1.5 font-sans">Prompt Video</label>
              <textarea
                value={videoGenPrompt}
                onChange={(e) => setVideoGenPrompt(e.target.value)}
                placeholder="Jelaskan detail pergerakan dan subjek video..."
                rows={3}
                disabled={isGeneratingVideo}
                className="w-full text-xs bg-gray-950 border border-border-color rounded-xl p-2.5 text-gray-300 placeholder-gray-650 focus:outline-none focus:border-indigo-500 resize-none font-sans"
              />
            </div>

            {videoGenResult && (
              <div className="relative rounded-xl overflow-hidden border border-white/5 aspect-video w-full bg-black/40 flex flex-col items-center justify-center p-1">
                <video src={videoGenResult} controls className="object-contain max-h-40 w-full rounded-lg" />
              </div>
            )}

            {videoGenError && (
              <p className="text-xs text-red-400 font-light">{videoGenError}</p>
            )}

            <div className="flex gap-2.5 mt-2 justify-end">
              {videoGenResult ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachedFiles(prev => [
                        ...prev,
                        {
                          name: `veo_gen_${Date.now().toString().slice(-4)}.mp4`,
                          type: 'video/mp4',
                          size: 1500000,
                          content: videoGenResult
                        }
                      ]);
                      setVideoGenResult('');
                      setVideoGenPrompt('');
                      setVideoGenStatus('idle');
                      setIsShowVideoGenModal(false);
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-555 text-white rounded-xl text-xs font-semibold transition text-center active:scale-95 font-sans"
                  >
                    Attach to Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setVideoGenResult('');
                      setVideoGenStatus('idle');
                    }}
                    className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold transition active:scale-95 font-sans"
                  >
                    Reset
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
                      setIsShowVideoGenModal(false);
                    }}
                    className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-350 rounded-xl text-xs font-semibold transition active:scale-95 font-sans"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateVideo}
                    disabled={isGeneratingVideo || !videoGenPrompt.trim()}
                    className="flex-1 py-2.5 bg-indigo-650 hover:bg-indigo-550 disabled:bg-gray-800 disabled:text-gray-650 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95 font-sans"
                  >
                    {isGeneratingVideo ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        <span>Generating (Polling)...</span>
                      </>
                    ) : (
                      <span>Generate Video</span>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
