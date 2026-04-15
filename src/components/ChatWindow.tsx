import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, limit } from 'firebase/firestore';
import { Message, UserProfile } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Phone, Video, MoreVertical, Paperclip, Smile, ArrowRight, X, Image as ImageIcon, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { getSystemBotResponse } from '@/lib/gemini';

interface ChatWindowProps {
  chatId: string;
  currentUser: UserProfile | null;
  onClose: () => void;
}

export function ChatWindow({ chatId, currentUser, onClose }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
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
    // Fetch other participant profile
    const fetchProfile = async () => {
      const chatDoc = await getDoc(doc(db, 'chats', chatId));
      if (chatDoc.exists()) {
        const data = chatDoc.data();
        const otherId = data.participants.find((p: string) => p !== currentUser?.uid);
        if (otherId) {
          const userDoc = await getDoc(doc(db, 'users', otherId));
          if (userDoc.exists()) {
            setOtherProfile(userDoc.data() as UserProfile);
          }
        }
      }
    };
    fetchProfile();

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      // Filter out messages that don't have a createdAt yet to avoid "flickering" 
      // but only if they are not from the current user (optimistic UI)
      setMessages(msgData);
      
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }, (error) => {
      console.error("Snapshot error:", error);
    });

    return () => unsubscribe();
  }, [chatId, currentUser]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim() || !currentUser) return;

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

  const onEmojiClick = (emojiData: any) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  const startCall = (type: 'voice' | 'video') => {
    setCallType(type);
    setIsCalling(true);
  };

  return (
    <div className="flex flex-col h-full telegram-bg relative" dir="rtl">
      {/* Header */}
      <div className="p-3 bg-card border-b flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={onClose}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Avatar className="h-10 w-10 border-2 border-primary/10">
            <AvatarImage src={otherProfile?.photoURL} />
            <AvatarFallback className="text-white font-bold" style={{ backgroundColor: otherProfile?.nameColor || '#8b5cf6' }}>
              {otherProfile?.displayName?.slice(0, 2).toUpperCase() || 'CH'}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-bold text-sm" style={{ color: otherProfile?.nameColor }}>{otherProfile?.displayName || 'مستخدم تليعراق'}</span>
            <span className="text-[10px] text-primary font-medium">
              {isTyping ? 'جاري الكتابة...' : 'متصل الآن'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
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
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onClose}
            title="خروج من المحادثة"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 max-w-3xl mx-auto">
          {messages.map((msg, idx) => {
            const isMe = msg.senderId === currentUser?.uid;
            const showAvatar = idx === 0 || messages[idx - 1].senderId !== msg.senderId;
            
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-start' : 'justify-end'} items-end gap-2`}>
                {!isMe && (
                  <div className="w-8 shrink-0">
                    {showAvatar && (
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={otherProfile?.photoURL} />
                        <AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: otherProfile?.nameColor || '#8b5cf6' }}>
                          {otherProfile?.displayName?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                )}
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl shadow-sm relative group ${
                  isMe 
                    ? 'bg-primary text-white rounded-bl-none' 
                    : 'bg-card text-foreground rounded-br-none'
                }`}>
                  {msg.type === 'text' && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
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
                  <div className={`text-[9px] mt-1 flex justify-end ${isMe ? 'text-white/70' : 'text-muted-foreground'}`}>
                    {msg.createdAt?.toDate ? format(msg.createdAt.toDate(), 'HH:mm') : '...'}
                  </div>
                </div>
              </div>
            );
          })}
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
          <div className="flex-1 relative">
            <Input
              placeholder="اكتب رسالة..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
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
      {isCalling && (
        <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center text-white p-6">
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <Avatar className="h-32 w-32 border-4 border-primary animate-pulse">
                <AvatarImage src={otherProfile?.photoURL} />
                <AvatarFallback className="text-4xl font-bold" style={{ backgroundColor: otherProfile?.nameColor }}>
                  {otherProfile?.displayName?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className={`absolute -top-2 -right-2 p-2 rounded-full ${callType === 'video' ? 'bg-blue-500' : 'bg-green-500'}`}>
                {callType === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold mb-1">{otherProfile?.displayName}</h3>
              <p className="text-primary animate-pulse">جاري الاتصال {callType === 'video' ? 'فيديو' : 'صوتي'}...</p>
            </div>
          </div>
          <div className="flex gap-8 mb-12">
            <Button variant="destructive" size="icon" className="w-16 h-16 rounded-full shadow-2xl shadow-red-500/20" onClick={() => setIsCalling(false)}>
              <Phone className="w-8 h-8 rotate-[135deg]" />
            </Button>
            <Button 
              variant="secondary" 
              size="icon" 
              className={`w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 border-none ${callType === 'video' ? 'text-blue-400' : ''}`}
              onClick={() => setCallType(callType === 'video' ? 'voice' : 'video')}
            >
              <Video className="w-8 h-8" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
