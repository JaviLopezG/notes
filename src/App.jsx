import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged, 
  signInWithCustomToken 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Share2, Lock, Globe, Check, Loader2, 
  User, AlertCircle, FilePlus, Trash2
} from 'lucide-react';

// --- 1. CONFIGURACIÓN ---
const firebaseConfig = {
  apiKey: "AIzaSyA_AKejhwFxXXbsS0iUH9s2QelAm65vvUI",
  authDomain: "collective-notes.firebaseapp.com",
  projectId: "collective-notes",
  storageBucket: "collective-notes.firebasestorage.app",
  messagingSenderId: "908059454070",
  appId: "1:908059454070:web:19ae752b668cc154e54d57"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const getNotesRef = () => collection(db, 'notes');

const updateUrl = (id) => {
  try {
    const url = new URL(window.location);
    url.searchParams.set('id', id);
    window.history.pushState({}, '', url);
  } catch (e) {
    console.warn('URL update blocked (sandbox).');
  }
};

const getUserColor = (uid) => {
    if (!uid) return '#374151'; 
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
        hash = uid.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
};

// --- COMPONENTE DE BLOQUE INDIVIDUAL ---
const NoteBlock = ({ block, index, userId, isReadOnly, onUpdate, onEnter, onMergePrevious, onMergeNext, onNavigate, focusRequest }) => {
    const textareaRef = useRef(null);
    const [isFresh, setIsFresh] = useState(false);
    
    // Gestión de Foco y Cursor
    useEffect(() => {
        // focusRequest: { id, cursor: 'start' | 'end' | 'all' | number }
        if (focusRequest && focusRequest.id === block.id && textareaRef.current) {
            textareaRef.current.focus();
            
            const len = block.text.length;
            if (focusRequest.cursor === 'end') {
                textareaRef.current.setSelectionRange(len, len);
            } else if (focusRequest.cursor === 'start') {
                textareaRef.current.setSelectionRange(0, 0);
            } else if (focusRequest.cursor === 'all') {
                textareaRef.current.select();
            } else if (typeof focusRequest.cursor === 'number') {
                // Soporte para posición exacta (usado al unir párrafos)
                textareaRef.current.setSelectionRange(focusRequest.cursor, focusRequest.cursor);
            }
        }
    }, [focusRequest, block.id]); 

    // Auto-resize
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [block.text]);

    // Tinta Fresca
    useEffect(() => {
        const isMyEdit = block.lastAuthorId === userId;
        if (!isMyEdit && block.updatedAt) {
            const updatedTime = block.updatedAt.toMillis ? block.updatedAt.toMillis() : block.updatedAt;
            const timeSinceEdit = Date.now() - updatedTime;
            if (timeSinceEdit < 7000) {
                setIsFresh(true);
                const timer = setTimeout(() => setIsFresh(false), 7000 - timeSinceEdit);
                return () => clearTimeout(timer);
            }
        }
        setIsFresh(false);
    }, [block.updatedAt, block.lastAuthorId, userId, block.text]);

    const handleKeyDown = (e) => {
        if (isReadOnly) return;
        
        const { selectionStart, selectionEnd, value } = e.target;
        const isCollapsed = selectionStart === selectionEnd;

        // ENTER: Dividir bloque
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const textBefore = value.slice(0, selectionStart);
            const textAfter = value.slice(selectionEnd);
            onEnter(index, textBefore, textAfter);
            return;
        }

        // BACKSPACE al inicio: Unir con anterior
        if (e.key === 'Backspace' && selectionStart === 0 && isCollapsed) {
            e.preventDefault();
            onMergePrevious(index);
            return;
        }

        // DELETE (Suprimir) al final: Unir con siguiente
        if (e.key === 'Delete' && selectionStart === value.length && isCollapsed) {
            e.preventDefault();
            onMergeNext(index);
            return;
        }

        // --- NAVEGACIÓN CON FLECHAS ---
        if (e.key === 'ArrowLeft' && selectionStart === 0 && isCollapsed) {
            e.preventDefault();
            onNavigate(index, 'prev');
        }
        if (e.key === 'ArrowRight' && selectionStart === value.length && isCollapsed) {
            e.preventDefault();
            onNavigate(index, 'next');
        }
        if (e.key === 'ArrowUp' && selectionStart === 0) {
             e.preventDefault();
             onNavigate(index, 'up');
        }
        if (e.key === 'ArrowDown' && selectionStart === value.length) {
             e.preventDefault();
             onNavigate(index, 'down');
        }
    };

    const userColor = getUserColor(block.lastAuthorId);

    return (
        <div className="relative group flex items-start gap-3 transition-all">
            <div 
                className={`mt-1.5 w-1 rounded-full transition-all duration-1000 ${isFresh ? 'h-5 opacity-100' : 'h-0 opacity-0'}`}
                style={{ backgroundColor: userColor }}
            />
            {isFresh && (
                <div className="absolute -top-5 left-0 text-[10px] text-white px-1.5 py-0.5 rounded shadow-sm opacity-80" style={{ backgroundColor: userColor }}>
                   User {block.lastAuthorId?.slice(0,4)}
                </div>
            )}

            <textarea
                ref={textareaRef}
                value={block.text}
                onChange={(e) => onUpdate(block.id, e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isReadOnly}
                rows={1}
                placeholder={isReadOnly ? "" : "Type / to insert or just start writing..."}
                style={{ 
                    color: isFresh ? userColor : undefined,
                    transition: 'color 1s ease'
                }}
                className={`flex-1 resize-none bg-transparent border-none outline-none p-0 text-lg leading-relaxed focus:ring-0 ${isReadOnly ? 'cursor-default text-gray-600' : 'text-gray-900'}`}
            />
        </div>
    );
};

