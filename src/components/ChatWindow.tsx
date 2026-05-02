import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, limit, deleteDoc, arrayUnion, arrayRemove, deleteField, getDocs, writeBatch, increment } from 'firebase/firestore';
import { Message, UserProfile, Chat } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MoreVertical, Smile, ArrowRight, ArrowLeft, X, Image as ImageIcon, FileText, Loader2, Check, CheckCheck, MapPin, Map, Trash2, Gamepad2, ShieldAlert, UserPlus, LogOut, ShieldCheck, UserMinus, User, Unlock, Lock, Trophy, MessageSquare, BadgeCheck, Plus, RotateCcw, Download, Coins, Dices, Star, Mic, Square, Camera, Phone, Video, Bell, Bot } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ar } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { getSystemBotResponse } from '@/lib/gemini';
import { CardGame21, createDeck, calculateScore } from './CardGame21';
import LudoGame from './LudoGame';
import { XOGame } from './XOGame';
import { ChessGame } from './ChessGame';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { useStore } from '@/store/useStore';
import { translations } from '@/lib/i18n';
import { getNameColorClass, isMagicColor } from '@/lib/utils';
import { GifPicker } from './GifPicker';
import { VoicePlayer } from './VoicePlayer';
import { CameraModal } from './CameraModal';
import CallSystem from './CallSystem';

import { Checkbox } from '@/components/ui/checkbox';
import { NOTIFICATION_SOUNDS } from '@/constants';

