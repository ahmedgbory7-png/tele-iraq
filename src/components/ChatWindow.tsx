import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, limit, deleteDoc, arrayUnion, arrayRemove, deleteField, getDocs, writeBatch } from 'firebase/firestore';
import { Message, UserProfile, Chat } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MoreVertical, Paperclip, Smile, ArrowRight, ArrowLeft, X, Image as ImageIcon, FileText, Loader2, Check, CheckCheck, MapPin, Trash2, Gamepad2, ShieldAlert, UserPlus, LogOut, ShieldCheck, UserMinus, User, Unlock, Lock, Trophy, MessageSquare, BadgeCheck, Plus, RotateCcw, Download } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ar } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { getSystemBotResponse } from '@/lib/gemini';
import { TawlaGame } from './TawlaGame';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

import { useStore } from '@/store/useStore';

import { Checkbox } from '@/components/ui/checkbox';

export function ChatWindow({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { profile: currentUser, setViewingProfileId, setShowProfile } = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatData, setChatData] = useState<Chat | null>(null);
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [participants, setParticipants] = useState<Record<string, UserProfile>>({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [reactionMenuMessageId, setReactionMenuMessageId] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
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
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let otherProfileUnsubscribe: (() => void) | null = null;
    setLoadingMessages(true);

    const fetchProfiles = async (data: Chat) => {
      // Step 1: Immediately use denormalized data if available (Zero server read cost)
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

      // Step 2: Individual real-time listener for "Last Seen" in private chats (Optional but helpful)
      if (!data.isGroup) {
        const otherId = data.participants.find((p: string) => p !== currentUser?.uid);
        if (otherId) {
          otherProfileUnsubscribe = onSnapshot(doc(db, 'users', otherId), (snapshot) => {
            if (snapshot.exists()) {
              setOtherProfile(snapshot.data() as UserProfile);
            }
          }, (err) => {
            console.error("Other profile snapshot error:", err);
          });
        }
      } else {
        // Step 3: Fallback for missing participants (only for old chats or data gaps)
        const missingIds = data.participants.filter(p => !data.participantProfiles?.[p]);
        if (missingIds.length > 0) {
          const participantProfiles: Record<string, UserProfile> = { ...(data.participantProfiles || {}) as any };
          for (const pid of missingIds) {
            const pDoc = await getDoc(doc(db, 'users', pid));
            if (pDoc.exists()) {
              participantProfiles[pid] = pDoc.data() as UserProfile;
            }
          }
          setParticipants(participantProfiles);
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
    }, (error) => {
      console.error("Messages snapshot error:", error);
      setLoadingMessages(false);
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
      }
    }, (error) => {
      console.error("Chat snapshot error:", error);
      if (error.code === 'permission-denied') {
        onClose();
      }
    });

    return () => {
      unsubscribe();
      chatUnsubscribe();
      if (otherProfileUnsubscribe) otherProfileUnsubscribe();
    };
  }, [chatId, currentUser]);

  const updateTypingStatus = async (isTyping: boolean) => {
    if (!currentUser || typingStateRef.current === isTyping) return;
    try {
      typingStateRef.current = isTyping;
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

  const cancelReplyOrEdit = () => {
    setReplyingTo(null);
    setEditingMessage(null);
    setNewMessage('');
  };

  const handleLongPress = (msg: Message) => {
    const timer = setTimeout(() => {
      setReactionMenuMessageId(msg.id);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
    setLongPressTimer(timer);
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
    if (!chatData.isGroup) {
      if (currentUser.blockedUsers?.includes(otherProfile?.uid || '')) {
        alert('لقد قمت بحظر هذا المستخدم. قم بإلغاء الحظر لتتمكن من المراسلة.');
        return;
      }
      if (otherProfile?.blockedUsers?.includes(currentUser.uid)) {
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
      try {
        await updateDoc(doc(db, 'chats', chatId, 'messages', editingMessage.id), {
          text,
          isEdited: true
        });
        setEditingMessage(null);
        setNewMessage('');
        return;
      } catch (err) {
        console.error("Error editing message:", err);
      }
    }

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

    if (file.size > 950 * 1024) {
      alert('الملف كبير جداً. الحد الأقصى هو 1 ميجابايت لضمان النقل بدقة 8K.');
      return;
    }

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
    const isMeAdmin = chatData.isGroup && chatData.admins?.includes(currentUser.uid);

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

  const createTawlaGame = async () => {
    if (!currentUser || !chatData) return;

    const players = chatData.participants;
    const gameData = {
      type: 'tawla',
      status: 'playing',
      players: players,
      turn: players[0],
      diceValue: null,
      winner: null,
      updatedAt: serverTimestamp()
    };

    try {
      const gameRef = await addDoc(collection(db, 'games'), gameData);
      
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId,
        senderId: currentUser.uid,
        text: '🎲 بدأت مباراة طاولي جديدة! ارمِ الزار.',
        type: 'text',
        gameId: gameRef.id,
        gameType: 'tawla',
        createdAt: serverTimestamp()
      });

      setActiveGameId(gameRef.id);
    } catch (err) {
      console.error("Error creating tawla game:", err);
    }
  };

  const handleMessageClick = (msg: Message) => {
    if ((msg as any).gameId) {
      setActiveGameId((msg as any).gameId);
    }
  };

  const toggleBlockUser = async () => {
    if (!currentUser || !otherProfile || !otherProfile.uid) return;
    const blockedArray = Array.isArray(currentUser.blockedUsers) ? currentUser.blockedUsers : [];
    const isCurrentlyBlocked = blockedArray.includes(otherProfile.uid);
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

  const iBlockedOther = !chatData?.isGroup && currentUser?.blockedUsers?.includes(otherProfile?.uid || '');
  const chatBackground = currentUser?.chatBackground;
  const isPattern = chatBackground?.includes('transparenttextures.com');

  return (
    <div 
      className={`flex flex-col h-full relative ${chatBackground ? '' : 'telegram-bg'}`} 
      dir="rtl"
      style={chatBackground ? {
        backgroundImage: `url(${chatBackground})`,
        backgroundColor: '#f4f4f7',
        backgroundRepeat: 'repeat',
        backgroundAttachment: 'fixed',
        backgroundSize: isPattern ? 'auto' : 'cover',
        backgroundPosition: 'center'
      } : {}}
    >
      {/* Header */}
      <div className="glass-header p-3 flex items-center justify-between shadow-sm safe-top">
        <div className="flex items-center gap-2">
          <motion.div whileTap={{ scale: 0.9 }}>
            <Button variant="ghost" size="icon" className="rounded-full ios-touch mr-1 active:bg-muted" onClick={onClose} title="رجوع">
              <ArrowRight className="h-6 w-6 text-primary" />
            </Button>
          </motion.div>
          <motion.div 
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 p-1 rounded-xl transition-colors min-w-0"
            onClick={() => {
              if (chatData?.isGroup) {
                setShowGroupSettings(true);
                return;
              }
              if (otherProfile) setViewingProfileId(otherProfile.uid);
            }}
          >
            <Avatar className="h-10 w-10 border-2 border-primary/10">
            <AvatarImage src={chatData?.isGroup ? (chatData.groupPhoto || undefined) : (otherProfile?.photoURL || undefined)} />
              <AvatarFallback 
                className="text-white font-bold bg-muted-foreground/20 text-muted-foreground"
              >
                {(chatData?.isGroup ? chatData.groupName : otherProfile?.displayName)?.slice(0, 2).toUpperCase() || 'CH'}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span 
                className={`font-bold text-sm flex items-center gap-1 ${(!chatData?.isGroup && (otherProfile?.nameColor === 'magic' || otherProfile?.nameColor === 'magic_neon' || otherProfile?.nameColor === 'magic_rb' || otherProfile?.nameColor === 'magic_pb' || otherProfile?.nameColor === 'magic_iraq')) ? (otherProfile?.nameColor === 'magic' ? 'magic-color-text' : otherProfile?.nameColor === 'magic_neon' ? 'magic-neon-orange-text' : otherProfile?.nameColor === 'magic_rb' ? 'magic-red-blue-text' : otherProfile?.nameColor === 'magic_pb' ? 'magic-pink-black-text' : 'magic-iraq-text') : ''}`} 
                style={{ color: (chatData?.isGroup ? '#8b5cf6' : ((otherProfile?.nameColor === 'magic' || otherProfile?.nameColor === 'magic_neon' || otherProfile?.nameColor === 'magic_rb' || otherProfile?.nameColor === 'magic_pb' || otherProfile?.nameColor === 'magic_iraq') ? undefined : (otherProfile?.nameColor || '#141414'))) }}
              >
                {chatData?.isGroup ? chatData.groupName : (otherProfile?.displayName || 'مستخدم تليعراق')}
                {!chatData?.isGroup && otherProfile?.isVerified && (
                  <BadgeCheck className="w-4 h-4 text-blue-500 fill-blue-500/20 shrink-0" />
                )}
              </span>
              <span className="text-[10px] text-primary font-medium">
                {isTyping ? 'جاري الكتابة...' : (chatData?.isGroup ? `${chatData.participants.length} عضو` : formatLastSeen(otherProfile))}
              </span>
            </div>
          </motion.div>
        </div>
          <div className="flex items-center gap-1 relative">
            {!chatData?.isGroup && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full text-primary hover:bg-primary/10"
                onClick={() => setShowGameCenter(true)}
                title="مركز الألعاب"
              >
                <Gamepad2 className="h-6 w-6" />
              </Button>
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
        <div className="p-4 min-h-full">
          <div className="space-y-2 max-w-3xl mx-auto pb-4">
          <AnimatePresence initial={false}>
            {loadingMessages ? (
              <div className="flex flex-col items-center justify-center py-20 pointer-events-none">
                <Loader2 className="w-8 h-8 animate-spin text-primary/40 mb-2" />
                <p className="text-xs text-muted-foreground animate-pulse">جاري تحميل الرسائل...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-primary/20" />
                </div>
                <p className="text-sm font-bold text-muted-foreground">لا توجد رسائل بعد</p>
                <p className="text-xs text-muted-foreground/60 mt-1">ابدأ المحادثة الآن!</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
              const isMe = msg.senderId === currentUser?.uid;
              const senderProfile = chatData?.isGroup ? participants[msg.senderId] : (isMe ? currentUser : otherProfile);
              // Always show header for all messages as requested by user
              const showAvatarHeader = !!senderProfile;
              const isLastInGroup = idx === messages.length - 1 || messages[idx + 1].senderId !== msg.senderId;
              
              return (
                <motion.div 
                  key={msg.id} 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={{ left: 0.5, right: 0 }}
                  onDragEnd={(_, info) => {
                    if (isMe && info.offset.x < -60) {
                      startReplyMessage(msg);
                    } else if (!isMe && info.offset.x > 60) {
                      startReplyMessage(msg);
                    }
                  }}
                  className={`flex ${isMe ? 'flex-row' : 'flex-row-reverse'} items-end gap-2 mb-1 group relative`}
                >
                  {/* Swipe Reply Indicator */}
                  {isMe && (
                    <div className="absolute -left-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none">
                      <ArrowLeft className="w-6 h-6 text-primary animate-pulse" />
                    </div>
                  )}
                  {!isMe && (
                    <div className="absolute -right-12 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none">
                      <ArrowRight className="w-6 h-6 text-primary animate-pulse" />
                    </div>
                  )}
                  
                  <div 
                    className="relative flex flex-col items-start max-w-[75%]"
                    onClick={() => handleMessageClick(msg)}
                  >
                    <div 
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setReactionMenuMessageId(msg.id);
                      }}
                      onPointerDown={() => handleLongPress(msg)}
                      onPointerUp={handlePressEnd}
                      onPointerLeave={handlePressEnd}
                      className={`px-3 py-2 rounded-2xl shadow-sm relative group cursor-pointer transition-all active:scale-[0.98] ${
                        isMe 
                          ? 'bg-primary text-white rounded-br-none' 
                          : 'bg-card text-foreground rounded-bl-none'
                      } ${!isLastInGroup ? (isMe ? 'rounded-br-2xl' : 'rounded-bl-2xl') : ''}`}
                    >
                      {/* Message Header: Avatar + Name (Requested by user) */}
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
                              {senderProfile?.displayName?.slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex items-center gap-1 min-w-0">
                            <p 
                              className={`text-[11px] font-bold truncate ${
                                senderProfile?.nameColor === 'magic' ? 'magic-color-text' : 
                                senderProfile?.nameColor === 'magic_neon' ? 'magic-neon-orange-text' :
                                senderProfile?.nameColor === 'magic_rb' ? 'magic-red-blue-text' :
                                senderProfile?.nameColor === 'magic_pb' ? 'magic-pink-black-text' :
                                senderProfile?.nameColor === 'magic_iraq' ? 'magic-iraq-text' :
                                senderProfile?.nameColor === 'animated-green' ? 'animated-green-text' :
                                senderProfile?.nameColor === 'animated-red' ? 'animated-red-text' : ''
                              }`} 
                              style={{ color: ['magic', 'magic_neon', 'magic_rb', 'magic_pb', 'magic_iraq', 'animated-green', 'animated-red'].includes(senderProfile?.nameColor || '') ? undefined : (senderProfile?.nameColor || (isMe ? 'white' : '#8b5cf6')) }}
                            >
                              {senderProfile?.displayName}
                            </p>
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
                      
                      {activeGameId && (msg as any).gameType === 'tawla' && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-2"
                        >
                          <Button 
                            className="w-full bg-primary hover:bg-primary/90 text-white font-bold rounded-xl gap-2 h-10 shadow-lg"
                            onClick={() => setActiveGameId((msg as any).gameId)}
                          >
                            <Gamepad2 className="w-4 h-4" />
                            دخول مباراة الطاولي
                          </Button>
                        </motion.div>
                      )}
                      {msg.type === 'image' && (
                        <div 
                          className="rounded-lg overflow-hidden mb-1 cursor-pointer group relative"
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingImageUrl(msg.fileUrl || msg.text || null);
                          }}
                        >
                          <img src={msg.fileUrl || undefined} alt="Sent" className="max-w-full h-auto max-h-64 object-cover transition-transform group-hover:scale-105" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Plus className="w-8 h-8 text-white drop-shadow-lg" />
                          </div>
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
                        </div>
                      )}
                      {msg.type === 'voice' && (
                        <div className="flex items-center gap-2 py-1 text-[10px] opacity-70">
                          (صوت)
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
                              className={`absolute -top-12 ios-touch right-0 bg-card border shadow-xl rounded-full p-1 flex gap-1 z-50 overflow-hidden`}
                            >
                            <div className="flex gap-1 px-2 items-center">
                              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                                <button 
                                  key={emoji}
                                  onClick={() => handleReaction(msg.id, emoji)}
                                  className="hover:scale-125 transition-transform p-1 text-lg active:scale-90"
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
            }))}
          </AnimatePresence>
          {typingUsers.length > 0 && (
            <div className="flex justify-end items-end gap-2">
              <div className="w-8 shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={participants[typingUsers[0]]?.photoURL || otherProfile?.photoURL || undefined} />
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
                  <AvatarImage src={otherProfile?.photoURL || undefined} />
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
    </div>

      {/* Input */}
      <div className="p-4 pb-14 bg-card border-t relative safe-bottom">
        <AnimatePresence>
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
            className="rounded-full text-muted-foreground shrink-0 ios-touch"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
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
              className={`absolute left-1 top-1 rounded-full h-9 w-9 transition-colors ios-touch ${showEmojiPicker ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              <Smile className="h-5 w-5" />
            </Button>
          </div>
          <Button 
            type="submit" 
            size="icon" 
            className={`rounded-full h-11 w-11 shrink-0 transition-all ios-touch ${newMessage.trim() ? 'purple-gradient opacity-100 scale-100' : 'bg-muted text-muted-foreground opacity-50 scale-90 pointer-events-none'}`}
            disabled={!newMessage.trim()}
          >
            <Send className="h-5 w-5 rotate-180" />
          </Button>
        </form>
      </div>

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
                  <h3 className="text-xl font-bold">مركز ألعاب تليعراق</h3>
                  <p className="text-xs text-muted-foreground">استمتع بأفضل الألعاب التراثية مع أصدقائك</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setShowGameCenter(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4">
              <motion.div 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group relative overflow-hidden rounded-2xl border bg-card hover:border-primary/50 transition-all cursor-pointer shadow-sm"
                onClick={() => {
                  createTawlaGame();
                  setShowGameCenter(false);
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="p-4 flex gap-4">
                  <div className="w-20 h-20 rounded-xl bg-orange-100 flex items-center justify-center shrink-0 shadow-inner">
                    <RotateCcw className="w-10 h-10 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-orange-700 font-sans tracking-tight">لعبة الطاولي</h4>
                      <BadgeCheck className="w-4 h-4 text-orange-500" />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      لعبة الطاولي العراقية الأصلية. تحدى أصدقائك في جولة من الذكاء والحظ. ارمِ الزار وابدأ التحدي الآن!
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex -space-x-2 rtl:space-x-reverse">
                        <div className="w-5 h-5 rounded-full border-2 border-background bg-slate-200" />
                        <div className="w-5 h-5 rounded-full border-2 border-background bg-slate-300" />
                      </div>
                      <span className="text-[10px] font-medium text-orange-600/70">متوفرة للعب الجماعي</span>
                    </div>
                  </div>
                </div>
              </motion.div>

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
            className="absolute inset-0 z-[100] bg-background"
          >
            {activeGameId && (
              <TawlaGame 
                gameId={activeGameId} 
                currentUser={currentUser} 
                onClose={() => setActiveGameId(null)} 
              />
            )}
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
                          {isAdmin && <ShieldCheck className="w-3 h-3 text-primary" />}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{isAdmin ? 'مشرف' : 'عضو'}</span>
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