// --- APP PRINCIPAL ---
export default function NoteApp() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [noteId, setNoteId] = useState(null);
  
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState([]); 
  const [ownerId, setOwnerId] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('idle'); 
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [focusRequest, setFocusRequest] = useState(null);

  const timeoutRef = useRef(null);
  const blocksRef = useRef([]);

  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try { await signInWithCustomToken(auth, __initial_auth_token); } 
        catch(e) { await signInAnonymously(auth); }
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) setNoteId(id);
    else createNewNote();
  }, [authLoading, user]);

  const createNewNote = async () => {
    setLoading(true);
    try {
      const firstBlock = { id: crypto.randomUUID(), text: 'Welcome! Start typing here...', lastAuthorId: user.uid, updatedAt: Date.now() };
      const newNote = {
        title: 'Untitled Note',
        ownerId: user.uid,
        isPublic: false,
        blocks: [firstBlock],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const docRef = await addDoc(getNotesRef(), newNote);
      setNoteId(docRef.id);
      updateUrl(docRef.id);
    } catch (err) {
      console.error(err);
      setErrorMsg("Error creating note.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!noteId) return;
    setLoading(true);
    const unsub = onSnapshot(doc(getNotesRef(), noteId), (snap) => {
      setLoading(false);
      if (snap.exists()) {
        const data = snap.data();
        setTitle(data.title || '');
        setOwnerId(data.ownerId || '');
        setIsPublic(data.isPublic || false);
        if (JSON.stringify(data.blocks) !== JSON.stringify(blocksRef.current)) {
            setBlocks(data.blocks || []);
        }
        setErrorMsg('');
      } else {
         if (!loading) { setNoteId(null); createNewNote(); }
      }
    }, (err) => {
      setLoading(false);
      if (err.code === 'permission-denied') setErrorMsg("Access denied.");
      else setErrorMsg("Error loading note.");
    });
    return () => unsub();
  }, [noteId]);

  const saveToFirestore = useCallback((updates) => {
    setStatus('saving');
    const payload = { ...updates, updatedAt: serverTimestamp() };
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      if (!noteId) return;
      try {
        await updateDoc(doc(getNotesRef(), noteId), payload);
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      } catch (err) {
        setStatus('error');
      }
    }, 1000);
  }, [noteId]);

  const handleUpdateBlock = (id, newText) => {
    const now = Date.now();
    const newBlocks = blocks.map(b => 
        b.id === id ? { ...b, text: newText, lastAuthorId: user.uid, updatedAt: now } : b
    );
    setBlocks(newBlocks);
    saveToFirestore({ blocks: newBlocks });
  };

  const handleEnter = (index, textBefore = null, textAfter = "") => {
    const newId = crypto.randomUUID();
    const now = Date.now();
    const newBlocks = [...blocks];

    if (textBefore !== null) {
        newBlocks[index] = { 
            ...newBlocks[index], 
            text: textBefore, 
            lastAuthorId: user.uid, 
            updatedAt: now 
        };
    }

    const newBlock = { 
        id: newId, 
        text: textAfter, 
        lastAuthorId: user.uid, 
        updatedAt: now 
    };

    newBlocks.splice(index + 1, 0, newBlock);
    setBlocks(newBlocks);
    setFocusRequest({ id: newId, cursor: 'start' });
    saveToFirestore({ blocks: newBlocks });
  };

  // --- LÓGICA DE FUSIÓN (MERGE) ---
  
  // Backspace al inicio: une con el anterior
  const handleMergePrevious = (index) => {
    if (index <= 0) return;
    const prevBlock = blocks[index - 1];
    const currentBlock = blocks[index];
    
    // El cursor debe ir al final de lo que tenía el bloque anterior
    const prevLength = prevBlock.text.length; 
    const newText = prevBlock.text + currentBlock.text;
    const now = Date.now();

    // Actualizamos el bloque anterior
    const updatedPrev = { 
        ...prevBlock, 
        text: newText, 
        lastAuthorId: user.uid, 
        updatedAt: now 
    };
    
    // Eliminamos el bloque actual
    const newBlocks = blocks.filter((_, i) => i !== index);
    newBlocks[index - 1] = updatedPrev;
    
    setBlocks(newBlocks);
    setFocusRequest({ id: prevBlock.id, cursor: prevLength });
    saveToFirestore({ blocks: newBlocks });
  };

  // Delete al final: une con el siguiente
  const handleMergeNext = (index) => {
    if (index >= blocks.length - 1) return;
    const currentBlock = blocks[index];
    const nextBlock = blocks[index + 1];
    
    // El cursor se queda donde está (al final del bloque actual antes de unir)
    const currentLength = currentBlock.text.length;
    const newText = currentBlock.text + nextBlock.text;
    const now = Date.now();

    // Actualizamos el bloque actual
    const updatedCurrent = { 
        ...currentBlock, 
        text: newText, 
        lastAuthorId: user.uid, 
        updatedAt: now 
    };
    
    // Eliminamos el bloque siguiente
    const newBlocks = blocks.filter((_, i) => i !== index + 1);
    newBlocks[index] = updatedCurrent;
    
    setBlocks(newBlocks);
    setFocusRequest({ id: currentBlock.id, cursor: currentLength });
    saveToFirestore({ blocks: newBlocks });
  };

  const handleNavigate = (index, direction) => {
    let targetIndex = -1;
    let cursorPosition = 'end';

    if (direction === 'prev' || direction === 'up') {
        if (index > 0) {
            targetIndex = index - 1;
            cursorPosition = 'end'; 
        }
    } else if (direction === 'next' || direction === 'down') {
        if (index < blocks.length - 1) {
            targetIndex = index + 1;
            cursorPosition = 'start';
        }
    }

    if (targetIndex !== -1) {
        setFocusRequest({ id: blocks[targetIndex].id, cursor: cursorPosition });
    }
  };

  const handleTitleChange = (val) => { setTitle(val); saveToFirestore({ title: val }); };

  const handleCopy = () => {
    let url = window.location.href;
    if (!url.includes('id=')) url = window.location.origin + window.location.pathname + '?id=' + noteId;
    navigator.clipboard.writeText(url);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const isOwner = user && ownerId === user.uid;
  const canEdit = isOwner || isPublic;
  const isReadOnly = !canEdit;

  if (authLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-indigo-600"/></div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur-md px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <FilePlus className="h-5 w-5" />
            </div>
            <div className="hidden sm:block">
                <h1 className="text-sm font-bold">Note Share</h1>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    {status === 'saving' && "Saving..."}
                    {status === 'saved' && "Saved"}
                    {status === 'error' && "Error"}
                    {status === 'idle' && (isOwner ? "Owner" : (canEdit ? "Guest" : "Reader"))}
                </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOwner && (
                <button
                    onClick={() => {
                        const newVal = !isPublic;
                        setIsPublic(newVal);
                        saveToFirestore({ isPublic: newVal });
                    }}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        isPublic ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                >
                    {isPublic ? <Globe className="w-3 h-3"/> : <Lock className="w-3 h-3"/>}
                    <span className="hidden sm:inline">{isPublic ? "Public" : "Private"}</span>
                </button>
            )}
            <button onClick={handleCopy} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">
              {copyFeedback ? <Check className="w-4 h-4 text-green-600"/> : <Share2 className="w-4 h-4"/>}
              <span className="hidden sm:inline">Share</span>
            </button>
            <button onClick={() => { setNoteId(null); createNewNote(); }} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">
                New
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {errorMsg && (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
                <AlertCircle className="h-5 w-5" />
                {errorMsg}
            </div>
        )}

        <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            disabled={!isOwner}
            placeholder="Untitled Note"
            className={`block w-full border-0 border-b-2 bg-transparent py-2 text-4xl font-bold tracking-tight focus:ring-0 ${!isOwner ? 'cursor-default border-transparent' : 'focus:border-indigo-600 border-transparent hover:border-gray-200'}`}
        />

        <div className={`min-h-[50vh] space-y-1 pb-32 ${!canEdit ? 'opacity-80' : ''}`}>
            {blocks.map((block, index) => (
                <NoteBlock 
                    key={block.id}
                    index={index}
                    block={block}
                    userId={user?.uid}
                    isReadOnly={isReadOnly}
                    onUpdate={handleUpdateBlock}
                    onEnter={handleEnter}
                    onMergePrevious={handleMergePrevious}
                    onMergeNext={handleMergeNext}
                    onNavigate={handleNavigate}
                    focusRequest={focusRequest}
                />
            ))}
            
            {canEdit && (
                <div 
                    className="h-32 cursor-text" 
                    onClick={() => {
                        if (blocks.length > 0) setFocusRequest({ id: blocks[blocks.length - 1].id, cursor: 'end' });
                        else {
                            const newId = crypto.randomUUID();
                            const newBlock = { id: newId, text: "", lastAuthorId: user.uid, updatedAt: Date.now() };
                            setBlocks([newBlock]);
                            saveToFirestore({ blocks: [newBlock] });
                        }
                    }}
                />
            )}
        </div>
      </main>
    </div>
  );
}
