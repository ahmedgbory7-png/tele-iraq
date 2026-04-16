import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, limit, deleteDoc } from 'firebase/firestore';
import { Message, UserProfile, Chat } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Phone, Video, MoreVertical, Paperclip, Smile, ArrowRight, ArrowLeft, X, Image as ImageIcon, FileText, Loader2, Check, CheckCheck, MapPin, Trash2, Gamepad2, Volume2, VolumeX, VideoOff, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { getSystemBotResponse } from '@/lib/gemini';
import { DominoGame } from './DominoGame';

interface ChatWindowProps {
  chatId: string;
  currentUser: UserProfile | null;
  onClose: () => void;
}

export function ChatWindow({ chatId, currentUser, onClose }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatData, setChatData] = useState<Chat | null>(null);
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [participants, setParticipants] = useState<Record<string, UserProfile>>({});
  const [isCalling, setIsCalling] = useState(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [speakerOn, setSpeakerOn] = useState(false);
  const [videoOn, setVideoOn] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [reactionMenuMessageId, setReactionMenuMessageId] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchChatData = async () => {
      const chatDoc = await getDoc(doc(db, 'chats', chatId));
      if (chatDoc.exists()) {
        const data = chatDoc.data() as Chat;
        setChatData(data);
        
        if (!data.isGroup) {
          const otherId = data.participants.find((p: string) => p !== currentUser?.uid);
          if (otherId) {
            const userDoc = await getDoc(doc(db, 'users', otherId));
            if (userDoc.exists()) {
              setOtherProfile(userDoc.data() as UserProfile);
            }
          }
        } else {
          // Fetch all participants for group
          const participantProfiles: Record<string, UserProfile> = {};
          for (const pid of data.participants) {
            const pDoc = await getDoc(doc(db, 'users', pid));
            if (pDoc.exists()) {
              participantProfiles[pid] = pDoc.data() as UserProfile;
            }
          }
          setParticipants(participantProfiles);
        }
      }
    };
    fetchChatData();

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgData);
      
      // Mark messages as read
      msgData.forEach(async (msg) => {
        if (!msg.read && msg.senderId !== currentUser?.uid) {
          try {
            await updateDoc(doc(db, 'chats', chatId, 'messages', msg.id), { read: true });
          } catch (err) {
            console.error("Error marking message as read:", err);
          }
        }
      });
      
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }, (error) => {
      console.error("Snapshot error:", error);
    });

    // Listen for typing indicators
    const chatUnsubscribe = onSnapshot(doc(db, 'chats', chatId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Chat;
        const typing = data.typing || {};
        const typingIds = Object.keys(typing).filter(uid => typing[uid] && uid !== currentUser?.uid);
        setTypingUsers(typingIds);
      }
    });

    return () => {
      unsubscribe();
      chatUnsubscribe();
    };
  }, [chatId, currentUser]);

  const updateTypingStatus = async (isTyping: boolean) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        [`typing.${currentUser.uid}`]: isTyping
      });
    } catch (err) {
      console.error("Error updating typing status:", err);
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

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !currentUser) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      updateTypingStatus(false);
      typingTimeoutRef.current = null;
    }

    const text = newMessage;
    setNewMessage('');
    setShowEmojiPicker(false);

    const msgData = {
      chatId,
      senderId: currentUser.uid,
      text,
      type: 'text',
      createdAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
      
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text,
          senderId: currentUser.uid,
          createdAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });

      // AI Response if messaging system bot
      if (otherProfile?.uid === 'teleiraq-system' || chatId === 'teleiraq-system') {
        setIsTyping(true);
        
        // Prepare history for Gemini
        const history = messages.slice(-10).map(m => ({
          role: m.senderId === 'teleiraq-system' ? 'model' : 'user' as 'model' | 'user',
          parts: [{ text: m.text || '' }]
        }));

        const aiReply = await getSystemBotResponse(text, history);
        
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
    } catch (err) {
      console.error("Error sending message:", err);
      setIsTyping(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    setIsUploading(true);
    const reader = new FileReader();
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
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: {
            text: isImage ? '📷 صورة' : `📄 ${file.name}`,
            senderId: currentUser.uid,
            createdAt: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Upload error:", err);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleShareLocation = async () => {
    if (!currentUser) return;
    
    setIsLocating(true);
    if (!navigator.geolocation) {
      alert("متصفحك لا يدعم تحديد الموقع");
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      
      const msgData = {
        chatId,
        senderId: currentUser.uid,
        type: 'location',
        location: { latitude, longitude },
        createdAt: serverTimestamp()
      };

      try {
        await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
        await updateDoc(doc(db, 'chats', chatId), {
          lastMessage: {
            text: '📍 موقع جغرافي',
            senderId: currentUser.uid,
            createdAt: serverTimestamp()
          },
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Location share error:", err);
      } finally {
        setIsLocating(false);
      }
    }, (error) => {
      console.error("Geolocation error:", error);
      setIsLocating(false);
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
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
        const userIds = reactions[emoji] || [];

        if (userIds.includes(currentUser.uid)) {
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

  const handleDeleteMessage = async (messageId: string) => {
    if (!currentUser) return;
    setReactionMenuMessageId(null);
    
    if (window.confirm('هل أنت متأكد من حذف هذه الرسالة؟')) {
      try {
        await deleteDoc(doc(db, 'chats', chatId, 'messages', messageId));
      } catch (err) {
        console.error("Error deleting message:", err);
      }
    }
  };

  const onEmojiClick = (emojiData: any) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  const createDominoGame = async () => {
    if (!currentUser || !chatData) return;

    // 1. Create 28 domino pieces as objects
    const allPieces: { a: number; b: number }[] = [];
    for (let i = 0; i <= 6; i++) {
      for (let j = i; j <= 6; j++) {
        allPieces.push({ a: i, b: j });
      }
    }

    // 2. Shuffle
    for (let i = allPieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPieces[i], allPieces[j]] = [allPieces[j], allPieces[i]];
    }

    // 3. Deal 7 to each player
    const players = chatData.participants;
    const hands: { [uid: string]: { a: number; b: number }[] } = {};
    players.forEach((pid) => {
      hands[pid] = allPieces.splice(0, 7);
    });

    const gameData = {
      type: 'dominoes',
      status: 'playing',
      players: players,
      turn: players[0],
      board: { left: -1, right: -1, pieces: [] },
      hands: hands,
      boneyard: allPieces,
      winner: null,
      updatedAt: serverTimestamp()
    };

    try {
      const gameRef = await addDoc(collection(db, 'games'), gameData);
      
      // Send a message to the chat about the game
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        senderId: currentUser.uid,
        text: '🎮 بدأت لعبة دومينا جديدة! انقر للعب.',
        type: 'text',
        gameId: gameRef.id,
        createdAt: serverTimestamp()
      });

      setActiveGameId(gameRef.id);
    } catch (err) {
      console.error("Error creating game:", err);
    }
  };

  const handleMessageClick = (msg: Message) => {
    if ((msg as any).gameId) {
      setActiveGameId((msg as any).gameId);
    }
  };

  const startCall = (type: 'voice' | 'video') => {
    setCallType(type);
    setVideoOn(type === 'video');
    setIsCalling(true);
  };

  return (
    <div className="flex flex-col h-full telegram-bg relative" dir="rtl">
      {/* Header */}
      <div className="p-3 bg-card border-b flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full" onClick={onClose} title="رجوع">
            <ArrowRight className="h-6 w-6 text-primary" />
          </Button>
          <Avatar className="h-10 w-10 border-2 border-primary/10">
            <AvatarImage src={chatData?.isGroup ? chatData.groupPhoto : otherProfile?.photoURL} />
            <AvatarFallback 
              className={`text-white font-bold ${(!chatData?.isGroup && otherProfile?.nameColor === 'magic') ? 'magic-color-bg' : ''}`} 
              style={{ backgroundColor: (chatData?.isGroup ? '#8b5cf6' : (otherProfile?.nameColor === 'magic' ? undefined : otherProfile?.nameColor)) || '#8b5cf6' }}
            >
              {(chatData?.isGroup ? chatData.groupName : otherProfile?.displayName)?.slice(0, 2).toUpperCase() || 'CH'}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span 
              className={`font-bold text-sm ${(!chatData?.isGroup && otherProfile?.nameColor === 'magic') ? 'magic-color-text' : ''}`} 
              style={{ color: (chatData?.isGroup ? '#8b5cf6' : (otherProfile?.nameColor === 'magic' ? undefined : otherProfile?.nameColor)) }}
            >
              {chatData?.isGroup ? chatData.groupName : (otherProfile?.displayName || 'مستخدم تليعراق')}
            </span>
            <span className="text-[10px] text-primary font-medium">
              {isTyping ? 'جاري الكتابة...' : (chatData?.isGroup ? `${chatData.participants.length} عضو` : 'متصل الآن')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!chatData?.isGroup && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full text-primary hover:bg-primary/10"
              onClick={createDominoGame}
              title="لعب دومينا"
            >
              <Gamepad2 className="h-5 w-5" />
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={() => startCall('voice')}
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={() => startCall('video')}
          >
            <Video className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 no-scrollbar bg-transparent">
        <div className="p-4 min-h-full">
          <div className="space-y-2 max-w-3xl mx-auto pb-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => {
              const isMe = msg.senderId === currentUser?.uid;
              const senderProfile = chatData?.isGroup ? participants[msg.senderId] : (isMe ? currentUser : otherProfile);
              const showAvatar = !isMe && (idx === 0 || messages[idx - 1].senderId !== msg.senderId);
              const isLastInGroup = idx === messages.length - 1 || messages[idx + 1].senderId !== msg.senderId;
              
              return (
                <motion.div 
                  key={msg.id} 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.1}
                  onDragEnd={(e, info) => {
                    if (info.offset.x < -50) {
                      // Visual feedback for reply gesture
                      console.log("Reply gesture detected");
                    }
                  }}
                  className={`flex ${isMe ? 'justify-start' : 'justify-end'} items-end gap-2 mb-1`}
                >
                  {!isMe && (
                    <div className="w-8 shrink-0">
                      {showAvatar && (
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={senderProfile?.photoURL} />
                          <AvatarFallback 
                            className={`text-white text-[10px] ${senderProfile?.nameColor === 'magic' ? 'magic-color-bg' : ''}`} 
                            style={{ backgroundColor: senderProfile?.nameColor === 'magic' ? undefined : (senderProfile?.nameColor || '#8b5cf6') }}
                          >
                            {senderProfile?.displayName?.slice(0, 2).toUpperCase() || '??'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  )}
                  <div 
                    className="relative flex flex-col items-end max-w-[75%]"
                    onClick={() => handleMessageClick(msg)}
                  >
                    <div 
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setReactionMenuMessageId(msg.id);
                      }}
                      className={`px-3 py-2 rounded-2xl shadow-sm relative group cursor-pointer transition-all active:scale-[0.98] ${
                        isMe 
                          ? 'bg-primary text-white rounded-bl-none' 
                          : 'bg-card text-foreground rounded-br-none'
                      } ${!isLastInGroup ? (isMe ? 'rounded-bl-2xl' : 'rounded-br-2xl') : ''}`}
                    >
                      {chatData?.isGroup && !isMe && showAvatar && (
                        <p 
                          className={`text-[10px] font-bold mb-0.5 ${senderProfile?.nameColor === 'magic' ? 'magic-color-text' : ''}`} 
                          style={{ color: senderProfile?.nameColor === 'magic' ? undefined : senderProfile?.nameColor }}
                        >
                          {senderProfile?.displayName}
                        </p>
                      )}
                      {msg.type === 'text' && <p className="text-[15px] leading-snug whitespace-pre-wrap mb-1">{msg.text}</p>}
                      {msg.type === 'image' && (
                        <div className="rounded-lg overflow-hidden mb-1">
                          <img src={msg.fileUrl} alt="Sent" className="max-w-full h-auto max-h-64 object-cover" referrerPolicy="no-referrer" />
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
                        <div className="rounded-lg overflow-hidden mb-1 border border-border/50 bg-muted/20">
                          <div className="p-2 flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-primary" />
                            <span className="text-xs font-bold">موقع جغرافي</span>
                          </div>
                          <a 
                            href={`https://www.google.com/maps?q=${msg.location.latitude},${msg.location.longitude}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img 
                              src={`https://maps.googleapis.com/maps/api/staticmap?center=${msg.location.latitude},${msg.location.longitude}&zoom=15&size=300x150&markers=color:red%7C${msg.location.latitude},${msg.location.longitude}&key=${(import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || ''}`} 
                              alt="Map" 
                              className="w-full h-32 object-cover hover:opacity-90 transition-opacity"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                // Fallback if API key is missing or invalid
                                (e.target as HTMLImageElement).src = `https://picsum.photos/seed/map/300/150`;
                              }}
                            />
                          </a>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full text-[10px] h-8 rounded-none border-t"
                          >
                            <a href={`https://www.google.com/maps?q=${msg.location.latitude},${msg.location.longitude}`} target="_blank" rel="noopener noreferrer" className="w-full h-full flex items-center justify-center">
                              فتح في خرائط جوجل
                            </a>
                          </Button>
                        </div>
                      )}
                      <div className={`text-[10px] flex items-center justify-end gap-1 ${isMe ? 'text-white/80' : 'text-muted-foreground'}`}>
                        <span>{msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}</span>
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

                      {/* Reaction Menu Overlay */}
                      <AnimatePresence>
                        {reactionMenuMessageId === msg.id && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.5, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.5, y: 10 }}
                            className={`absolute -top-12 ${isMe ? 'right-0' : 'left-0'} bg-card border shadow-xl rounded-full p-1 flex gap-1 z-50`}
                          >
                            {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                              <button 
                                key={emoji}
                                onClick={() => handleReaction(msg.id, emoji)}
                                className="hover:bg-muted p-1.5 rounded-full transition-transform hover:scale-125 active:scale-90 text-lg"
                              >
                                {emoji}
                              </button>
                            ))}
                            <button 
                              onClick={() => setReactionMenuMessageId(null)}
                              className="p-1.5 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-4 w-4" />
                            </button>
                            {isMe && (
                              <button 
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="p-1.5 text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                                title="حذف الرسالة"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Reactions Display */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-start' : 'justify-end'}`}>
                        {Object.entries(msg.reactions).map(([emoji, userIds]) => {
                          const ids = userIds as string[];
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
                </motion.div>
              );
            })}
          </AnimatePresence>
          {typingUsers.length > 0 && (
            <div className="flex justify-end items-end gap-2">
              <div className="w-8 shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={participants[typingUsers[0]]?.photoURL || otherProfile?.photoURL} />
                  <AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: participants[typingUsers[0]]?.nameColor || otherProfile?.nameColor }}>
                    {(participants[typingUsers[0]]?.displayName || otherProfile?.displayName)?.slice(0, 2).toUpperCase()}
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
                  <AvatarImage src={otherProfile?.photoURL} />
                  <AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: otherProfile?.nameColor }}>
                    {otherProfile?.displayName?.slice(0, 2).toUpperCase()}
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
    </ScrollArea>

      {/* Input */}
      <div className="p-4 bg-card border-t relative">
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
        <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto flex items-center gap-2">
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload}
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="rounded-full text-muted-foreground shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
          </Button>
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className={`rounded-full shrink-0 ${isLocating ? 'text-primary animate-pulse' : 'text-muted-foreground'}`}
            onClick={handleShareLocation}
            disabled={isLocating}
            title="مشاركة الموقع"
          >
            <MapPin className="h-5 w-5" />
          </Button>
          <div className="flex-1 relative">
            <Input
              placeholder="اكتب رسالة..."
              value={newMessage}
              onChange={handleInputChange}
              className="bg-muted/50 border-none rounded-2xl h-11 pr-10 focus-visible:ring-primary/30"
            />
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              className={`absolute left-1 top-1 rounded-full h-9 w-9 transition-colors ${showEmojiPicker ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Smile className="h-5 w-5" />
            </Button>
          </div>
          <Button 
            type="submit" 
            size="icon" 
            className={`rounded-full h-11 w-11 shrink-0 transition-all ${newMessage.trim() ? 'purple-gradient scale-100' : 'bg-muted text-muted-foreground scale-90'}`}
            disabled={!newMessage.trim() || isTyping}
          >
            <Send className="h-5 w-5 rotate-180" />
          </Button>
        </form>
      </div>

      {/* Group Call Overlay */}
      <AnimatePresence>
        {isCalling && (
          <motion.div 
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 z-[200] bg-zinc-950 flex flex-col text-white overflow-hidden"
          >
            {/* Video Background / Preview */}
            {callType === 'video' && videoOn ? (
              <div className="absolute inset-0 z-0">
                <img 
                  src={`https://picsum.photos/seed/${otherProfile?.uid}/1080/1920?blur=2`} 
                  className="w-full h-full object-cover opacity-40"
                  alt="Remote Video"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute bottom-24 right-4 w-32 h-48 bg-black rounded-xl border-2 border-white/20 overflow-hidden shadow-2xl z-20">
                  <img 
                    src={`https://picsum.photos/seed/${currentUser?.uid}/300/500`} 
                    className="w-full h-full object-cover"
                    alt="Local Preview"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 right-2 bg-black/40 p-1 rounded">
                    <Camera className="w-3 h-3" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 z-0 purple-gradient opacity-10"></div>
            )}

            <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 gap-6">
              <div className="relative mt-auto">
                <Avatar className="h-32 w-32 border-4 border-primary shadow-[0_0_50px_rgba(139,92,246,0.3)]">
                  <AvatarImage src={otherProfile?.photoURL} />
                  <AvatarFallback 
                    className={`text-4xl font-bold text-white ${otherProfile?.nameColor === 'magic' ? 'magic-color-bg' : 'bg-zinc-800'}`}
                  >
                    {otherProfile?.displayName?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className={`absolute -top-2 -right-2 p-2 rounded-full shadow-lg ${callType === 'video' ? 'bg-blue-500' : 'bg-green-500'}`}>
                  {callType === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                </div>
              </div>
              <div className="text-center">
                <h3 className={`text-2xl font-bold mb-1 ${otherProfile?.nameColor === 'magic' ? 'magic-color-text' : ''}`}>
                  {otherProfile?.displayName}
                </h3>
                <p className="text-primary/80 animate-pulse font-medium">
                  {callType === 'video' ? 'مكالمة فيديو جارية...' : 'مكالمة صوتية جارية...'}
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/40">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                  متصل الآن
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-6 mt-auto mb-12 w-full max-w-sm">
                <div className="flex flex-col items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`w-14 h-14 rounded-full transition-all ${speakerOn ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                    onClick={() => setSpeakerOn(!speakerOn)}
                  >
                    {speakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                  </Button>
                  <span className="text-[10px] opacity-60">مكبر الصوت</span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="w-16 h-16 rounded-full shadow-2xl shadow-red-500/40 hover:scale-105 active:scale-95" 
                    onClick={() => setIsCalling(false)}
                  >
                    <Phone className="w-8 h-8 rotate-[135deg]" />
                  </Button>
                  <span className="text-[10px] opacity-80 text-red-400 font-bold">إنهاء</span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`w-14 h-14 rounded-full transition-all ${callType === 'video' && videoOn ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                    onClick={() => {
                      if (callType === 'voice') {
                        setCallType('video');
                        setVideoOn(true);
                      } else {
                        setVideoOn(!videoOn);
                      }
                    }}
                  >
                    {videoOn && callType === 'video' ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                  </Button>
                  <span className="text-[10px] opacity-60">{callType === 'video' ? 'الكاميرا' : 'فيديو'}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Domino Game Overlay */}
      <AnimatePresence>
        {activeGameId && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-[100] bg-background"
          >
            <DominoGame 
              gameId={activeGameId} 
              currentUser={currentUser} 
              onClose={() => setActiveGameId(null)} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
