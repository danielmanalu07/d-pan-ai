import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  createdAt: number;
}

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  content: string; // Base64 data URL
  textContent?: string; // Raw text if text-based file
  htmlContent?: string; // HTML preview (for docx/xlsx/etc)
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // The text prompt or AI response
  image?: string;  // Optional legacy single base64 data URL
  images?: string[]; // Optional multiple base64 data URLs
  files?: AttachedFile[]; // Uploaded files including images, pdfs, docs, etc.
  audioUrl?: string; // Optional generated audio response URL or base64 data URL
  timestamp: number;
}

interface DPanAIDB extends DBSchema {
  sessions: {
    key: string;
    value: ChatSession;
    indexes: { 'by-date': number };
  };
  messages: {
    key: string;
    value: ChatMessage;
    indexes: { 'by-session': string };
  };
}

const DATABASE_NAME = 'd-pan-ai-db';
const DATABASE_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<DPanAIDB>> | null = null;

function getDB(): Promise<IDBPDatabase<DPanAIDB>> | null {
  if (typeof window === 'undefined') return null;

  if (!dbPromise) {
    dbPromise = openDB<DPanAIDB>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('by-date', 'createdAt');
        }
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('by-session', 'sessionId');
        }
      },
    });
  }
  return dbPromise;
}

// Session CRUD
export async function createSession(model: string, title = 'New Chat'): Promise<ChatSession> {
  const db = await getDB();
  if (!db) throw new Error('IndexedDB is not available on the server');

  const session: ChatSession = {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    title,
    model,
    createdAt: Date.now(),
  };

  await db.put('sessions', session);
  return session;
}

export async function getSessions(): Promise<ChatSession[]> {
  const db = await getDB();
  if (!db) return [];

  const sessions = await db.getAll('sessions');
  return sessions.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSession(id: string): Promise<ChatSession | undefined> {
  const db = await getDB();
  if (!db) return undefined;
  return db.get('sessions', id);
}

export async function updateSessionTitle(id: string, title: string): Promise<void> {
  const db = await getDB();
  if (!db) return;

  const session = await db.get('sessions', id);
  if (session) {
    session.title = title;
    await db.put('sessions', session);
  }
}

export async function updateSessionModel(id: string, model: string): Promise<void> {
  const db = await getDB();
  if (!db) return;

  const session = await db.get('sessions', id);
  if (session) {
    session.model = model;
    await db.put('sessions', session);
  }
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;

  // Start a transaction to delete session and its associated messages
  const tx = db.transaction(['sessions', 'messages'], 'readwrite');
  await tx.objectStore('sessions').delete(id);

  // Delete messages belonging to session
  const msgStore = tx.objectStore('messages');
  const index = msgStore.index('by-session');
  const cursor = await index.openKeyCursor(IDBKeyRange.only(id));
  
  const deletePromises: Promise<any>[] = [];
  let currentCursor = cursor;
  while (currentCursor) {
    deletePromises.push(msgStore.delete(currentCursor.primaryKey));
    currentCursor = await currentCursor.continue();
  }
  await Promise.all(deletePromises);
  await tx.done;
}

export async function clearAllSessions(): Promise<void> {
  const db = await getDB();
  if (!db) return;

  const tx = db.transaction(['sessions', 'messages'], 'readwrite');
  await tx.objectStore('sessions').clear();
  await tx.objectStore('messages').clear();
  await tx.done;
}

// Message CRUD
export async function addMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  images?: string[],
  files?: AttachedFile[]
): Promise<ChatMessage> {
  const db = await getDB();
  if (!db) throw new Error('IndexedDB is not available on the server');

  const message: ChatMessage = {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    sessionId,
    role,
    content,
    images,
    files,
    timestamp: Date.now(),
  };

  await db.put('messages', message);
  return message;
}

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const db = await getDB();
  if (!db) return [];

  const index = db.transaction('messages', 'readonly').objectStore('messages').index('by-session');
  const messages = await index.getAll(IDBKeyRange.only(sessionId));
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateMessage(message: ChatMessage): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.put('messages', message);
}