const XOGameSync = ({ gameId, currentUser }: { gameId: string, currentUser: any }) => {
  const [gameData, setGameData] = useState<any>(null);

  useEffect(() => {
    return onSnapshot(doc(db, 'games', gameId), (snapshot) => {
      if (snapshot.exists()) setGameData(snapshot.data());
    });
  }, [gameId]);

  if (!gameData) return <div className="flex items-center justify-center h-full text-xs font-bold text-muted-foreground">جاري التحميل...</div>;

  const isPlayerTurn = gameData.turn === currentUser.uid;
  
  const handleMove = async (newBoard: any, winner: any) => {
    if (!isPlayerTurn || gameData.status === 'finished') return;
    if (useStore.getState().quotaExceeded) return;
    
    // Switch turn
    const nextTurn = gameData.players.find((uid: string) => uid !== currentUser.uid);
    const newStatus = winner ? 'finished' : 'playing';

    try {
      await updateDoc(doc(db, 'games', gameId), {
        board: newBoard,
        turn: nextTurn,
        winner: winner,
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      if (err.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <XOGame 
        gameState={gameData.board} 
        isPlayerTurn={isPlayerTurn} 
        gameWinner={gameData.winner}
        onMove={handleMove}
      />
    </div>
  );
};

const ChessGameSync = ({ gameId, currentUser }: { gameId: string, currentUser: any }) => {
  const [gameData, setGameData] = useState<any>(null);

  useEffect(() => {
    return onSnapshot(doc(db, 'games', gameId), (snapshot) => {
      if (snapshot.exists()) setGameData(snapshot.data());
    });
  }, [gameId]);

  if (!gameData) return <div className="flex items-center justify-center h-full text-xs font-bold text-muted-foreground">جاري التحميل...</div>;

  const isPlayerTurn = gameData.turn === currentUser.uid;
  
  const handleMove = async (newFen: string, winner: any) => {
    if (!isPlayerTurn || gameData.status === 'finished') return;
    if (useStore.getState().quotaExceeded) return;
    
    const nextTurn = gameData.players.find((uid: string) => uid !== currentUser.uid);
    const newStatus = winner ? 'finished' : 'playing';

    try {
      await updateDoc(doc(db, 'games', gameId), {
        fen: newFen,
        turn: nextTurn,
        winner: winner,
        status: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      if (err.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <ChessGame 
        gameState={gameData.fen} 
        isPlayerTurn={isPlayerTurn} 
        gameWinner={gameData.winner}
        onMove={handleMove}
      />
    </div>
  );
};

export function ChatWindow({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { profile: currentUser, setViewingProfileId, setShowProfile, language, autoDownloadMedia, lowDataMode, updateDataStats } = useStore();
  const t = translations[language];
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatData, setChatData] = useState<Chat | null>(null);
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [participants, setParticipants] = useState<Record<string, UserProfile>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [reactionMenuMessageId, setReactionMenuMessageId] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [liveWatchId, setLiveWatchId] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (liveWatchId !== null) {
        navigator.geolocation.clearWatch(liveWatchId);
      }
    };
  }, [liveWatchId]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [activeGameType, setActiveGameType] = useState<'blackjack' | 'xo' | 'chess' | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [downloadedMessages, setDownloadedMessages] = useState<Set<string>>(new Set());
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showManageAdmin, setShowManageAdmin] = useState<{ uid: string; displayName: string } | null>(null);
  const [adminPerms, setAdminPerms] = useState({
    canChangeInfo: true,
    canKick: true,
    canLockChat: false,
    canDeleteMessages: false,
    canAddAdmins: false
  });
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null);
  const [showGameCenter, setShowGameCenter] = useState(false);
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [recordingMode, setRecordingMode] = useState<'voice' | 'video'>('voice');
  const [activeRealCall, setActiveRealCall] = useState<{ type: 'voice' | 'video'; isCaller: boolean; callId: string } | null>(null);
  const [incomingCallData, setIncomingCallData] = useState<any>(null);
  const [activeCall, setActiveCall] = useState<{ type: 'voice' | 'video'; status: 'calling' | 'active' | 'ended' } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isVideoMessageRecording, setIsVideoMessageRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [videoRecorder, setVideoRecorder] = useState<MediaRecorder | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingStateRef = useRef<boolean>(false);
  const pendingReadIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (reactionMenuMessageId) {
        setReactionMenuMessageId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let otherProfileUnsubscribe: (() => void) | null = null;
    setLoadingMessages(true);

    const fetchProfiles = async (data: Chat) => {
      // Step 1: Use denormalized data (Zero server read cost since we already have the chat doc)
      if (data.participantProfiles) {
        if (!data.isGroup) {
          const otherId = data.participants.find(p => p !== currentUser?.uid);
          if (otherId && data.participantProfiles[otherId]) {
            setOtherProfile(data.participantProfiles[otherId] as UserProfile);
          }
        } else {
          setParticipants(data.participantProfiles as Record<string, UserProfile>);
        }
      }

      // Step 2: Search in current user's friendDetails (Loaded in App store)
      if (!data.isGroup) {
        const otherId = data.participants.find(p => p !== currentUser?.uid);
        if (otherId && !otherProfile) {
          const friendDetail = currentUser?.friendDetails?.[otherId];
          if (friendDetail) {
            setOtherProfile(friendDetail as any);
          }
        }
      }

      // Step 3: Minimal fallback fetch (Single Doc read if not friend or denormalized)
      if (!data.isGroup) {
        const otherId = data.participants.find((p: string) => p !== currentUser?.uid);
        if (otherId && !otherProfile) {
          try {
            const snapshot = await getDoc(doc(db, 'users', otherId));
            if (snapshot.exists()) {
              setOtherProfile(snapshot.data() as UserProfile);
            }
          } catch (err) {
            console.error("Minimal profile fetch error:", err);
          }
        }
      } else {
        // Fallback for group members
        const missingIds = data.participants.filter(p => !data.participantProfiles?.[p] && !participants[p]);
        if (missingIds.length > 0) {
          try {
            const participantProfiles: Record<string, UserProfile> = { ...participants };
            for (let i = 0; i < missingIds.length; i += 30) {
              const chunk = missingIds.slice(i, i + 30);
              const q = query(collection(db, 'users'), where('uid', 'in', chunk));
              const querySnapshot = await getDocs(q);
              querySnapshot.forEach(d => {
                const pData = d.data() as UserProfile;
                participantProfiles[pData.uid] = pData;
              });
            }
            setParticipants(participantProfiles);
          } catch (err: any) {
            console.error("Group profiles fetch error:", err);
            if (err.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
          }
        }
      }
    };

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
      const msgData = snapshot.docs.map(doc => {
        const data = doc.data();
        const message = { 
          id: doc.id, 
          ...data,
          // Latency compensation: Use now() if server timestamp hasn't arrived yet
          createdAt: data.createdAt || { toMillis: () => Date.now(), seconds: Math.floor(Date.now()/1000) }
        } as Message;
        return message;
      });
      
      // Strict client-side sort to ensure correct order regardless of server index state
      msgData.sort((a, b) => {
        const getTime = (ca: any) => {
          if (!ca) return Date.now();
          if (typeof ca.toMillis === 'function') return ca.toMillis();
          if (ca.seconds) return ca.seconds * 1000;
          if (ca instanceof Date) return ca.getTime();
          return Date.now();
        };
        return getTime(a.createdAt) - getTime(b.createdAt);
      });

      setMessages(msgData);
      setLoadingMessages(false);
      
      // Track received data
      if (messages.length > 0) {
        const newMsgs = msgData.filter(m => !messages.find(prev => prev.id === m.id) && m.senderId !== currentUser?.uid);
        if (newMsgs.length > 0) {
          let mediaKB = 0;
          newMsgs.forEach(m => {
            if (m.type === 'image' || m.type === 'file' || m.type === 'voice') {
              if (autoDownloadMedia) mediaKB += 50; 
            }
          });
          updateDataStats({ messagesReceived: newMsgs.length, mediaDownloaded: mediaKB });
        }
      }
      
      // Batch handle unread status to avoid snapshot loop
      const unreadIds = msgData
        .filter(msg => !msg.read && msg.senderId !== currentUser?.uid && !pendingReadIds.current.has(msg.id))
        .map(msg => msg.id);

      if (unreadIds.length > 0) {
        unreadIds.forEach(id => pendingReadIds.current.add(id));
        
        // Wait 1s and commit
        setTimeout(async () => {
          if (unreadIds.length === 0) return;
          const batch = writeBatch(db);
          unreadIds.forEach((id) => {
            batch.update(doc(db, 'chats', chatId, 'messages', id), { read: true });
          });
          try {
            await batch.commit();
          } catch (err) {
            console.error("Error marking as read (batch):", err);
            // Don't remove from pending immediately to avoid hammering on quota error
            setTimeout(() => {
              unreadIds.forEach(id => pendingReadIds.current.delete(id));
            }, 60000); // Wait 1 minute before allowing retry
          }
        }, 1000);
      }
      
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    }, (error: any) => {
      console.error("Messages snapshot error:", error);
      setLoadingMessages(false);
      if (error.code === 'resource-exhausted' || error.message?.includes('quota')) {
        const store = useStore.getState();
        if (!store.quotaExceeded) {
          store.setQuotaExceeded(true);
          store.setAppAlert({
            id: 'quota-error-msg',
            message: 'تنبيه: لقد استهلكت حصة البيانات المتاحة اليوم. سيتم استئناف الخدمة غداً.',
            type: 'warning'
          });
        }
      }
      if (error.code === 'permission-denied') {
        onClose();
      }
    });

    // Listen for chat updates (typing, calls, etc)
    const chatUnsubscribe = onSnapshot(doc(db, 'chats', chatId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Chat;
        setChatData(data);
        
        // Fetch profiles if they haven't been loaded yet
        if (!otherProfile && !data.isGroup) fetchProfiles(data);
        if (Object.keys(participants).length === 0 && data.isGroup) fetchProfiles(data);
 
        const typing = data.typing || {};
        const typingIds = Object.keys(typing).filter(uid => typing[uid] && uid !== currentUser?.uid);
        setTypingUsers(typingIds);

        // Clear my unread count if it's > 0
        const myUnread = data.unreadCount?.[currentUser?.uid || ''] || 0;
        const myMentions = data.mentionsCount?.[currentUser?.uid || ''] || 0;
        
        if ((myUnread > 0 || myMentions > 0) && !useStore.getState().quotaExceeded) {
          const updates: any = {};
          if (myUnread > 0) updates[`unreadCount.${currentUser?.uid}`] = 0;
          if (myMentions > 0) updates[`mentionsCount.${currentUser?.uid}`] = 0;
          
          if (Object.keys(updates).length > 0) {
            updateDoc(doc(db, 'chats', chatId), updates).catch(err => {
              if (err.code === 'resource-exhausted' || err.message?.includes('quota')) {
                useStore.getState().setQuotaExceeded(true);
              } else {
                console.error("Error clearing counts:", err);
              }
            });
          }
        }
      }
    }, (error: any) => {
      console.error("Chat snapshot error:", error);
      if (error.code === 'resource-exhausted' || error.message?.includes('quota')) {
        const store = useStore.getState();
        if (!store.quotaExceeded) {
          store.setQuotaExceeded(true);
          store.setAppAlert({
            id: 'quota-error-chat',
            message: 'تنبيه: لقد استهلكت حصة البيانات المتاحة اليوم.',
            type: 'warning'
          });
        }
      }
      if (error.code === 'permission-denied') {
        onClose();
      }
    });

    return () => {
      unsubscribe();
      chatUnsubscribe();
      if (otherProfileUnsubscribe) otherProfileUnsubscribe();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Clear typing status on unmount
      if (typingStateRef.current) {
        updateDoc(doc(db, 'chats', chatId), {
          [`typing.${currentUser.uid}`]: false
        }).catch(err => console.error("Error clearing typing on unmount:", err));
      }
    };
  }, [chatId, currentUser]);

  const updateTypingStatus = async (isTyping: boolean) => {
    if (!currentUser || typingStateRef.current === isTyping) return;
    
    // Check quota before trying to write
    if (useStore.getState().quotaExceeded) return;

    try {
      typingStateRef.current = isTyping;
      await updateDoc(doc(db, 'chats', chatId), {
        [`typing.${currentUser.uid}`]: isTyping
      });
    } catch (err: any) {
      if (err.code === 'resource-exhausted') {
        useStore.getState().setQuotaExceeded(true);
      } else {
        console.error("Error updating typing status:", err);
      }
    }
  };

  const sendVoiceMessage = async (audioUrl: string) => {
    if (!currentUser || !chatData || useStore.getState().quotaExceeded) return;

    const msgData = {
      chatId,
      senderId: currentUser.uid,
      type: 'voice',
      fileUrl: audioUrl,
      text: '🎤 تسجيل صوتي',
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
      updateDataStats({ messagesSent: 1, mediaUploaded: Math.ceil(audioUrl.length * 0.75 / 1024) });
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: '🎤 تسجيل صوتي',
          senderId: currentUser.uid,
          createdAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      if (err.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
      console.error("Error sending voice message:", err);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine supported mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') 
        ? 'audio/webm' 
        : MediaRecorder.isTypeSupported('audio/mp4') 
          ? 'audio/mp4' 
          : 'audio/aac';

      const newRecorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      newRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      newRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size > 0) {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            // Limit size to ~1MB for Firestore (Base64 is ~33% larger than binary)
            if (base64Audio.length > 900000) {
              alert("التسجيل طويل جداً، يرجى إرسال تسجيلات أقصر");
              return;
            }
            await sendVoiceMessage(base64Audio);
          };
        }
        stream.getTracks().forEach(track => track.stop());
      };

      newRecorder.start();
      setRecorder(newRecorder);
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 119) { // 2 minutes limit
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error("Error starting recording:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert("فشل الوصول إلى الميكروفون. يرجى التأكد من منح التطبيق صلاحية استخدام الميكروفون من إعدادات المتصفح.");
      } else {
        alert("حدث خطأ أثناء محاولة التسجيل. يرجى المحاولة مرة أخرى.");
      }
    }
  };

  const stopRecording = () => {
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
  };

  const shouldSendVideoAfterStop = useRef(false);

  const startVideoMessageRecording = async () => {
    try {
      shouldSendVideoAfterStop.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: { 
          width: { ideal: 400 }, 
          height: { ideal: 400 },
          facingMode: 'user'
        } 
      });
      videoStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm') 
          ? 'video/webm' 
          : 'video/mp4';

      const newRecorder = new MediaRecorder(stream, { mimeType });
      videoChunksRef.current = [];

      newRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };

      newRecorder.onstop = async () => {
        const videoBlob = new Blob(videoChunksRef.current, { type: mimeType });
        if (videoBlob.size > 0) {
          if (shouldSendVideoAfterStop.current) {
            sendVideoMessage(videoBlob);
          } else {
            setVideoPreviewUrl(URL.createObjectURL(videoBlob));
          }
        }
        stream.getTracks().forEach(track => track.stop());
      };

      newRecorder.start();
      setVideoRecorder(newRecorder);
      setIsVideoMessageRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 60) { // 60s limit
            stopVideoMessageRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      console.error("Error starting video recording:", err);
      alert("فشل الوصول إلى الكاميرا أو الميكروفون");
    }
  };

  const stopVideoMessageRecording = (sendDirectly = false) => {
    shouldSendVideoAfterStop.current = sendDirectly;
    if (videoRecorder && videoRecorder.state !== 'inactive') {
      videoRecorder.stop();
    }
    // Don't hide recording UI immediately if we are sending directly to prevent flicker
    if (!sendDirectly) {
      setIsVideoMessageRecording(false);
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
  };

  const sendVideoMessage = async (videoBlob: Blob) => {
    if (!currentUser || !chatData || useStore.getState().quotaExceeded) return;

    setIsUploading(true);
    // If we were in recording mode, now we can close it
    setIsVideoMessageRecording(false);
    
    const reader = new FileReader();
    reader.readAsDataURL(videoBlob);
    reader.onloadend = async () => {
      const base64Video = reader.result as string;
      
      // Strict size check for Firestore (1MB limit)
      if (base64Video.length > 980000) {
        alert("الفيديو طويل جداً، يرجى تسجيل مقطع أقصر (أقل من 15 ثانية)");
        setIsUploading(false);
        return;
      }

      const msgData = {
        chatId,
        senderId: currentUser.uid,
        type: 'video_note',
        fileUrl: base64Video,
        text: '📹 رسالة مرئية',
        createdAt: serverTimestamp()
      };

      try {
        await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
        updateDataStats({ messagesSent: 1, mediaUploaded: Math.ceil(base64Video.length * 0.75 / 1024) });
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: {
            text: '📹 رسالة مرئية',
            senderId: currentUser.uid,
            createdAt: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        });
        setVideoPreviewUrl(null);
      } catch (err: any) {
        console.error("Error sending video message:", err);
        if (err.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
      } finally {
        setIsUploading(false);
      }
    };
  };

  const cancelRecording = () => {
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    setIsRecording(false);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
    recorder?.stream.getTracks().forEach(track => track.stop());
  };

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  useEffect(() => {
    if (!currentUser) return;
    

    const q = query(
      collection(db, 'calls'), 
      where('receiverId', '==', currentUser.uid), 
      where('status', '==', 'calling'),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const callData: any = { ...snapshot.docs[0].data(), id: snapshot.docs[0].id };
        setIncomingCallData(callData);
        
        // Trigger Notification
        if (Notification.permission === 'granted' && document.hidden) {
          const callType = callData.type === 'video' ? 'فيديو' : 'صوتية';
          new Notification(`مكالمة ${callType} واردة`, {
            body: `يتصل بك ${otherProfile?.displayName || 'مستخدم'}`,
            icon: otherProfile?.photoURL || '/logo.png',
            tag: 'incoming-call'
          });
        }
      } else {
        setIncomingCallData(null);
      }
    }, (err) => console.error("Call listener error:", err));
    return () => unsubscribe();
  }, [currentUser, otherProfile]);

  const answerCall = (data: any) => {
    setActiveRealCall({ type: data.type, isCaller: false, callId: data.id });
    setIncomingCallData(null);
  };

  const initiateCall = async (type: 'voice' | 'video') => {
    if (useStore.getState().quotaExceeded) return;
    setActiveRealCall({ type, isCaller: true, callId: '' });
  };

  const handleGifSelect = async (gif: any, type: 'image' | 'sticker' = 'image') => {
    if (!currentUser || !chatData || useStore.getState().quotaExceeded) return;
    setShowGifPicker(false);

    const msgData = {
      chatId,
      senderId: currentUser.uid,
      type: type,
      fileUrl: gif.images.fixed_height.url,
      text: type === 'sticker' ? 'ملصق' : 'GIF',
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: '🎬 GIF',
          senderId: currentUser.uid,
          createdAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      if (err.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
      console.error("Error sending GIF:", err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    } else {
      updateTypingStatus(true);
    }

    typingTimeoutRef.current = setTimeout(() => {
      updateTypingStatus(false);
      typingTimeoutRef.current = null;
    }, 3000);
  };

  const cancelReplyOrEdit = () => {
    setReplyingTo(null);
    setEditingMessage(null);
    setNewMessage('');
  };

  const handleLongPress = (msg: Message) => {
    // Clear any existing menu first
    setReactionMenuMessageId(null);
    const timer = setTimeout(() => {
      setReactionMenuMessageId(msg.id);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
    setLongPressTimer(timer);
  };

  const handlePointerMove = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handlePressEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !currentUser || !chatData) return;

    // Check Blocking
    if (!chatData?.isGroup) {
      const myBlocked = Array.isArray(currentUser.blockedUsers) ? currentUser.blockedUsers : [];
      const otherBlocked = Array.isArray(otherProfile?.blockedUsers) ? otherProfile.blockedUsers : [];
      
      if (myBlocked.includes(otherProfile?.uid || '')) {
        alert('لقد قمت بحظر هذا المستخدم. قم بإلغاء الحظر لتتمكن من المراسلة.');
        return;
      }
      if (otherBlocked.includes(currentUser.uid)) {
        alert('لا يمكنك إرسال رسائل لهذا المستخدم حالياً.');
        return;
      }
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      updateTypingStatus(false);
      typingTimeoutRef.current = null;
    }

    const text = newMessage;
    
    if (editingMessage) {
      if (useStore.getState().quotaExceeded) {
        alert('لا يمكن تعديل الرسالة بسبب استهلاك حصة البيانات اليومية.');
        return;
      }
      try {
        await updateDoc(doc(db, 'chats', chatId, 'messages', editingMessage.id), {
          text,
          isEdited: true
        });
        setEditingMessage(null);
        setNewMessage('');
        return;
      } catch (err: any) {
        if (err.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
        console.error("Error editing message:", err);
      }
    }

    if (useStore.getState().quotaExceeded) return;
    setNewMessage('');
    setShowEmojiPicker(false);

    const msgData: any = {
      chatId,
      senderId: currentUser.uid,
      text,
      type: 'text',
      createdAt: serverTimestamp()
    };

    if (replyingTo) {
      const senderName = replyingTo.senderId === currentUser.uid 
        ? 'أنت' 
        : (participants[replyingTo.senderId]?.displayName || otherProfile?.displayName || 'مستخدم');
        
      msgData.replyTo = {
        id: replyingTo.id,
        text: replyingTo.text || (replyingTo.type === 'image' ? 'الصورة' : 'ملف'),
        senderName
      };
      setReplyingTo(null);
    }

    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
      updateDataStats({ messagesSent: 1 });
      
      const chatUpdates: any = {
        lastMessage: {
          text,
          senderId: currentUser.uid,
          createdAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      };

      // Detect mentions
      const mentionEveryone = text?.includes('@Everyone') || text?.includes('@الكل');
      
      // Increment unread count for other participants
      chatData.participants.forEach(uid => {
        if (uid !== currentUser.uid) {
          chatUpdates[`unreadCount.${uid}`] = increment(1);
          
          // Mentions logic
          const participant = participants[uid] || (otherProfile?.uid === uid ? otherProfile : null);
          const isMentioned = mentionEveryone || (participant?.displayName && text?.includes(`@${participant.displayName}`));
          
          if (isMentioned) {
            chatUpdates[`mentionsCount.${uid}`] = increment(1);
          }
        }
      });

      await updateDoc(doc(db, 'chats', chatId), chatUpdates);

      // AI Response if messaging system bot (direct or in group)
      const isSystemBotInChat = otherProfile?.uid === 'teleiraq-system' || 
                                chatId === 'teleiraq-system' || 
                                (chatData?.isGroup && chatData?.participants?.includes('teleiraq-system'));

      if (isSystemBotInChat) {
        setIsTyping(true);
        
        // Prepare history for Gemini
        const history = messages.slice(-10).map(m => {
          let messageText = m.text || '';
          // For group chats, add sender name to history so AI knows who is speaking
          if (chatData?.isGroup && m.senderId !== 'teleiraq-system') {
            const senderName = participants[m.senderId]?.displayName || 'مستخدم';
            messageText = `${senderName}: ${messageText}`;
          }
          
          return {
            role: m.senderId === 'teleiraq-system' ? 'model' : 'user' as 'model' | 'user',
            parts: [{ text: messageText }]
          };
        });

        // Context for group chat
        const context = chatData?.isGroup ? {
          isGroup: true,
          groupName: chatData.groupName,
          participants: Object.values(participants).map(p => (p as UserProfile).displayName)
            .filter(Boolean) as string[]
        } : { isGroup: false };

        // For the current message, also include name if it's a group
        let currentMessageWithContext = text;
        if (chatData?.isGroup && currentUser) {
          currentMessageWithContext = `${currentMessageWithContext}`.startsWith(currentUser.displayName || 'مستخدم') ? text : `${currentUser.displayName || 'مستخدم'}: ${text}`;
        }

        const aiReply = await getSystemBotResponse(currentMessageWithContext, history, context);
        
        // Check quota again before bot reply write
        if (useStore.getState().quotaExceeded) {
          setIsTyping(false);
          return;
        }

        const replyData = {
          chatId,
          senderId: 'teleiraq-system',
          text: aiReply,
          type: 'text',
          createdAt: serverTimestamp()
        };

        await addDoc(collection(db, 'chats', chatId, 'messages'), replyData);
        
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: {
            text: aiReply,
            senderId: 'teleiraq-system',
            createdAt: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        });
        setIsTyping(false);
      }
    } catch (err: any) {
      if (err.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
      console.error("Error sending message:", err);
      setIsTyping(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser || useStore.getState().quotaExceeded) return;

    // Use lowDataMode to restrict size further (e.g. 500KB)
    const maxSize = lowDataMode ? 500 * 1024 : 950 * 1024;
    
    if (file.size > maxSize) {
      if (lowDataMode) {
        alert('وضع توفير البيانات مفعل. الحد الأقصى للملفات هو 500 كيلوبايت. قم بتعطيل الوضع من الإعدادات لإرسال ملفات أكبر.');
      } else {
        alert('الملف كبير جداً. الحد الأقصى هو 1 ميجابايت لضمان النقل بدقة 8K.');
      }
      return;
    }

    if (file.size > 700 * 1024) {
      useStore.getState().setAppAlert({
        id: 'nearing-limit',
        message: 'تنبيه: حجم الملف يقترب من الحد الأقصى (1 ميجابايت). قد تواجه مشاكل في الأداء.',
        type: 'info'
      });
    }

    setIsUploading(true);
    setUploadProgress(0);
    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(progress);
      }
    };

    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const isImage = file.type.startsWith('image/');
      
      const msgData = {
        chatId,
        senderId: currentUser.uid,
        type: isImage ? 'image' : 'file',
        fileUrl: base64,
        fileName: file.name,
        createdAt: serverTimestamp()
      };

      try {
        await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
        updateDataStats({ messagesSent: 1, mediaUploaded: Math.ceil(file.size / 1024) });
        
        const chatUpdates: any = {
          lastMessage: {
            text: isImage ? '📷 صورة' : `📄 ${file.name}`,
            senderId: currentUser.uid,
            createdAt: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        };

        // Increment unread count for other participants
        chatData?.participants.forEach(uid => {
          if (uid !== currentUser.uid) {
            chatUpdates[`unreadCount.${uid}`] = increment(1);
          }
        });

        await updateDoc(doc(db, 'chats', chatId), chatUpdates);
      } catch (err: any) {
        console.error("Upload error:", err);
        if (err.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
        useStore.getState().setAppAlert({
          id: Date.now().toString(),
          message: err.code === 'resource-exhausted' ? 'فشل الرفع: تم استهلاك حصة البيانات اليومية' : 'فشل رفع الملف. يرجى المحاولة مرة أخرى.',
          type: 'error'
        });
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = async (base64Image: string) => {
    if (!currentUser || !chatData || useStore.getState().quotaExceeded) return;

    setIsUploading(true);
    setUploadProgress(100);

    const msgData = {
      chatId,
      senderId: currentUser.uid,
      type: 'image',
      fileUrl: base64Image,
      text: '📷 صورة سيلفي',
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
      
      const chatUpdates: any = {
        lastMessage: {
          text: '📷 صورة سيلفي',
          senderId: currentUser.uid,
          createdAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      };

      chatData?.participants.forEach(uid => {
        if (uid !== currentUser.uid) {
          chatUpdates[`unreadCount.${uid}`] = increment(1);
        }
      });

      await updateDoc(doc(db, 'chats', chatId), chatUpdates);
    } catch (err: any) {
      console.error("Camera capture error:", err);
      if (err.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
      useStore.getState().setAppAlert({
        id: Date.now().toString(),
        message: err.code === 'resource-exhausted' ? 'فشل الإرسال: تم استهلاك حصة البيانات اليومية' : 'فشل إرسال الصورة. يرجى المحاولة مرة أخرى.',
        type: 'error'
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleShareLiveLocation = () => {
    if (!navigator.geolocation) {
      alert('جهازك لا يدعم تحديد الموقع.');
      return;
    }

    setIsLocating(true);
    setShowAttachMenu(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        if (!currentUser || !chatData) {
          setIsLocating(false);
          return;
        }

        const msgData = {
          chatId,
          senderId: currentUser.uid,
          type: 'location',
          location: { latitude, longitude },
          isLive: true,
          liveExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins by default
          createdAt: serverTimestamp()
        };

        try {
          const docRef = await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
          
          const chatUpdates: any = {
            lastMessage: {
              text: '📍 موقع مباشر',
              senderId: currentUser.uid,
              createdAt: serverTimestamp()
            },
            updatedAt: serverTimestamp()
          };

          // Increment unread count for other participants
          chatData?.participants.forEach(uid => {
            if (uid !== currentUser.uid) {
              chatUpdates[`unreadCount.${uid}`] = (chatUpdates[`unreadCount.${uid}`] || chatData.unreadCount?.[uid] || 0) + 1;
            }
          });

          await updateDoc(doc(db, 'chats', chatId), chatUpdates);

          // Start watching
          const id = navigator.geolocation.watchPosition(
            async (pos) => {
              try {
                await updateDoc(doc(db, 'chats', chatId, 'messages', docRef.id), {
                  location: { 
                    latitude: pos.coords.latitude, 
                    longitude: pos.coords.longitude 
                  }
                });
              } catch (err) {
                console.error("Error updating live location:", err);
              }
            },
            (err) => console.error(err),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
          
          setLiveWatchId(id);
          setIsLocating(false);
        } catch (err) {
          console.error("Error sharing live location:", err);
          setIsLocating(false);
        }
      },
      (error) => {
        console.error(error);
        alert('فشل الحصول على الموقع. يرجى تفعيل الصلاحيات.');
        setIsLocating(false);
      }
    );
  };

  const handleShareLocation = async () => {
    if (!navigator.geolocation) {
      alert('جهازك لا يدعم تحديد الموقع.');
      return;
    }

    setIsLocating(true);
    setShowAttachMenu(false);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        if (!currentUser || !chatData) return;

        const msgData = {
          chatId,
          senderId: currentUser.uid,
          type: 'location',
          location: { latitude, longitude },
          createdAt: serverTimestamp()
        };

        try {
          await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
          
          const chatUpdates: any = {
            lastMessage: {
              text: '📍 موقع جغرافي',
              senderId: currentUser.uid,
              createdAt: serverTimestamp()
            },
            updatedAt: serverTimestamp()
          };

          // Increment unread count for other participants
          chatData?.participants.forEach(uid => {
            if (uid !== currentUser.uid) {
              chatUpdates[`unreadCount.${uid}`] = increment(1);
            }
          });

          await updateDoc(doc(db, 'chats', chatId), chatUpdates);
        } catch (err) {
          console.error("Location error:", err);
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert('فشل الحصول على موقعك. تأكد من تفعيل الـ GPS.');
        setIsLocating(false);
      }
    );
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    setReactionMenuMessageId(null);

    const messageRef = doc(db, 'chats', chatId, 'messages', messageId);
    try {
      const msgDoc = await getDoc(messageRef);
      if (msgDoc.exists()) {
        const data = msgDoc.data() as Message;
        const reactions = data.reactions || {};
        const rawUserIds = reactions[emoji];
        const userIds = Array.isArray(rawUserIds) ? rawUserIds : [];

        if (userIds?.includes(currentUser.uid)) {
          // Remove reaction
          reactions[emoji] = userIds.filter(id => id !== currentUser.uid);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          // Add reaction
          reactions[emoji] = [...userIds, currentUser.uid];
        }

        await updateDoc(messageRef, { reactions });
      }
    } catch (err) {
      console.error("Error updating reaction:", err);
    }
  };

  const startEditMessage = (msg: Message) => {
    if (msg.senderId !== currentUser?.uid || msg.type !== 'text') return;
    setEditingMessage(msg);
    setReplyingTo(null);
    setNewMessage(msg.text || '');
    setReactionMenuMessageId(null);
  };

  const startReplyMessage = (msg: Message) => {
    setReplyingTo(msg);
    setEditingMessage(null);
    setNewMessage('');
    setReactionMenuMessageId(null);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!currentUser || !chatData) return;
    setReactionMenuMessageId(null);
    
    // Check permissions
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const isMe = msg.senderId === currentUser.uid;
    const isMeAdmin = chatData?.isGroup && chatData.admins?.includes(currentUser.uid);

    if (!isMe && !isMeAdmin) {
      alert('لا تملك صلاحية حذف هذه الرسالة');
      return;
    }

    setDeletingMessageId(messageId);
  };

  const confirmDeleteMessage = async () => {
    if (!deletingMessageId || !currentUser || !chatData) return;
    const messageId = deletingMessageId;
    
    try {
      await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
      
      // If this was the last message, update the chat's lastMessage
      if (messages.length > 0 && messages[messages.length - 1].id === messageId) {
        const newLastMsg = messages.length > 1 ? messages[messages.length - 2] : null;
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: newLastMsg ? {
            text: newLastMsg.text || (newLastMsg.type === 'image' ? 'الصورة' : (newLastMsg.type === 'voice' ? 'تسجيل صوتي' : 'ملف')),
            senderId: newLastMsg.senderId,
            createdAt: newLastMsg.createdAt
          } : deleteField()
        });
      }
      setDeletingMessageId(null);
    } catch (err) {
      console.error("Error deleting message:", err);
      alert('حدث خطأ أثناء حذف الرسالة. يرجى المحاولة مرة أخرى.');
      setDeletingMessageId(null);
    }
  };

  const onEmojiClick = (emojiData: any) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  const createCardGame21 = async () => {
    if (!currentUser || !chatData) return;

    const players = chatData.participants;
    const deck = createDeck();
    const hands: any = {};
    const scores: any = {};
    
    // Deal 2 cards to each
    players.forEach(uid => {
      const h = [deck.pop()!, deck.pop()!];
      hands[uid] = h;
      scores[uid] = calculateScore(h);
    });

    const gameData = {
      type: 'blackjack',
      status: 'playing',
      players: players,
      turn: players[0],
      hands,
      scores,
      deck,
      winner: null,
      updatedAt: serverTimestamp()
    };

    try {
      const gameRef = await addDoc(collection(db, 'games'), gameData);
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        senderId: currentUser.uid,
        text: '🃏 بدأت مباراة ورق 21 جديدة! من سيصل إلى 21 أولاً؟',
        type: 'text',
        gameId: gameRef.id,
        gameType: 'blackjack',
        createdAt: serverTimestamp()
      });

      setActiveGameId(gameRef.id);
      setActiveGameType('blackjack');
    } catch (err) {
      console.error("Error creating card game:", err);
    }
  };

  const createLudoGame = async () => {
    if (!currentUser || !chatData) return;

    const players = chatData.participants;
    const gameData = {
      type: 'ludo',
      status: 'playing',
      players: players,
      turn: players[0],
      positions: {
        [players[0]]: 0,
        [players[1] || 'bot']: 0
      },
      lastRoll: null,
      updatedAt: serverTimestamp()
    };

    try {
      const gameRef = await addDoc(collection(db, 'games'), gameData);
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        senderId: currentUser.uid,
        text: '🎲 بدأت مباراة طاولة (Ludo) جديدة! من سيصل للنهاية أولاً؟',
        type: 'text',
        gameId: gameRef.id,
        gameType: 'ludo',
        createdAt: serverTimestamp()
      });

      setActiveGameId(gameRef.id);
      setActiveGameType('ludo');
    } catch (err) {
      console.error("Error creating ludo game:", err);
    }
  };

  const createXOGame = async () => {
    if (!currentUser || !chatData) return;

    const players = chatData.participants;
    const gameData = {
      type: 'xo',
      status: 'playing',
      players: players,
      turn: players[0],
      board: Array(9).fill(null),
      winner: null,
      updatedAt: serverTimestamp()
    };

    try {
      const gameRef = await addDoc(collection(db, 'games'), gameData);
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        senderId: currentUser.uid,
        text: '❌⭕ بدأت مباراة XO جديدة! من سيفوز بالتحدي؟',
        type: 'text',
        gameId: gameRef.id,
        gameType: 'xo',
        createdAt: serverTimestamp()
      });

      setActiveGameId(gameRef.id);
      setActiveGameType('xo');
    } catch (err) {
      console.error("Error creating XO game:", err);
    }
  };

  const createChessGame = async () => {
    if (!currentUser || !chatData) return;

    const players = chatData.participants;
    const gameData = {
      type: 'chess',
      status: 'playing',
      players: players,
      turn: players[0],
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      winner: null,
      updatedAt: serverTimestamp()
    };

    try {
      const gameRef = await addDoc(collection(db, 'games'), gameData);
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        senderId: currentUser.uid,
        text: '♟️ بدأت مباراة شطرنج كبرى! استعد للمناورة.',
        type: 'text',
        gameId: gameRef.id,
        gameType: 'chess',
        createdAt: serverTimestamp()
      });

      setActiveGameId(gameRef.id);
      setActiveGameType('chess');
    } catch (err) {
      console.error("Error creating chess game:", err);
    }
  };

  const handleMessageClick = (msg: Message) => {
    if ((msg as any).gameId) {
      setActiveGameId((msg as any).gameId);
      setActiveGameType((msg as any).gameType || 'blackjack');
    }
  };

  const toggleBlockUser = async () => {
    if (!currentUser || !otherProfile || !otherProfile.uid) return;
    const blockedArray = Array.isArray(currentUser.blockedUsers) ? currentUser.blockedUsers : [];
    const isCurrentlyBlocked = blockedArray?.includes(otherProfile.uid);
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        blockedUsers: isCurrentlyBlocked ? arrayRemove(otherProfile.uid) : arrayUnion(otherProfile.uid)
      });
      setShowMoreMenu(false);
    } catch (err) {
      console.error("Error toggling block:", err);
    }
  };

  const leaveGroup = async () => {
    if (!currentUser || !chatData || !chatData.isGroup) return;
    if (!window.confirm('هل أنت متأكد من مغادرة المجموعة؟')) return;
    
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        participants: arrayRemove(currentUser.uid),
        admins: arrayRemove(currentUser.uid)
      });
      onClose();
    } catch (err) {
      console.error("Error leaving group:", err);
    }
  };

  const deleteGroup = async () => {
    if (!currentUser || !chatData || !chatData.isGroup) return;
    const isAdmin = chatData.admins?.includes(currentUser.uid);
    if (!isAdmin) {
      alert('فقط المشرفين يمكنهم حذف المجموعة.');
      return;
    }

    if (!window.confirm('هل أنت متأكد من حذف المجموعة بالكامل؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    
    try {
      await deleteDoc(doc(db, 'chats', chatId));
      onClose();
    } catch (err) {
      console.error("Error deleting group:", err);
    }
  };

  const isMeAdmin = chatData?.admins?.includes(currentUser?.uid || '');
  const isOwner = chatData?.participants?.[0] === currentUser?.uid;
  const myPermissions = chatData?.memberRoles?.[currentUser?.uid || ''] || {
    canChangeInfo: isMeAdmin || false,
    canKick: isMeAdmin || false,
    canLockChat: isMeAdmin || false,
    canDeleteMessages: isMeAdmin || false,
    canAddAdmins: isOwner || false
  };

  const addAdmin = async (uid: string, perms?: any) => {
    if (!chatId || !isOwner || !uid) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        admins: arrayUnion(uid),
        [`memberRoles.${uid}`]: perms || {
          canChangeInfo: true,
          canKick: true,
          canLockChat: false,
          canDeleteMessages: false,
          canAddAdmins: false
        }
      });
    } catch (err) {
      console.error(err);
    }
  };

  const removeAdmin = async (uid: string) => {
    if (!chatId || !isOwner || !uid) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        admins: arrayRemove(uid),
        [`memberRoles.${uid}`]: deleteField()
      });
    } catch (err) {
      console.error(err);
    }
  };

  const toggleChatLock = async () => {
    if (!chatId || !myPermissions.canLockChat) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        isLocked: !chatData?.isLocked
      });
    } catch (err) {
      console.error(err);
    }
  };

  const removeMember = async (uid: string) => {
    if (!chatId || !myPermissions.canKick || !uid) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        participants: arrayRemove(uid),
        admins: arrayRemove(uid)
      });
    } catch (err) {
      console.error(err);
    }
  };

  const formatLastSeen = (profile: UserProfile | null) => {
    if (!profile) return 'متصل منذ وقت طويل';
    
    // Privacy check
    const privacy = profile.privacy?.lastSeen || 'everyone';
    if (privacy === 'nobody') {
      return 'آخر ظهور كان قريباً';
    }
    
    const timestamp = profile.lastSeen;
    if (!timestamp) return 'متصل منذ وقت طويل';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;

    if (diff < 60) return 'متصل الآن';
    if (isToday(date)) {
      return `آخر ظهور اليوم في ${format(date, 'hh:mm a', { locale: ar })}`;
    }
    if (isYesterday(date)) {
      return `آخر ظهور أمس في ${format(date, 'hh:mm a', { locale: ar })}`;
    }
    return `آخر ظهور بتاريخ ${format(date, 'yyyy/MM/dd')}`;
  };

  const getTypingText = () => {
    if (isTyping) return 'جاري الكتابة...'; // AI bot constant
    if (typingUsers.length === 0) {
      return chatData?.isGroup ? `${chatData.participants.length} عضو` : formatLastSeen(otherProfile);
    }
    
    if (chatData?.isGroup) {
      if (typingUsers.length === 1) {
        const name = participants[typingUsers[0]]?.displayName || 'مستخدم';
        return `${name} يكتب الآن...`;
      }
      return `${typingUsers.length} من الأعضاء يكتبون...`;
    }
    
    return 'يكتب الآن...';
  };

  const iBlockedOther = !chatData?.isGroup && (Array.isArray(currentUser?.blockedUsers) ? currentUser.blockedUsers : []).includes(otherProfile?.uid || '');
  const chatBackground = currentUser?.chatBackground;
  const isPattern = typeof chatBackground === 'string' && chatBackground.includes('transparenttextures.com');
  const isGradient = typeof chatBackground === 'string' && (chatBackground.startsWith('linear-gradient') || chatBackground.startsWith('radial-gradient'));
  const isColor = typeof chatBackground === 'string' && (chatBackground.startsWith('#') || chatBackground.startsWith('rgb'));

  return (
    <div 
      className={`flex flex-col h-full relative ${typeof chatBackground === 'string' && chatBackground ? '' : 'telegram-bg'}`} 
      dir={language === 'English' ? 'ltr' : 'rtl'}
      style={typeof chatBackground === 'string' && chatBackground ? {
        background: isGradient ? chatBackground : undefined,
        backgroundImage: (!isGradient && !isColor) ? `url(${chatBackground})` : undefined,
        backgroundColor: isColor ? chatBackground : (isPattern ? '#f4f4f7' : undefined),
        backgroundRepeat: 'repeat',
        backgroundAttachment: 'fixed',
        backgroundSize: isPattern ? 'auto' : 'cover',
        backgroundPosition: 'center',
        backgroundBlendMode: 'normal'
      } : {}}
    >
      {/* Header */}
      <div className="glass-header p-3 flex items-center justify-between shadow-sm safe-top">
        <div className="flex items-center gap-2">
          <motion.div whileTap={{ scale: 0.9 }}>
            <Button variant="ghost" size="icon" className="rounded-full ios-touch mr-1 active:bg-muted" onClick={onClose} title={t.back}>
              <ArrowRight className={`h-6 w-6 text-primary ${language === 'English' ? 'rotate-180' : ''}`} />
            </Button>
          </motion.div>
          <motion.div 
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-1 rounded-xl transition-colors min-w-0"
            onClick={() => setShowChatInfo(true)}
          >
            <Avatar className="h-10 w-10 border-2 border-primary/10">
            <AvatarImage src={chatData?.isGroup ? (chatData.groupPhoto || undefined) : (otherProfile?.photoURL || undefined)} />
              <AvatarFallback 
                className="text-white font-bold bg-muted-foreground/20 text-muted-foreground"
              >
                {((chatData?.isGroup ? chatData.groupName : otherProfile?.displayName)?.slice(0, 2) || 'CH').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span 
                className={`font-bold text-sm flex items-center gap-1 ${(!chatData?.isGroup && isMagicColor(otherProfile?.nameColor)) ? getNameColorClass(otherProfile?.nameColor) : ''}`} 
                style={{ color: (chatData?.isGroup ? '#8b5cf6' : (isMagicColor(otherProfile?.nameColor) ? undefined : (otherProfile?.nameColor || '#141414'))) }}
              >
                {chatData?.isGroup ? chatData.groupName : (otherProfile?.displayName || 'مستخدم تلي عراق')}
                {!chatData?.isGroup && otherProfile?.isVerified && (
                  <BadgeCheck className="w-4 h-4 text-blue-500 fill-blue-500/20 shrink-0" />
                )}
              </span>
              <span className="text-[10px] text-primary font-medium">
                {getTypingText()}
              </span>
            </div>
          </motion.div>
        </div>
          <div className="flex items-center gap-1 relative">
            {!chatData?.isGroup && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full text-primary hover:bg-primary/10"
                  onClick={() => initiateCall('voice')}
                  title="اتصال صوتي"
                >
                  <Phone className="h-5 w-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full text-primary hover:bg-primary/10"
                  onClick={() => initiateCall('video')}
                  title="اتصال فيديو"
                >
                  <Video className="h-5 w-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full text-primary hover:bg-primary/10"
                  onClick={() => setShowGameCenter(true)}
                  title="مركز الألعاب"
                >
                  <Gamepad2 className="h-5 w-5" />
                </Button>
              </>
            )}

            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full text-muted-foreground hover:text-primary"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
            >
              <MoreVertical className="h-5 w-5" />
            </Button>

            <AnimatePresence>
              {showMoreMenu && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute left-0 top-12 w-48 bg-card border shadow-2xl rounded-2xl p-2 z-[100] flex flex-col gap-1"
                >
                  {chatData?.isGroup ? (
                    <>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-xs rounded-xl h-10 gap-2"
                        onClick={() => { setShowGroupSettings(true); setShowMoreMenu(false); }}
                      >
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        إدارة المجموعة
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-xs rounded-xl h-10 gap-2"
                        onClick={() => { setShowProfile(true); setShowMoreMenu(false); }}
                      >
                        <User className="w-4 h-4 text-primary" />
                        مشاهدة ملفي الشخصي
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-xs text-destructive rounded-xl h-10 gap-2 hover:bg-destructive/10"
                        onClick={leaveGroup}
                      >
                        <LogOut className="w-4 h-4" />
                        مغادرة المجموعة
                      </Button>
                      {isMeAdmin && (
                        <Button 
                          variant="ghost" 
                          className="w-full justify-start text-xs text-destructive rounded-xl h-10 gap-2 hover:bg-destructive/10 font-bold"
                          onClick={deleteGroup}
                        >
                          <Trash2 className="w-4 h-4" />
                          حذف المجموعة نهائياً
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button 
                        variant="ghost" 
                        className="w-full justify-start text-xs rounded-xl h-10 gap-2"
                        onClick={() => { if(otherProfile) setViewingProfileId(otherProfile.uid); setShowMoreMenu(false); }}
                      >
                        <User className="w-4 h-4 text-primary" />
                        مشاهدة الملف الشخصي
                      </Button>
                      <Button 
                        variant="ghost" 
                        className={`w-full justify-start text-xs rounded-xl h-10 gap-2 ${iBlockedOther ? 'text-green-500' : 'text-destructive'}`}
                        onClick={toggleBlockUser}
                      >
                        <ShieldAlert className="w-4 h-4" />
                        {iBlockedOther ? 'إلغاء الحظر' : 'حظر المستخدم'}
                      </Button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto no-scrollbar bg-transparent overscroll-contain">
        {/* Real WebRTC Call Overlay */}
        <AnimatePresence>
          {activeRealCall && (
            <CallSystem 
              chatId={chatId}
              currentUser={currentUser}
              otherProfile={otherProfile}
              type={activeRealCall.type}
              isCaller={activeRealCall.isCaller}
              callId={activeRealCall.callId}
              onEnd={() => setActiveRealCall(null)}
            />
          )}

          {incomingCallData && !activeRealCall && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[110] bg-[#1a1a2e]/90 backdrop-blur-2xl flex flex-col items-center justify-between py-24"
            >
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping scale-150" />
                  <Avatar className="h-32 w-32 border-4 border-white/10 shadow-2xl relative z-10">
                    <AvatarImage src={otherProfile?.photoURL} />
                    <AvatarFallback className="text-3xl font-black bg-white/5 text-white">
                      {otherProfile?.displayName?.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-3xl font-black text-white tracking-tight">{otherProfile?.displayName}</h3>
                  <p className="text-primary font-bold tracking-[0.2em] uppercase text-sm animate-pulse">
                    {incomingCallData.type === 'video' ? 'مكالمة فيديو واردة...' : 'مكالمة صوتية واردة...'}
                  </p>
                </div>
              </div>

              <div className="flex gap-16">
                <div className="flex flex-col items-center gap-3">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={async () => {
                      await updateDoc(doc(db, 'calls', incomingCallData.id), { status: 'rejected' });
                      setIncomingCallData(null);
                    }}
                    className="w-20 h-20 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white transition-all shadow-lg hover:scale-110 active:scale-95"
                  >
                    <X className="w-8 h-8" />
                  </Button>
                  <span className="text-white/60 text-xs font-bold">رفض</span>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => answerCall(incomingCallData)}
                    className="w-20 h-20 rounded-full bg-green-500 hover:bg-green-600 text-white transition-all shadow-[0_0_30px_rgba(34,197,94,0.4)] hover:scale-110 active:scale-95"
                  >
                    <Phone className="w-8 h-8" />
                  </Button>
                  <span className="text-white/60 text-xs font-bold">قبول</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="p-4 min-h-full">
          <div className="space-y-2 max-w-3xl mx-auto pb-4">
          <AnimatePresence initial={false}>
            {loadingMessages ? (
              <div className="flex flex-col items-center justify-center py-20 pointer-events-none">
                <Loader2 className="w-8 h-8 animate-spin text-primary/40 mb-2" />
                <p className="text-xs text-muted-foreground animate-pulse">جاري تحميل الرسائل...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                {otherProfile?.uid === 'teleiraq-system' ? (
                  <div className="space-y-6 w-full max-w-sm">
                    <motion.div 
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto shadow-inner"
                    >
                      <BadgeCheck className="w-12 h-12 text-primary" />
                    </motion.div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-black text-foreground">مرحباً بك في الدعم الفني</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        أنا المساعد الذكي لتلي عراق. يمكنني مساعدتك في الإجابة على استفساراتك حول التطبيق، الخصوصية، أو أي مشاكل فنية تواجهها.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                       {[
                         'كيف يمكنني استخدام التطبيق؟',
                         'هل بياناتي آمنة؟',
                         'كيف أقوم بإضافة أصدقاء؟',
                         'ما هي مميزات تلي عراق؟'
                       ].map((q, i) => (
                         <Button 
                           key={i}
                           variant="outline" 
                           className="justify-start h-12 rounded-2xl text-xs font-bold border-primary/20 hover:bg-primary/5 hover:border-primary transition-all active:scale-95"
                           onClick={() => setNewMessage(q)}
                         >
                           {q}
                         </Button>
                       ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center pointer-events-none">
                    <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
                      <MessageSquare className="w-8 h-8 text-primary/20" />
                    </div>
                    <p className="text-sm font-bold text-muted-foreground">لا توجد رسائل بعد</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">ابدأ المحادثة الآن!</p>
                  </div>
                )}
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isMe = msg.senderId === currentUser?.uid;
                const senderProfile = chatData?.isGroup ? participants[msg.senderId] : (isMe ? currentUser : otherProfile);
                
                const isFirstInGroup = idx === 0 || messages[idx - 1].senderId !== msg.senderId;
                const isLastInGroup = idx === messages.length - 1 || messages[idx + 1].senderId !== msg.senderId;
                
                // Show header only if it's the first message from this sender in a sequence
                const showAvatarHeader = isFirstInGroup && !!senderProfile;
                
                return (
                  <motion.div 
                    key={msg.id} 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    drag={msg.type === 'system' ? undefined : "x"}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.5}
                    onDragEnd={(_, info) => {
                      if (msg.type === 'system') return;
                      if (info.offset.x < -60) {
                        startReplyMessage(msg);
                      } else if (info.offset.x > 60) {
                        handleDeleteMessage(msg.id);
                      }
                    }}
                    className={msg.type === 'system' 
                      ? 'flex justify-center w-full my-4 px-10' 
                      : `flex ${isMe ? 'flex-row' : 'flex-row-reverse'} items-end gap-2 ${isLastInGroup ? 'mb-3' : 'mb-0.5'} group relative`
                    }
                  >
                    {msg.type === 'system' ? (
                      <div className="bg-black/10 dark:bg-white/5 backdrop-blur-md px-5 py-2 rounded-full text-[11px] font-bold text-muted-foreground/80 shadow-sm border border-white/5 text-center leading-tight max-w-full">
                        {msg.text}
                      </div>
                    ) : (
                      <>
                        {/* Swipe indicators - Swipe Left to Reply, Swipe Right to Delete */}
                        <div className="absolute -right-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none flex items-center justify-center w-10">
                          <ArrowRight className="w-6 h-6 text-primary animate-pulse rotate-180" />
                        </div>
                        
                        {(isMe || (chatData?.isGroup && chatData?.admins?.includes(currentUser?.uid || ''))) && (
                          <div className="absolute -left-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none flex items-center justify-center w-10">
                            <Trash2 className="w-5 h-5 text-destructive animate-pulse" />
                          </div>
                        )}
                        
                        <div 
                          className="relative flex flex-col items-start max-w-[75%]"
                          onClick={() => handleMessageClick(msg)}
                        >
                          {/* Stickers - Rendered without a bubble card for a cleaner look */}
                          {msg.type === 'sticker' && (
                            <div 
                              className="relative flex items-end gap-2 group mb-2"
                            >
                              <div 
                                className="w-32 h-32 cursor-pointer transition-transform hover:scale-110 active:scale-95 translate-y-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingImageUrl(msg.fileUrl || null);
                                }}
                              >
                                <img 
                                  src={msg.fileUrl} 
                                  alt="Sticker" 
                                  className="w-full h-full object-contain drop-shadow-md"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                       
                              {/* Sticker Metadata (time + read status) */}
                              <div className={`absolute bottom-2 ${isMe ? '-left-2' : '-right-2'} opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-1.5 py-0.5 rounded-full flex items-center gap-1 scale-75 origin-bottom z-10`}>
                                 <span className="text-[8px] text-white/80">{format(msg.createdAt?.toDate() || new Date(), 'h:mm a', { locale: language === 'English' ? undefined : ar })}</span>
                                 {isMe && (
                                  <div className="text-white/60">
                                    {msg.read ? <CheckCheck className="w-2 h-2 text-primary" /> : <Check className="w-2 h-2" />}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          <div 
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (msg.type !== 'system') setReactionMenuMessageId(msg.id);
                            }}
                            onPointerDown={() => msg.type !== 'system' && handleLongPress(msg)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePressEnd}
                            onPointerLeave={handlePressEnd}
                            className={`${msg.type === 'sticker' || msg.type === 'system' ? 'hidden' : 'px-3 py-2 rounded-2xl shadow-sm relative group cursor-pointer transition-all active:scale-[0.98]'} ${
                              isMe 
                                ? 'bg-primary text-white' 
                                : msg.senderId === 'teleiraq-system'
                                  ? 'bg-primary/10 border border-primary/20 text-foreground'
                                  : 'bg-card text-foreground'
                            } ${isFirstInGroup ? (isMe ? 'rounded-tr-2xl' : 'rounded-tl-2xl') : (isMe ? 'rounded-tr-lg' : 'rounded-tl-lg')} ${isLastInGroup ? (isMe ? 'rounded-br-none' : 'rounded-bl-none') : (isMe ? 'rounded-br-lg' : 'rounded-bl-lg')}`}
                          >
                        {/* Support Indicator */}
                        {msg.senderId === 'teleiraq-system' && showAvatarHeader && (
                          <div className="flex items-center gap-1.5 mb-1 px-1 py-0.5 bg-primary/5 rounded-lg border border-primary/10">
                            <Bot className="w-3 h-3 text-primary" />
                            <span className="text-[9px] font-black text-primary uppercase tracking-tighter">الدعم الفني الرسمي</span>
                          </div>
                        )}
                        {/* Message Header: Avatar + Name (Shown only on first message of cluster) */}
                        {showAvatarHeader && (
                          <div className={`flex items-center gap-2 mb-2 pb-1 border-b ${isMe ? 'border-white/10' : 'border-border/50'}`}>
                            <Avatar 
                              className="h-6 w-6 border border-white/10 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (senderProfile) setViewingProfileId(senderProfile.uid);
                              }}
                            >
                              <AvatarImage src={senderProfile?.photoURL || undefined} />
                              <AvatarFallback className="text-[8px] font-bold bg-muted-foreground/20">
                                {senderProfile?.displayName?.slice(0, 1)?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex items-center gap-1 min-w-0">
                              <p 
                                className={`text-[11px] font-bold truncate ${getNameColorClass(senderProfile?.nameColor)}`} 
                                style={{ color: isMagicColor(senderProfile?.nameColor) ? undefined : (senderProfile?.nameColor || (isMe ? 'white' : '#8b5cf6')) }}
                              >
                                {senderProfile?.displayName}
                              </p>
                              {chatData?.isGroup && chatData.creatorId === msg.senderId && (
                                <span className="text-[8px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-full border border-red-500/20 font-bold shrink-0 flex items-center gap-0.5">
                                  <Trophy className="w-2 h-2" />
                                  المالك
                                </span>
                              )}
                              {senderProfile?.isVerified && (
                                <BadgeCheck className={`w-3 h-3 shrink-0 ${isMe ? 'text-white' : 'text-blue-500 fill-blue-500/20'}`} />
                              )}
                            </div>
                          </div>
                        )}

                      {/* Telegram Tail */}
                      {isLastInGroup && (
                        <div className={`absolute bottom-[-1px] ${isMe ? '-right-2' : '-left-2'}`}>
                          <svg width="10" height="10" viewBox="0 0 10 10" className={isMe ? 'text-primary fill-current' : 'text-card fill-current'}>
                            <path d={isMe ? "M0 0 L0 10 L10 10 Q5 10 0 0" : "M10 0 L10 10 L0 10 Q5 10 10 0"} />
                          </svg>
                        </div>
                      )}
                      
                      {msg.replyTo && (
                        <div 
                          className={`mb-2 p-2 rounded-lg border-r-4 text-[11px] bg-black/5 flex flex-col gap-0.5 max-w-full overflow-hidden cursor-pointer hover:bg-black/10 transition-colors ${
                            isMe ? 'border-r-white/50 text-white/90' : 'border-r-primary text-primary'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const replyEl = document.getElementById(`msg-${msg.replyTo?.id}`);
                            if (replyEl) replyEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                        >
                          <span className="font-bold truncate">{msg.replyTo.senderName}</span>
                          <span className="opacity-80 truncate">{msg.replyTo.text}</span>
                        </div>
                      )}

                      {msg.type === 'text' && msg.text && (
                        <div className={`whitespace-pre-wrap break-words leading-relaxed text-[15px] mb-1 ${isMe ? 'text-white' : 'text-foreground'}`}>
                          {msg.text}
                        </div>
                      )}
                      
                      {msg.type !== 'text' && msg.text && (
                        <div className={`whitespace-pre-wrap break-words leading-relaxed text-[13px] mb-2 opacity-80 ${isMe ? 'text-white' : 'text-foreground'}`}>
                          {msg.text}
                        </div>
                      )}
                      
                      {(msg as any).gameType === 'blackjack' && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-2"
                        >
                          <Button 
                            className="w-full bg-primary hover:bg-primary/90 text-white font-bold rounded-xl gap-2 h-10 shadow-lg"
                            onClick={() => {
                              setActiveGameId((msg as any).gameId);
                              setActiveGameType('blackjack');
                            }}
                          >
                            <Gamepad2 className="w-4 h-4" />
                            دخول مباراة الورق
                          </Button>
                        </motion.div>
                      )}
                      {(msg as any).gameType === 'ludo' && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-2"
                        >
                          <Button 
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl gap-2 h-10 shadow-lg"
                            onClick={() => {
                              setActiveGameId((msg as any).gameId);
                              setActiveGameType('ludo');
                            }}
                          >
                            <Dices className="w-4 h-4" />
                            دخول مباراة الطاولة
                          </Button>
                        </motion.div>
                      )}
                      {msg.type === 'image' && (
                        <div 
                          className="rounded-lg overflow-hidden mb-1 cursor-pointer group relative"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (autoDownloadMedia || downloadedMessages.has(msg.id)) {
                              setViewingImageUrl(msg.fileUrl || msg.text || null);
                            } else {
                              setDownloadedMessages(prev => new Set(prev).add(msg.id));
                            }
                          }}
                        >
                          {(autoDownloadMedia || downloadedMessages.has(msg.id)) ? (
                            <>
                              <img src={msg.fileUrl || undefined} alt="Sent" className="max-w-full h-auto max-h-64 object-cover transition-transform group-hover:scale-105" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Plus className="w-8 h-8 text-white drop-shadow-lg" />
                              </div>
                            </>
                          ) : (
                            <div className="w-64 h-40 bg-muted/40 backdrop-blur-md flex flex-col items-center justify-center gap-2 border border-border/50 rounded-lg">
                              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                                <Plus className="w-6 h-6" />
                              </div>
                              <span className="text-[10px] font-bold text-muted-foreground">اضغط للتحميل</span>
                            </div>
                          )}
                        </div>
                      )}
                      {msg.type === 'file' && (
                        <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-lg mb-1">
                          <FileText className="h-8 w-8 text-primary" />
                          <div className="flex flex-col overflow-hidden">
                            <span className="text-xs font-bold truncate">{msg.fileName}</span>
                            <a href={msg.fileUrl} download={msg.fileName} className="text-[10px] text-primary hover:underline">تحميل الملف</a>
                          </div>
                        </div>
                      )}
                      {msg.type === 'location' && msg.location && (
                        <div className="rounded-lg overflow-hidden mb-1 border border-border/50 bg-muted/20 min-w-[200px]">
                          <div className="p-2 flex items-center justify-between gap-2 overflow-hidden bg-white/5">
                            <div className="flex items-center gap-2">
                              {msg.isLive ? (
                                <div className="relative">
                                  <MapPin className="h-4 w-4 text-green-500" />
                                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-ping" />
                                </div>
                              ) : (
                                <MapPin className="h-4 w-4 text-primary" />
                              )}
                              <span className={`text-xs font-bold ${msg.isLive ? 'text-green-500 animate-pulse' : ''}`}>
                                {msg.isLive ? 'موقع مباشر' : 'موقع جغرافي'}
                              </span>
                            </div>
                            {msg.isLive && isMe && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 text-[10px] bg-red-500/10 text-red-500 hover:bg-red-500/20 px-2 rounded-full"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (liveWatchId !== null) {
                                    navigator.geolocation.clearWatch(liveWatchId);
                                    setLiveWatchId(null);
                                  }
                                  await updateDoc(doc(db, 'chats', chatId, 'messages', msg.id), {
                                    isLive: false,
                                    text: '📍 انتهى الموقع المباشر'
                                  });
                                }}
                              >
                                إيقاف المشاركة
                              </Button>
                            )}
                          </div>
                          <a 
                            href={`https://www.google.com/maps?q=${msg.location.latitude},${msg.location.longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block relative group"
                          >
                            <img 
                              src={`https://maps.googleapis.com/maps/api/staticmap?center=${msg.location.latitude},${msg.location.longitude}&zoom=15&size=300x150&markers=color:red%7C${msg.location.latitude},${msg.location.longitude}&key=${(import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || ''}`} 
                              alt="Map" 
                              className="w-full h-32 object-cover transition-all"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                // Fallback if API key is missing or invalid - Use a clear map image
                                (e.target as HTMLImageElement).src = `https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&q=80&w=300&h=150`;
                              }}
                            />
                            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <Map className="h-8 w-8 text-white drop-shadow-md opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100" />
                            </div>
                          </a>
                        </div>
                      )}
                      {msg.type === 'voice' && msg.fileUrl && (
                        <div className="py-1">
                          {(autoDownloadMedia || downloadedMessages.has(msg.id)) ? (
                            <VoicePlayer url={msg.fileUrl} isMe={isMe} />
                          ) : (
                            <div className={`flex items-center gap-3 py-2 px-3 rounded-2xl ${isMe ? 'bg-primary/20' : 'bg-muted'} min-w-[200px] cursor-pointer`} onClick={() => setDownloadedMessages(prev => new Set(prev).add(msg.id))}>
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isMe ? 'bg-white text-primary' : 'bg-primary text-white'}`}>
                                <Download className="w-5 h-5" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-xs font-bold">تسجيل صوتي</span>
                                <span className="text-[10px] opacity-60">اضغط للتحميل</span>
                              </div>
                            </div>
                          )
                          }
                        </div>
                      )}
                      {msg.type === 'video_note' && msg.fileUrl && (
                        <div className="py-2 flex justify-center">
                           <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-primary/20 shadow-xl bg-black">
                              <video 
                                src={msg.fileUrl} 
                                className="w-full h-full object-cover" 
                                autoPlay 
                                muted 
                                loop 
                                playsInline
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                           </div>
                        </div>
                      )}
                      <div className={`text-[10px] flex items-center justify-start gap-1 ${isMe ? 'text-white/80' : 'text-muted-foreground'}`}>
                        {msg.isEdited && <span className="opacity-60 italic ml-1">معدلة</span>}
                        <span>{msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'hh:mm a', { locale: ar }) : '...'}</span>
                        {isMe && (
                          <span>
                            {msg.read ? (
                              <CheckCheck className="h-3 w-3 text-blue-300" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </span>
                        )}
                      </div>

                        <AnimatePresence>
                          {reactionMenuMessageId === msg.id && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.5, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.5, y: 10 }}
                              className={`absolute -top-14 ios-touch ${isMe ? 'right-0' : 'left-0'} bg-card/95 backdrop-blur-md border shadow-2xl rounded-full p-1.5 flex gap-1.5 z-50 overflow-hidden ring-1 ring-black/5`}
                            >
                            <div className="flex gap-2 px-3 items-center">
                              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                                <button 
                                  key={emoji}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReaction(msg.id, emoji);
                                  }}
                                  className="hover:scale-150 transition-all p-1 text-2xl active:scale-90"
                                >
                                  {emoji}
                                </button>
                              ))}
                              <div className="w-[1px] h-6 bg-border mx-1" />
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full"
                                onClick={() => startReplyMessage(msg)}
                                title="رد"
                              >
                                <ArrowRight className="h-4 w-4 rotate-180" />
                              </Button>
                              {isMe && msg.type === 'text' && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-primary hover:bg-primary/10 rounded-full"
                                  onClick={() => startEditMessage(msg)}
                                  title="تعديل"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              )}
                               {(isMe || (chatData?.isGroup && chatData?.admins?.includes(currentUser?.uid || ''))) && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-full"
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  title="حذف"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Reactions Display */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-start' : 'justify-end'}`}>
                        {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                          const ids = Array.isArray(userIds) ? (userIds as string[]) : [];
                          return (
                            <button
                              key={emoji}
                              onClick={() => handleReaction(msg.id, emoji)}
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors ${
                                ids.includes(currentUser?.uid || '')
                                  ? 'bg-primary/10 border-primary/30 text-primary'
                                  : 'bg-card border-border text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span className="font-bold">{ids.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          );
            }))}
          </AnimatePresence>
          {typingUsers.length > 0 && (
            <div className="flex justify-end items-end gap-2">
              <div className="w-8 shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={participants[typingUsers[0]]?.photoURL || otherProfile?.photoURL || undefined} />
                  <AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: participants[typingUsers[0]]?.nameColor || otherProfile?.nameColor }}>
                    {((participants[typingUsers[0]]?.displayName || otherProfile?.displayName)?.slice(0, 2) || '').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="bg-card px-4 py-3 rounded-2xl rounded-br-none shadow-sm">
                <div className="flex flex-col gap-1">
                  {chatData?.isGroup && (
                    <span className="text-[10px] font-bold text-primary">
                      {participants[typingUsers[0]]?.displayName} يكتب...
                    </span>
                  )}
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {isTyping && (
            <div className="flex justify-end items-end gap-2">
              <div className="w-8 shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={otherProfile?.photoURL || undefined} />
                  <AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: otherProfile?.nameColor }}>
                    {(otherProfile?.displayName?.slice(0, 2) || '').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="bg-card px-4 py-3 rounded-2xl rounded-br-none shadow-sm">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>
    </div>

      {/* Input */}
      <div className="p-2 sm:p-4 pb-10 sm:pb-14 bg-card border-t relative safe-bottom">
        <AnimatePresence>
          {otherProfile?.uid === 'teleiraq-system' && messages.length > 0 && !newMessage && !isTyping && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex gap-2 overflow-x-auto no-scrollbar py-2 px-2 absolute -top-12 left-0 right-0 bg-background/50 backdrop-blur-sm"
            >
               {[
                 'مساعدة إضافية', 
                 'سياسة الخصوصية', 
                 'أحدث المميزات',
                 'شكراً لك'
               ].map((q, i) => (
                 <Button 
                   key={i}
                   variant="secondary"
                   size="sm"
                   className="whitespace-nowrap px-4 rounded-full text-[10px] font-bold h-8 border shadow-sm active:scale-95"
                   onClick={() => {
                     setNewMessage(q);
                   }}
                 >
                   {q}
                 </Button>
               ))}
            </motion.div>
          )}
          {isUploading && (
            <motion.div 
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 5 }}
              className="absolute top-0 left-0 right-0 h-1 bg-muted overflow-hidden"
            >
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
                className="h-full bg-primary transition-all duration-300"
              />
            </motion.div>
          )}
          {(replyingTo || editingMessage) && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="px-4 py-2 bg-muted/30 border-t flex items-center justify-between mb-2 rounded-xl"
            >
              <div className="flex items-center gap-3 border-r-4 border-primary pr-3">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-primary">
                    {replyingTo ? 'الرد على' : 'تعديل الرسالة'}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                    {replyingTo ? (replyingTo.text || 'وسائط') : (editingMessage?.text || '')}
                  </span>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6 rounded-full" onClick={cancelReplyOrEdit}>
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        {showEmojiPicker && (
          <div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-2xl overflow-hidden border" ref={emojiPickerRef}>
            <EmojiPicker 
              onEmojiClick={onEmojiClick} 
              autoFocusSearch={false} 
              theme={Theme.LIGHT}
              width={300}
              height={400}
              searchPlaceholder="بحث عن ايموجي..."
            />
          </div>
        )}
        <form 
          onSubmit={handleSendMessage} 
          className="max-w-3xl mx-auto flex items-center gap-2"
          onFocus={() => {
            setTimeout(() => {
              if (scrollRef.current) scrollRef.current.scrollIntoView({ behavior: 'smooth' });
            }, 300);
          }}
        >
          {showGifPicker && (
            <div className="absolute bottom-20 left-4 z-50">
              <GifPicker 
                onSelect={handleGifSelect} 
                onClose={() => setShowGifPicker(false)} 
              />
            </div>
          )}
          <AnimatePresence>
            {showCamera && (
              <CameraModal 
                onCapture={handleCameraCapture} 
                onClose={() => setShowCamera(false)} 
              />
            )}
          </AnimatePresence>
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload}
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <div className="relative">
            <AnimatePresence>
              {showAttachMenu && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  className="absolute bottom-14 right-0 bg-card border shadow-2xl rounded-2xl p-2 z-50 flex flex-col gap-1 w-48"
                >
                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full justify-start gap-3 rounded-xl h-11 text-sm"
                    onClick={() => {
                      setShowCamera(true);
                      setShowAttachMenu(false);
                    }}
                  >
                    <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
                      <Camera className="w-4 h-4 text-orange-500" />
                    </div>
                    <span>كاميرا سيلفي</span>
                  </Button>
                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full justify-start gap-3 rounded-xl h-11 text-sm"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = "image/*";
                        fileInputRef.current.click();
                      }
                      setShowAttachMenu(false);
                    }}
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-blue-500" />
                    </div>
                    <span>صورة</span>
                  </Button>
                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full justify-start gap-3 rounded-xl h-11 text-sm"
                    onClick={() => {
                      if (fileInputRef.current) {
                        fileInputRef.current.accept = ".pdf,.doc,.docx,.txt,.zip";
                        fileInputRef.current.click();
                      }
                      setShowAttachMenu(false);
                    }}
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-amber-500" />
                    </div>
                    <span>ملف</span>
                  </Button>
                    <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full justify-start gap-3 rounded-xl h-11 text-sm"
                    onClick={() => {
                      setShowGameCenter(true);
                      setShowAttachMenu(false);
                    }}
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                      <Gamepad2 className="w-4 h-4 text-purple-500" />
                    </div>
                    <span>الألعاب</span>
                  </Button>
                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full justify-start gap-3 rounded-xl h-11 text-sm"
                    onClick={handleShareLiveLocation}
                    disabled={isLocating}
                  >
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                      <div className="relative">
                        <MapPin className="w-4 h-4 text-green-500" />
                        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                      </div>
                    </div>
                    <span>الموقع المباشر</span>
                  </Button>
                  <Button 
                    type="button"
                    variant="ghost" 
                    className="w-full justify-start gap-3 rounded-xl h-11 text-sm"
                    onClick={handleShareLocation}
                    disabled={isLocating}
                  >
                    <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                      {isLocating ? <Loader2 className="w-4 h-4 animate-spin text-green-500" /> : <MapPin className="w-4 h-4 text-green-500" />}
                    </div>
                    <span>الموقع</span>
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              className={`rounded-full shrink-0 ios-touch transition-all ${showAttachMenu ? 'bg-primary text-white rotate-45' : 'text-muted-foreground'}`}
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              disabled={isUploading}
            >
              {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-6 w-6" />}
            </Button>
          </div>
          <div className="flex-1 relative">
            {isRecording ? (
              <div className="bg-muted/80 backdrop-blur-sm rounded-2xl h-11 flex items-center px-4 gap-3 animate-in slide-in-from-bottom-2" dir="rtl">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm font-mono font-bold text-red-500">
                    {formatRecordingTime(recordingTime)}
                  </span>
                </div>
                <div className="flex-1 text-center text-xs text-muted-foreground mr-2">جاري التسجيل...</div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 rounded-xl text-destructive hover:bg-destructive/10 px-2 text-xs font-bold gap-1"
                  onClick={cancelRecording}
                >
                  <Trash2 className="w-3 h-3" />
                  إلغاء
                </Button>
                <Button 
                  type="button"
                  size="sm" 
                  className="h-8 rounded-xl bg-primary text-white hover:bg-primary/90 px-3 text-xs font-bold gap-1"
                  onClick={stopRecording}
                >
                  <Square className="w-2 h-2 fill-current" />
                  إرسال
                </Button>
              </div>
            ) : isVideoMessageRecording ? (
              <div className="bg-muted/80 backdrop-blur-sm rounded-2xl h-11 flex items-center px-4 gap-3 animate-in slide-in-from-bottom-2" dir="rtl">
                 <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm font-mono font-bold text-red-500">
                      {formatRecordingTime(recordingTime)}
                    </span>
                  </div>
                  <div className="flex-1 text-center text-xs text-muted-foreground mr-2">جاري تسجيل فيديو...</div>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 rounded-xl text-destructive hover:bg-destructive/10 px-2 text-xs font-bold gap-1"
                    onClick={() => {
                        stopVideoMessageRecording();
                        setVideoPreviewUrl(null);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                    إلغاء
                  </Button>
                  <Button 
                    type="button"
                    size="sm" 
                   className="h-8 rounded-xl bg-primary text-white hover:bg-primary/90 px-3 text-xs font-bold gap-1"
                    onClick={stopVideoMessageRecording}
                  >
                    <Square className="w-2 h-2 fill-current" />
                    إيقاف
                  </Button>
              </div>
            ) : (
              <>
                <Star className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/60 pointer-events-none z-10" />
                <Input
                  placeholder="اكتب رسالة..."
                  value={newMessage}
                  onChange={handleInputChange}
                  className="bg-muted/50 border-none rounded-2xl h-11 pr-10 pl-20 focus-visible:ring-primary/30"
                />
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className={`absolute left-1 top-1 rounded-full h-9 w-9 transition-colors ios-touch ${showEmojiPicker ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <Smile className="h-5 w-5" />
                </Button>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className={`absolute left-10 top-1 rounded-full h-9 w-9 transition-colors ios-touch ${showGifPicker ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
                  onClick={() => setShowGifPicker(!showGifPicker)}
                >
                  <div className="text-[10px] font-bold border-2 border-muted-foreground rounded px-0.5 leading-none">GIF</div>
                </Button>
              </>
            )}
          </div>
          {!isRecording && !isVideoMessageRecording && (
            newMessage.trim() ? (
              <Button 
                type="submit" 
                size="icon" 
                className="rounded-full h-11 w-11 shrink-0 transition-all ios-touch purple-gradient"
                key="send-btn"
              >
                <Send className="h-5 w-5 rotate-180" />
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                 <Button 
                  type="button" 
                  size="icon" 
                  className={`rounded-full h-11 w-11 shrink-0 transition-all ios-touch ${recordingMode === 'video' ? 'bg-primary text-white scale-110 shadow-xl' : 'text-muted-foreground'}`}
                  onClick={() => recordingMode === 'voice' ? setRecordingMode('video') : startVideoMessageRecording()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRecordingMode('video');
                  }}
                  key="video-note-btn"
                >
                  <Video className="h-5 w-5" />
                </Button>
                <Button 
                  type="button" 
                  size="icon" 
                  className={`rounded-full h-11 w-11 shrink-0 transition-all ios-touch ${recordingMode === 'voice' ? 'bg-primary text-white scale-110 shadow-xl' : 'text-muted-foreground'}`}
                  onClick={() => recordingMode === 'video' ? setRecordingMode('voice') : startRecording()}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setRecordingMode('voice');
                  }}
                  key="mic-btn"
                >
                  <Mic className="h-5 w-5" />
                </Button>
              </div>
            )
          )}
        </form>
      </div>

      {/* Chat Info Dialog */}
      <Dialog open={showChatInfo} onOpenChange={setShowChatInfo}>
        <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none bg-background shadow-2xl" dir="rtl">
          <div className="relative p-8 flex flex-col items-center gap-6 purple-gradient text-white">
            <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-4 left-4 text-white hover:bg-white/20 rounded-full"
                onClick={() => setShowChatInfo(false)}
            >
                <X className="w-5 h-5" />
            </Button>
            
            <div className="relative">
              <Avatar className="h-32 w-32 border-4 border-white/20 shadow-2xl">
                <AvatarImage src={otherProfile?.photoURL || chatData?.photoURL} />
                <AvatarFallback className="bg-white/10 text-white text-3xl font-black">
                  {(otherProfile?.displayName || chatData?.name || '?').charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 border-4 border-[#8b5cf6] rounded-full" />
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-black tracking-tight">{otherProfile?.displayName || chatData?.name}</h2>
              <p className="text-white/70 text-sm">{chatData?.isGroup ? 'مجموعة' : 'محادثة خاصة'}</p>
            </div>
          </div>

          <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto no-scrollbar">
             <div className="space-y-4">
                <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                   <Bell className="w-4 h-4 text-primary" /> إشعارات المحادثة
                </h3>
                
                <div className="bg-muted/30 rounded-3xl p-6 border border-muted/50 space-y-4">
                   <div className="space-y-2">
                      <p className="text-xs font-bold text-muted-foreground mr-1">نغمة التنبيه الخاصة</p>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                         <Button
                           variant={!useStore.getState().chatSounds[chatId] ? "default" : "outline"}
                           size="sm"
                           onClick={() => {
                               useStore.getState().setChatSound(chatId, '');
                               const audio = new Audio(NOTIFICATION_SOUNDS[0].url);
                               audio.play().catch(() => {});
                           }}
                           className="rounded-xl h-8 text-[10px] whitespace-nowrap px-4"
                         >
                           افتراضي للنظام
                         </Button>
                         {NOTIFICATION_SOUNDS.map((s) => (
                           <Button
                             key={s.id}
                             variant={useStore.getState().chatSounds[chatId] === s.id ? "default" : "outline"}
                             size="sm"
                             onClick={() => {
                                 useStore.getState().setChatSound(chatId, s.id);
                                 const audio = new Audio(s.url);
                                 audio.play().catch(() => {});
                             }}
                             className="rounded-xl h-8 text-[10px] whitespace-nowrap"
                           >
                             {s.name}
                           </Button>
                         ))}
                         <Button
                            variant={useStore.getState().chatSounds[chatId]?.includes('data:audio') ? "default" : "outline"}
                            size="sm"
                            onClick={() => document.getElementById('chat-custom-sound')?.click()}
                            className="rounded-xl h-8 text-[10px] whitespace-nowrap shrink-0 border-dashed"
                          >
                            {useStore.getState().chatSounds[chatId]?.includes('data:audio') ? 'نغمة مخصصة' : '+ رفع نغمة'}
                          </Button>
                          <input 
                            type="file" 
                            id="chat-custom-sound" 
                            className="hidden" 
                            accept="audio/*" 
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 500000) { alert('كبير جداً'); return; }
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    useStore.getState().setChatSound(chatId, reader.result as string);
                                    const audio = new Audio(reader.result as string);
                                    audio.play().catch(() => {});
                                  };
                                  reader.readAsDataURL(file);
                                }
                            }} 
                          />
                      </div>
                   </div>
                </div>
             </div>

             <div className="flex flex-col gap-3">
                <Button variant="outline" className="w-full justify-start h-14 rounded-2xl border-2 gap-4 font-bold text-muted-foreground hover:text-primary transition-all group">
                   <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-4 h-4" />
                   </div>
                   عرض الوسائط المشتركة
                </Button>
                <Button variant="outline" className="w-full justify-start h-14 rounded-2xl border-2 gap-4 font-bold text-destructive hover:bg-destructive/10 transition-all group">
                   <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive group-hover:scale-110 transition-transform">
                      <Trash2 className="w-4 h-4" />
                   </div>
                   كتم الإشعارات مؤقتاً
                </Button>
             </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Message Recording Overlay */}
      <AnimatePresence>
        {isVideoMessageRecording && (
           <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md"
           >
              <div className="flex flex-col items-center gap-10">
                <div className="relative w-80 h-80 rounded-full overflow-hidden border-8 border-primary animate-pulse shadow-[0_0_80px_rgba(var(--primary),0.4)]">
                   <video 
                    autoPlay 
                    muted 
                    playsInline 
                    className="w-full h-full object-cover -scale-x-100"
                    ref={(el) => {
                      if (el && videoStreamRef.current) {
                        el.srcObject = videoStreamRef.current;
                      }
                    }}
                   />
                   <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent flex flex-col items-center justify-center pointer-events-none">
                      <div className="bg-red-600 px-4 py-1.5 rounded-full text-white text-[10px] font-black uppercase tracking-[0.3em] mb-3 shadow-[0_0_20px_rgba(220,38,38,0.5)]">REC</div>
                      <span className="text-5xl font-black text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]">{formatRecordingTime(recordingTime)}</span>
                   </div>
                </div>

                <div className="flex items-center gap-6">
                   <Button 
                    type="button" 
                    variant="ghost" 
                    className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-xl border border-white/20"
                    onClick={() => {
                        stopVideoMessageRecording(false);
                        setVideoPreviewUrl(null);
                    }}
                   >
                     <X className="w-8 h-8" />
                   </Button>

                   <Button 
                    type="button" 
                    className="w-24 h-24 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-[0_0_30px_rgba(220,38,38,0.4)] transition-transform active:scale-95"
                    onClick={() => stopVideoMessageRecording(false)}
                   >
                      <Square className="w-8 h-8 fill-current text-white" />
                   </Button>

                   <Button 
                    type="button" 
                    className="w-16 h-16 rounded-full purple-gradient text-white shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-transform active:scale-95 flex items-center justify-center"
                    onClick={() => {
                        if (!isUploading) {
                            stopVideoMessageRecording(true);
                        }
                    }}
                    disabled={isUploading}
                   >
                      {isUploading ? <Loader2 className="w-8 h-8 animate-spin" /> : <Send className="w-8 h-8 rotate-180" />}
                   </Button>
                </div>

                <p className="text-white/60 text-xs font-bold uppercase tracking-widest bg-white/5 py-2 px-6 rounded-full border border-white/10 backdrop-blur-md">
                   سيتم إرسال الفيديو كرسالة دائرية
                </p>
              </div>
           </motion.div>
        )}
      </AnimatePresence>

      {/* Video Message Preview Dialog */}
      <Dialog open={!!videoPreviewUrl} onOpenChange={() => setVideoPreviewUrl(null)}>
        <DialogContent className="max-w-sm rounded-[2.5rem] p-0 overflow-hidden border-none bg-background shadow-2xl" dir="rtl">
           <div className="relative aspect-square bg-black overflow-hidden">
              <video 
                src={videoPreviewUrl || ''} 
                className="w-full h-full object-cover" 
                autoPlay 
                loop 
                playsInline
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-4 right-4 bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-md"
                onClick={() => setVideoPreviewUrl(null)}
              >
                <X className="w-5 h-5" />
              </Button>
           </div>
           <div className="p-6 flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1 rounded-2xl h-12 border-2"
                onClick={() => setVideoPreviewUrl(null)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                حذف
              </Button>
              <Button 
                className="flex-1 rounded-2xl h-12 purple-gradient shadow-lg"
                onClick={async () => {
                   if (videoPreviewUrl) {
                      const response = await fetch(videoPreviewUrl);
                      const blob = await response.blob();
                      await sendVideoMessage(blob);
                   }
                }}
                disabled={isUploading}
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2 rotate-180" />}
                إرسال
              </Button>
           </div>
        </DialogContent>
      </Dialog>

      {/* Chat Info Dialog */}
      <Dialog open={showChatInfo} onOpenChange={setShowChatInfo}>
        <DialogContent className="max-w-md rounded-[2.5rem] p-0 overflow-hidden border-none bg-background shadow-2xl" dir="rtl">
          <div className="relative p-8 flex flex-col items-center gap-6 purple-gradient text-white">
            <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-4 left-4 text-white hover:bg-white/20 rounded-full"
                onClick={() => setShowChatInfo(false)}
            >
                <X className="w-5 h-5" />
            </Button>
            
            <div className="relative">
              <Avatar className="h-32 w-32 border-4 border-white/20 shadow-2xl">
                <AvatarImage src={chatData?.isGroup ? (chatData.groupPhoto || undefined) : (otherProfile?.photoURL || undefined)} />
                <AvatarFallback className="bg-white/10 text-white text-3xl font-black">
                  {((chatData?.isGroup ? chatData.groupName : otherProfile?.displayName)?.slice(0, 1) || '?').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute bottom-1 right-1 w-6 h-6 bg-green-500 border-4 border-[#8b5cf6] rounded-full" />
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-black tracking-tight">{chatData?.isGroup ? chatData.groupName : (otherProfile?.displayName || 'مستخدم تلي عراق')}</h2>
              <p className="text-white/70 text-sm">{chatData?.isGroup ? 'مجموعة' : 'محادثة خاصة'}</p>
            </div>

            {!chatData?.isGroup && (
              <div className="flex gap-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-14 h-14 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-110 active:scale-95"
                  onClick={() => { initiateCall('voice'); setShowChatInfo(false); }}
                >
                  <Phone className="w-6 h-6" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-14 h-14 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-110 active:scale-95"
                  onClick={() => { initiateCall('video'); setShowChatInfo(false); }}
                >
                  <Video className="w-6 h-6" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="w-14 h-14 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all hover:scale-110 active:scale-95"
                  onClick={() => { setShowGameCenter(true); setShowChatInfo(false); }}
                >
                  <Gamepad2 className="w-6 h-6" />
                </Button>
              </div>
            )}
          </div>

          <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto no-scrollbar">
             <div className="space-y-4">
                <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                   <Bell className="w-4 h-4 text-primary" /> إشعارات المحادثة
                </h3>
                
                <div className="bg-muted/30 rounded-3xl p-6 border border-muted/50 space-y-4">
                   <div className="space-y-2">
                      <p className="text-xs font-bold text-muted-foreground mr-1">نغمة التنبيه الخاصة</p>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                         <Button
                           variant={!useStore.getState().chatSounds[chatId] ? "default" : "outline"}
                           size="sm"
                           onClick={() => {
                               useStore.getState().setChatSound(chatId, '');
                               const audio = new Audio(NOTIFICATION_SOUNDS[0].url);
                               audio.play().catch(() => {});
                           }}
                           className="rounded-xl h-8 text-[10px] whitespace-nowrap px-4"
                         >
                           افتراضي للنظام
                         </Button>
                         {NOTIFICATION_SOUNDS.map((s) => (
                           <Button
                             key={s.id}
                             variant={useStore.getState().chatSounds[chatId] === s.id ? "default" : "outline"}
                             size="sm"
                             onClick={() => {
                                 useStore.getState().setChatSound(chatId, s.id);
                                 const audio = new Audio(s.url);
                                 audio.play().catch(() => {});
                             }}
                             className="rounded-xl h-8 text-[10px] whitespace-nowrap"
                           >
                             {s.name}
                           </Button>
                         ))}
                         <Button
                            variant={useStore.getState().chatSounds[chatId]?.includes('data:audio') ? "default" : "outline"}
                            size="sm"
                            onClick={() => document.getElementById('chat-custom-sound')?.click()}
                            className="rounded-xl h-8 text-[10px] whitespace-nowrap shrink-0 border-dashed"
                          >
                            {useStore.getState().chatSounds[chatId]?.includes('data:audio') ? 'نغمة مخصصة' : '+ رفع نغمة'}
                          </Button>
                          <input 
                            type="file" 
                            id="chat-custom-sound" 
                            className="hidden" 
                            accept="audio/*" 
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 500000) { alert('كبير جداً'); return; }
                                  const reader = new FileReader();
                                  reader.onloadend = () => {
                                    useStore.getState().setChatSound(chatId, reader.result as string);
                                    const audio = new Audio(reader.result as string);
                                    audio.play().catch(() => {});
                                  };
                                  reader.readAsDataURL(file);
                                }
                            }} 
                          />
                      </div>
                   </div>
                </div>
             </div>

             <div className="flex flex-col gap-3">
                {chatData?.isGroup && (
                    <Button 
                        variant="outline" 
                        className="w-full justify-start h-14 rounded-2xl border-2 gap-4 font-bold text-muted-foreground hover:text-primary transition-all group"
                        onClick={() => { setShowGroupSettings(true); setShowChatInfo(false); }}
                    >
                        <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
                            <ShieldCheck className="w-4 h-4" />
                        </div>
                        إدارة المجموعة
                    </Button>
                )}
                <Button 
                    variant="outline" 
                    className="w-full justify-start h-14 rounded-2xl border-2 gap-4 font-bold text-muted-foreground hover:text-primary transition-all group"
                    onClick={() => { if(otherProfile) setViewingProfileId(otherProfile.uid); setShowChatInfo(false); }}
                >
                   <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                      <User className="w-4 h-4" />
                   </div>
                   مشاهدة الملف الشخصي
                </Button>
                <Button variant="outline" className="w-full justify-start h-14 rounded-2xl border-2 gap-4 font-bold text-muted-foreground hover:text-primary transition-all group">
                   <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-4 h-4" />
                   </div>
                   عرض الوسائط المشتركة
                </Button>
                <Button variant="outline" className="w-full justify-start h-14 rounded-2xl border-2 gap-4 font-bold text-destructive hover:bg-destructive/10 transition-all group">
                   <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive group-hover:scale-110 transition-transform">
                      <Trash2 className="w-4 h-4" />
                   </div>
                   كتم الإشعارات مؤقتاً
                </Button>
             </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Game Center Dialog */}
      <Dialog open={showGameCenter} onOpenChange={setShowGameCenter}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-none bg-card shadow-2xl" dir="rtl">
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Gamepad2 className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">مركز ألعاب تلي عراق</h3>
                  <p className="text-xs text-muted-foreground">استمتع بأفضل الألعاب التراثية مع أصدقائك</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowGameCenter(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4 h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              <motion.div 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group relative overflow-hidden rounded-2xl border bg-card hover:border-primary/50 transition-all cursor-pointer shadow-sm"
                onClick={() => {
                  createCardGame21();
                  setShowGameCenter(false);
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-4 flex gap-4">
                  <div className="w-20 h-20 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 shadow-inner">
                    <Coins className="w-10 h-10 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-blue-700 font-sans tracking-tight">لعبة الورق 21</h4>
                      <div className="px-1.5 py-0.5 rounded bg-blue-500 text-[8px] text-white font-bold uppercase">الآن</div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      لعبة الورق الشهيرة 21. حاول الوصول إلى الرقم 21 دون تجاوزه. تحدى أصدقائك الآن!
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Ludo Game */}
              <motion.div 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group relative overflow-hidden rounded-2xl border bg-card hover:border-green-500/50 transition-all cursor-pointer shadow-sm"
                onClick={() => {
                  createLudoGame();
                  setShowGameCenter(false);
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-4 flex gap-4">
                  <div className="w-20 h-20 rounded-xl bg-green-100 flex items-center justify-center shrink-0 shadow-inner">
                    <Dices className="w-10 h-10 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-green-700 font-sans tracking-tight">لعبة الطاولة (Ludo)</h4>
                      <div className="px-1.5 py-0.5 rounded bg-green-500 text-[8px] text-white font-bold uppercase">الآن</div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      تسابق مع صديقك للوصول إلى خط النهاية. ارمِ النرد واستمتع باللعب!
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* XO Game */}
              <motion.div 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group relative overflow-hidden rounded-2xl border bg-card hover:border-purple-500/50 transition-all cursor-pointer shadow-sm"
                onClick={() => {
                  createXOGame();
                  setShowGameCenter(false);
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-4 flex gap-4">
                  <div className="w-20 h-20 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                    <X className="w-10 h-10 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-purple-700 font-sans tracking-tight">لعبة XO المطورة</h4>
                      <div className="px-1.5 py-0.5 rounded bg-purple-500 text-[8px] text-white font-bold uppercase">الآن</div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      العب إكس أو التقليدية مع ميزات جديدة وتحديات يومية.
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Chess Game */}
              <div className="group relative overflow-hidden rounded-2xl border bg-muted/20 opacity-70 grayscale transition-all cursor-not-allowed">
                <div className="p-4 flex gap-4">
                  <div className="w-20 h-20 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Trophy className="w-10 h-10 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-muted-foreground font-sans tracking-tight">بطولة الشطرنج</h4>
                      <div className="px-1.5 py-0.5 rounded bg-muted text-[8px] text-muted-foreground font-bold uppercase">قريباً</div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      تحدى أصدقائك في مباراة شطرنج كلاسيكية داخل المحادثة.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-muted/30 border border-dashed text-center">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">المزيد من الألعاب قادمة قريباً</p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-muted/50 border-t flex justify-center">
            <p className="text-[10px] text-muted-foreground">تلعب الآن مع {otherProfile?.displayName || 'العضو الآخر'}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Games Overlay */}
      <AnimatePresence>
        {activeGameId && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-[100] bg-background flex flex-col"
          >
            <div className="flex-1 overflow-hidden">
              {activeGameType === 'blackjack' && (
                <CardGame21 
                  gameId={activeGameId} 
                  currentUser={currentUser} 
                  onClose={() => { setActiveGameId(null); setActiveGameType(null); }} 
                />
              )}
              {activeGameType === 'ludo' && activeGameId && (
                <LudoGame 
                  gameId={activeGameId} 
                  currentUser={currentUser} 
                  onClose={() => { setActiveGameId(null); setActiveGameType(null); }} 
                />
              )}
              {activeGameType === 'xo' && activeGameId && (
                <div className="h-full flex flex-col">
                  <div className="p-4 flex justify-between items-center bg-card border-b">
                    <h3 className="font-bold">لعبة XO</h3>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => {
                        setActiveGameId(null);
                        setActiveGameType(null);
                      }} 
                      className="rounded-full"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <XOGameSync 
                      gameId={activeGameId}
                      currentUser={currentUser}
                    />
                  </div>
                </div>
              )}
              {activeGameType === 'chess' && activeGameId && (
                <div className="h-full flex flex-col">
                  <div className="p-4 flex justify-between items-center bg-card border-b">
                    <h3 className="font-bold">الشطرنج</h3>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => {
                        setActiveGameId(null);
                        setActiveGameType(null);
                      }} 
                      className="rounded-full"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <ChessGameSync 
                      gameId={activeGameId}
                      currentUser={currentUser}
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group Settings Dialog */}
      <Dialog open={showGroupSettings} onOpenChange={setShowGroupSettings}>
        <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden border-none" dir="rtl">
          <DialogHeader className="p-4 bg-primary text-white">
            <DialogTitle className="text-right flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              إدارة المجموعة
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <div>
              <h4 className="text-xs font-bold text-muted-foreground mb-3 px-1 uppercase tracking-wider">الأعضاء ({chatData?.participants.length})</h4>
              <div className="h-64 pr-2 overflow-y-auto overscroll-contain">
                <div className="space-y-2">
                  {chatData?.participants.map(uid => {
                    const p = participants[uid];
                    const isAdmin = chatData.admins?.includes(uid);
                    const isMe = uid === currentUser?.uid;
                    
                    return (
                      <div key={uid} className="flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Avatar 
                        className="h-8 w-8 cursor-pointer hover:ring-2 ring-primary/30 transition-all"
                        onClick={() => {
                          if (uid) setViewingProfileId(uid);
                          setShowGroupSettings(false);
                        }}
                      >
                        <AvatarImage src={p?.photoURL || undefined} />
                        <AvatarFallback style={{ backgroundColor: p?.nameColor || '#8b5cf6' }} className="text-white text-[10px]">
                          {p?.displayName?.slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div 
                        className="flex flex-col cursor-pointer"
                        onClick={() => {
                          if (uid) setViewingProfileId(uid);
                          setShowGroupSettings(false);
                        }}
                      >
                        <span className="text-sm font-bold flex items-center gap-1">
                          {p?.displayName || 'مستخدم'}
                          {isMe && <span className="text-[10px] text-muted-foreground">(أنت)</span>}
                          {chatData.creatorId === uid && (
                            <span className="text-[9px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-full border border-red-500/20 font-bold flex items-center gap-0.5">
                              <Trophy className="w-2 h-2" />
                              المالك
                            </span>
                          )}
                          {isAdmin && chatData.creatorId !== uid && <ShieldCheck className="w-3 h-3 text-primary" />}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {chatData.creatorId === uid ? 'المنشئ' : isAdmin ? 'مشرف' : 'عضو'}
                        </span>
                      </div>
                    </div>
                        
                        {isMeAdmin && !isMe && (
                          <div className="flex gap-1">
                            {isAdmin ? (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-[10px] gap-1 text-amber-600 hover:bg-amber-600/10"
                                onClick={() => removeAdmin(uid)}
                              >
                                <UserMinus className="w-3 h-3" />
                                تنزيل رتبة
                              </Button>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 text-[10px] gap-1 text-primary hover:bg-primary/10"
                                onClick={() => {
                                  setShowManageAdmin({ uid, displayName: p?.displayName || 'مستخدم' });
                                  setAdminPerms({
                                    canChangeInfo: true,
                                    canKick: true,
                                    canLockChat: false,
                                    canDeleteMessages: false,
                                    canAddAdmins: false
                                  });
                                }}
                              >
                                <UserPlus className="w-3 h-3" />
                                تعيين مشرف
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 text-[10px] gap-1 text-destructive hover:bg-destructive/10"
                              onClick={() => removeMember(uid)}
                            >
                              <X className="w-3 h-3" />
                              طرد
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            <div className="pt-2 border-t flex flex-col gap-2">
              <Button 
                variant="outline" 
                className="w-full justify-start text-xs rounded-xl h-10 gap-2 text-destructive hover:bg-destructive/10 border-destructive/20"
                onClick={() => { leaveGroup(); setShowGroupSettings(false); }}
              >
                <LogOut className="w-4 h-4" />
                مغادرة هذه المجموعة
              </Button>
              
              {myPermissions.canLockChat && (
                <Button 
                  variant="outline" 
                  className="w-full justify-start text-xs rounded-xl h-10 gap-2"
                  onClick={toggleChatLock}
                >
                  {chatData?.isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  {chatData?.isLocked ? 'إلغاء قفل الدردشة' : 'قفل الدردشة للأعضاء'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Permissions Dialog */}
      <Dialog open={!!showManageAdmin} onOpenChange={() => setShowManageAdmin(null)}>
        <DialogContent className="max-w-sm rounded-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">صلاحيات المشرف: {showManageAdmin?.displayName}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center justify-between p-2 rounded-xl bg-muted/30">
              <span className="text-sm">تغيير معلومات المجموعة</span>
              <Checkbox checked={adminPerms.canChangeInfo} onCheckedChange={(v) => setAdminPerms(p => ({ ...p, canChangeInfo: !!v }))} />
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-muted/30">
              <span className="text-sm">طرد الأعضاء</span>
              <Checkbox checked={adminPerms.canKick} onCheckedChange={(v) => setAdminPerms(p => ({ ...p, canKick: !!v }))} />
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-muted/30">
              <span className="text-sm">قفل الدردشة</span>
              <Checkbox checked={adminPerms.canLockChat} onCheckedChange={(v) => setAdminPerms(p => ({ ...p, canLockChat: !!v }))} />
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-muted/30">
              <span className="text-sm">حذف رسائل الجميع</span>
              <Checkbox checked={adminPerms.canDeleteMessages} onCheckedChange={(v) => setAdminPerms(p => ({ ...p, canDeleteMessages: !!v }))} />
            </div>
            {isOwner && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-muted/30">
                <span className="text-sm text-primary font-bold">إضافة مشرفين آخرين</span>
                <Checkbox checked={adminPerms.canAddAdmins} onCheckedChange={(v) => setAdminPerms(p => ({ ...p, canAddAdmins: !!v }))} />
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowManageAdmin(null)} className="flex-1 rounded-xl">إلغاء</Button>
            <Button 
              className="flex-1 rounded-xl purple-gradient" 
              onClick={() => {
                if (showManageAdmin) {
                  addAdmin(showManageAdmin.uid, adminPerms);
                  setShowManageAdmin(null);
                }
              }}
            >
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Message Confirmation */}
      <Dialog open={!!deletingMessageId} onOpenChange={(open) => !open && setDeletingMessageId(null)}>
        <DialogContent className="sm:max-w-[425px]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">حذف الرسالة</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-right">
            <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذه الرسالة؟ لا يمكن التراجع عن هذا الإجراء.</p>
          </div>
          <DialogFooter className="flex flex-row-reverse gap-2 sm:justify-start">
            <Button variant="destructive" onClick={confirmDeleteMessage} className="rounded-xl flex-1 px-8 font-bold">حذف</Button>
            <Button variant="ghost" onClick={() => setDeletingMessageId(null)} className="rounded-xl flex-1 px-8">إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Image Viewer Dialog */}
      <Dialog open={!!viewingImageUrl} onOpenChange={() => setViewingImageUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] p-0 border-none bg-black/90 backdrop-blur-3xl overflow-hidden rounded-3xl" dir="rtl">
          <div className="relative w-full h-full flex flex-col">
            <div className="p-4 flex items-center justify-between absolute top-0 inset-x-0 z-10 bg-gradient-to-b from-black/60 to-transparent">
               <div className="flex items-center gap-2">
                 <Button variant="ghost" size="icon" onClick={() => setViewingImageUrl(null)} className="text-white hover:bg-white/20 rounded-full">
                    <X className="w-6 h-6" />
                 </Button>
                 <span className="text-white font-bold text-sm">عرض الصورة</span>
               </div>
               <Button 
                variant="ghost" 
                className="text-white bg-white/10 hover:bg-white/20 rounded-xl gap-2 px-4"
                onClick={() => {
                  if(!viewingImageUrl) return;
                  const link = document.createElement('a');
                  link.href = viewingImageUrl;
                  link.download = `teleiraq_image_${Date.now()}.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
               >
                 <Download className="w-5 h-5" />
                 حفظ في الاستوديو
               </Button>
            </div>
            
            <div className="flex-1 flex items-center justify-center p-4">
              <img 
                src={viewingImageUrl || undefined} 
                className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl" 
                alt="Fullscreen"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
