import { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, addDoc, serverTimestamp, or, doc, getDoc, setDoc } from 'firebase/firestore';
import { Chat, UserProfile } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, Settings, Edit, UserPlus, LogOut, Bot, Loader2 } from 'lucide-react';
import { auth } from '@/firebase';
import { format } from 'date-fns';
import { Language, translations } from '@/lib/i18n';

interface ChatListProps {
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  currentUser: UserProfile | null;
  language: Language;
}

export function ChatList({ activeChatId, onSelectChat, onOpenProfile, onOpenSettings, currentUser, language }: ChatListProps) {
  const t = translations[language];
  const [chats, setChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [otherProfiles, setOtherProfiles] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const chatData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chat));
        // Sort manually to avoid composite index requirement
        chatData.sort((a, b) => {
          const timeA = a.updatedAt?.toMillis?.() || 0;
          const timeB = b.updatedAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        setChats(chatData);

        // Fetch other participants profiles
        const otherIds = Array.from(new Set(chatData.flatMap(c => c.participants.filter(p => p !== currentUser.uid))));
        if (otherIds.length > 0) {
          const profiles: Record<string, UserProfile> = { ...otherProfiles };
          for (const id of otherIds) {
            if (!profiles[id]) {
              const docSnap = await getDoc(doc(db, 'users', id));
              if (docSnap.exists()) {
                profiles[id] = docSnap.data() as UserProfile;
              }
            }
          }
          setOtherProfiles(profiles);
        }
      } catch (err) {
        console.error("Error in chat snapshot:", err);
      }
    }, (err) => {
      console.error("Snapshot listener error:", err);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const q = query(
      collection(db, 'users'),
      where('phoneNumber', '>=', val),
      where('phoneNumber', '<=', val + '\uf8ff'),
      limit(5)
    );
    
    const snapshot = await getDocs(q);
    const results = snapshot.docs
      .map(doc => doc.data() as UserProfile)
      .filter(u => u.uid !== currentUser?.uid);
    setSearchResults(results);
  };

  const startChat = async (targetUser: UserProfile) => {
    if (!currentUser) return;

    const existingChat = (chats || []).find(c => c.participants.includes(targetUser.uid));
    if (existingChat) {
      onSelectChat(existingChat.id);
      setIsSearching(false);
      setSearchQuery('');
      return;
    }

    const newChat = {
      participants: [currentUser.uid, targetUser.uid],
      updatedAt: serverTimestamp(),
      lastMessage: {
        text: 'بدأت محادثة جديدة',
        senderId: currentUser.uid,
        createdAt: serverTimestamp()
      }
    };

    const docRef = await addDoc(collection(db, 'chats'), newChat);
    onSelectChat(docRef.id);
    setIsSearching(false);
    setSearchQuery('');
  };

  const [systemLoading, setSystemLoading] = useState(false);

  const startSystemChat = async () => {
    if (!currentUser || systemLoading) return;
    setSystemLoading(true);
    
    try {
      const systemUser: UserProfile = {
        uid: 'teleiraq-system',
        phoneNumber: '+964000000000',
        displayName: 'نظام تليعراق',
        status: 'الدعم الفني والآلي',
        nameColor: '#8b5cf6',
        photoURL: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png'
      };

      // Ensure system user exists in Firestore
      await setDoc(doc(db, 'users', systemUser.uid), systemUser, { merge: true });
      
      // Check if chat already exists in DB directly to be sure
      const q = query(
        collection(db, 'chats'), 
        where('participants', 'array-contains', currentUser.uid)
      );
      const snap = await getDocs(q);
      const existing = snap.docs.find(d => d.data().participants.includes(systemUser.uid));

      if (existing) {
        onSelectChat(existing.id);
      } else {
        const newChat = {
          participants: [currentUser.uid, systemUser.uid],
          updatedAt: serverTimestamp(),
          lastMessage: {
            text: 'أهلاً بك في تليعراق! أنا النظام الآلي.',
            senderId: systemUser.uid,
            createdAt: serverTimestamp()
          }
        };
        const docRef = await addDoc(collection(db, 'chats'), newChat);
        
        // Add the actual message to the subcollection
        await addDoc(collection(db, 'chats', docRef.id, 'messages'), {
          chatId: docRef.id,
          senderId: systemUser.uid,
          text: 'أهلاً بك في تليعراق! أنا النظام الآلي. كيف يمكنني مساعدتك اليوم؟ 🇮🇶',
          type: 'text',
          createdAt: serverTimestamp()
        });
        
        onSelectChat(docRef.id);
      }
      setIsSearching(false);
      setSearchQuery('');
    } catch (err) {
      console.error("System chat error:", err);
    } finally {
      setSystemLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card" dir="rtl">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b">
        <div className="flex items-center gap-3 cursor-pointer" onClick={onOpenProfile}>
          <Avatar className="h-10 w-10 border-2 border-primary/20">
            <AvatarImage src={currentUser?.photoURL} />
            <AvatarFallback className="text-white font-bold" style={{ backgroundColor: currentUser?.nameColor || '#8b5cf6' }}>
              {currentUser?.displayName?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-bold text-sm leading-tight">{t.appName}</span>
            <span className="text-[10px] text-muted-foreground">{t.byAuthor}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full hover:bg-blue-500/10 hover:text-blue-500" 
            onClick={startSystemChat}
            disabled={systemLoading}
            title="محادثة تجريبية مع النظام"
          >
            {systemLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bot className="h-5 w-5" />}
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 hover:text-primary" onClick={() => setIsSearching(!isSearching)}>
            <Edit className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-primary/10 hover:text-primary" onClick={onOpenSettings}>
            <Settings className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-destructive/10 hover:text-destructive" onClick={() => auth.signOut()}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t.searchPlaceholder}
            className="pr-9 bg-muted/50 border-none rounded-xl h-10 focus-visible:ring-primary/30"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {isSearching || searchQuery.length >= 3 ? (
            <div className="space-y-1">
              <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.searchResults}</p>
              {searchResults.length > 0 ? (
                searchResults.map(user => (
                  <button
                    key={user.uid}
                    onClick={() => startChat(user)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-right"
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={user.photoURL} />
                      <AvatarFallback className="text-white" style={{ backgroundColor: user.nameColor || '#8b5cf6' }}>
                        {user.displayName?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: user.nameColor }}>{user.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.phoneNumber}</p>
                    </div>
                  </button>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-center text-muted-foreground">{t.noUsersFound}</p>
              )}
            </div>
          ) : (
            chats.map(chat => {
              const otherParticipantId = chat.participants.find(p => p !== currentUser?.uid);
              const otherProfile = otherParticipantId ? otherProfiles[otherParticipantId] : null;
              
              return (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-right ${
                    activeChatId === chat.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-accent'
                  }`}
                >
                  <Avatar className="h-12 w-12 border-2 border-white/10">
                    <AvatarImage src={otherProfile?.photoURL} />
                    <AvatarFallback className="text-white" style={{ backgroundColor: otherProfile?.nameColor || '#8b5cf6' }}>
                      {otherProfile?.displayName?.slice(0, 2).toUpperCase() || 'CH'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <p className="font-bold text-sm truncate" style={{ color: activeChatId === chat.id ? 'white' : otherProfile?.nameColor }}>
                        {otherProfile?.displayName || 'مستخدم تليعراق'}
                      </p>
                      <span className={`text-[10px] ${activeChatId === chat.id ? 'text-white/70' : 'text-muted-foreground'}`}>
                        {chat.updatedAt?.toDate ? format(chat.updatedAt.toDate(), 'HH:mm') : ''}
                      </span>
                    </div>
                    <p className={`text-xs truncate ${activeChatId === chat.id ? 'text-white/80' : 'text-muted-foreground'}`}>
                      {chat.lastMessage?.senderId === currentUser?.uid ? t.you : ''}
                      {chat.lastMessage?.text || (chat.lastMessage?.senderId ? 'أرسل ملفاً' : t.startChat)}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Floating Action Button */}
      {!isSearching && (
        <Button 
          onClick={() => setIsSearching(true)}
          className="absolute bottom-6 left-6 w-14 h-14 rounded-full shadow-xl purple-gradient hover:scale-110 transition-transform z-20"
        >
          <UserPlus className="w-6 h-6" />
        </Button>
      )}
    </div>
  );
}
