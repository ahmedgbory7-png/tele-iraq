import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, addDoc, serverTimestamp, or, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { Chat, UserProfile } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, Settings, Edit, UserPlus, LogOut, Bot, Loader2, Users, Trash2 } from 'lucide-react';
import { auth } from '@/firebase';
import { format } from 'date-fns';
import { Language, translations } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { motion, AnimatePresence } from 'motion/react';

import { ar } from 'date-fns/locale';
import { useStore } from '@/store/useStore';

export function ChatList() {
  const { 
    activeChatId, 
    setActiveChatId, 
    setShowProfile, 
    setShowSettings, 
    profile: currentUser, 
    language,
    currentTab,
    setCurrentTab,
    setViewingProfileId
  } = useStore();
  
  const t = translations[language];
  const [chats, setChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [otherProfiles, setOtherProfiles] = useState<Record<string, UserProfile>>({});
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contacts, setContacts] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setChats([]);
      setOtherProfiles({});
      setContacts([]);
      setSearchResults([]);
      setSearchQuery('');
      return;
    }

    const fetchContacts = async () => {
      try {
        const q = query(collection(db, 'users'), limit(100));
        const snap = await getDocs(q);
        setContacts(snap.docs.map(d => d.data() as UserProfile).filter(u => u.uid !== currentUser.uid));
      } catch (err) {
        console.error("Error fetching contacts:", err);
      }
    };
    fetchContacts();

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
    if (!val.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    
    // Local search first in loaded contacts
    const localResults = contacts.filter(c => 
      c.displayName?.toLowerCase().includes(val.toLowerCase()) || 
      c.phoneNumber?.includes(val)
    );
    
    if (val.length >= 3) {
      const q = query(
        collection(db, 'users'),
        where('phoneNumber', '>=', val),
        where('phoneNumber', '<=', val + '\uf8ff'),
        limit(10)
      );
      
      try {
        const snapshot = await getDocs(q);
        const remoteResults = snapshot.docs
          .map(doc => doc.data() as UserProfile)
          .filter(u => u.uid !== currentUser?.uid);
        
        // Merge and deduplicate
        const merged = [...localResults];
        remoteResults.forEach(r => {
          if (!merged.find(m => m.uid === r.uid)) merged.push(r);
        });
        setSearchResults(merged);
      } catch (err) {
        console.error("Search error:", err);
        setSearchResults(localResults);
      }
    } else {
      setSearchResults(localResults);
    }
  };

  const startChat = async (targetUser: UserProfile) => {
    if (!currentUser) return;

    const existingChat = (chats || []).find(c => c.participants.includes(targetUser.uid));
    if (existingChat) {
      setActiveChatId(existingChat.id);
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
    setActiveChatId(docRef.id);
    setIsSearching(false);
    setSearchQuery('');
  };

  const handleInvite = () => {
    if (navigator.share) {
      navigator.share({
        title: 'تليعراق',
        text: 'انضم إلينا في تطبيق تليعراق - تواصل بحرية وأمان!',
        url: window.location.href,
      }).catch(console.error);
    } else {
      // Fallback for browsers that do not support navigator.share
      navigator.clipboard.writeText(`انضم إلينا في تطبيق تليعراق: ${window.location.href}`);
      alert('تم نسخ رابط الدعوة إلى الحافظة!');
    }
  };

  const createGroup = async () => {
    if (!currentUser || !groupName.trim() || selectedContacts.length === 0) return;

    const newChat = {
      participants: [currentUser.uid, ...selectedContacts],
      updatedAt: serverTimestamp(),
      isGroup: true,
      groupName: groupName.trim(),
      admins: [currentUser.uid], // Creator is the first admin
      lastMessage: {
        text: `تم إنشاء المجموعة بواسطة ${currentUser.displayName}`,
        senderId: currentUser.uid,
        createdAt: serverTimestamp()
      }
    };

    const docRef = await addDoc(collection(db, 'chats'), newChat);
    setActiveChatId(docRef.id);
    setIsCreateGroupOpen(false);
    setGroupName('');
    setSelectedContacts([]);
    
    // Switch to chats tab so user sees their new group
    setCurrentTab('chats');
  };

  const deleteChat = async (chatId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه المحادثة؟')) return;
    try {
      await deleteDoc(doc(db, 'chats', chatId));
      if (activeChatId === chatId) setActiveChatId(null);
    } catch (err) {
      console.error("Error deleting chat:", err);
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!currentUser) return;

    if (window.confirm('هل أنت متأكد من حذف هذه الدردشة بالكامل؟')) {
      try {
        await deleteDoc(doc(db, 'chats', chatId));
        if (activeChatId === chatId) {
          setActiveChatId(null);
        }
      } catch (err) {
        console.error("Error deleting chat:", err);
      }
    }
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
      
      // Check if private chat already exists in DB directly to be sure
      const q = query(
        collection(db, 'chats'), 
        where('participants', 'array-contains', currentUser.uid)
      );
      const snap = await getDocs(q);
      const existing = snap.docs.find(d => {
        const data = d.data();
        return !data.isGroup && data.participants.includes(systemUser.uid) && data.participants.length === 2;
      });

      if (existing) {
        setActiveChatId(existing.id);
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
        
        setActiveChatId(docRef.id);
      }
      setIsSearching(false);
      setSearchQuery('');
    } catch (err) {
      console.error("System chat error:", err);
    } finally {
      setSystemLoading(false);
    }
  };

  if (currentTab === 'contacts') {
    const sortedContacts = [...(searchQuery.length > 0 ? searchResults : contacts)].sort((a, b) => 
      (a.displayName || '').localeCompare(b.displayName || '', 'ar')
    );

    return (
      <div className="flex flex-col h-full bg-card" dir="rtl">
        <div className="p-4 border-b flex items-center justify-between bg-background sticky top-0 z-10">
          <h2 className="text-xl font-bold">جهات الاتصال</h2>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setIsSearching(!isSearching)}>
            <Search className="h-5 w-5" />
          </Button>
        </div>
        
        {isSearching && (
          <div className="px-4 py-2 border-b animate-in slide-in-from-top duration-200">
            <Input
              autoFocus
              placeholder="البحث في جهات الاتصال..."
              className="bg-muted/50 border-none rounded-xl h-10 focus-visible:ring-primary/30"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        )}

      <div className="flex-1 overflow-y-auto no-scrollbar overscroll-contain">
        <div className="p-2 space-y-1">
          {/* Action Items */}
            {!searchQuery && (
              <div className="space-y-1 mb-4">
                <Button variant="ghost" className="w-full justify-start gap-4 h-14 rounded-2xl px-4 hover:bg-primary/5 group" onClick={() => setIsCreateGroupOpen(true)}>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <Users className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-sm">مجموعة جديدة</span>
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start gap-4 h-14 rounded-2xl px-4 hover:bg-blue-500/5 group"
                  onClick={handleInvite}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-sm">دعوة أصدقاء</span>
                </Button>
                <Button variant="ghost" className="w-full justify-start gap-4 h-14 rounded-2xl px-4 hover:bg-orange-500/5 group" onClick={startSystemChat}>
                  <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
                    <Bot className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-sm">الدعم الفني</span>
                </Button>
              </div>
            )}

            {/* List */}
            {sortedContacts.length > 0 ? (
              sortedContacts.map((user, idx) => {
                const firstLetter = user.displayName?.[0]?.toUpperCase() || '#';
                const showHeader = idx === 0 || sortedContacts[idx - 1].displayName?.[0]?.toUpperCase() !== firstLetter;

                return (
                  <div key={user.uid}>
                    {showHeader && !searchQuery && (
                      <div className="px-4 py-2 text-[10px] font-bold text-primary uppercase tracking-widest mt-2">{firstLetter}</div>
                    )}
                    <div
                      key={user.uid}
                      className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-accent transition-all text-right cursor-pointer active:scale-[0.98]"
                    >
                      <Avatar 
                        className="h-12 w-12 border-2 border-primary/10 shadow-sm hover:ring-2 ring-primary/30 transition-all cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingProfileId(user.uid);
                        }}
                      >
                        <AvatarImage src={user.photoURL} />
                        <AvatarFallback style={{ backgroundColor: user.nameColor || '#8b5cf6' }} className="text-white font-bold text-sm">
                          {user.displayName?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0" onClick={() => startChat(user)}>
                        <p className={`font-bold text-sm truncate ${user.nameColor === 'magic' ? 'magic-color-text' : ''}`} style={{ color: user.nameColor === 'magic' ? undefined : (user.nameColor || 'inherit') }}>
                          {user.displayName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">{user.status || 'متوفر'}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-20 text-center space-y-4 opacity-50">
                <Search className="w-12 h-12 mx-auto text-muted-foreground" />
                <p className="text-sm">لم يتم العثور على أي جهات اتصال</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card shadow-inner" dir="rtl">
      {/* Header */}
      <div className="glass-header p-4 flex items-center justify-between safe-top">
        <motion.div 
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-3 cursor-pointer" 
          onClick={() => setShowProfile(true)}
        >
          <Avatar className="h-10 w-10 border-2 border-primary/20 shadow-sm">
            <AvatarImage src={currentUser?.photoURL} />
            <AvatarFallback className="text-white font-bold" style={{ backgroundColor: currentUser?.nameColor || '#8b5cf6' }}>
              {currentUser?.displayName?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-bold text-sm leading-tight">{t.appName}</span>
            <span className="text-[10px] text-muted-foreground">{t.byAuthor}</span>
          </div>
        </motion.div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="rounded-full ios-touch" onClick={() => setIsSearching(!isSearching)}>
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full ios-touch" onClick={() => setIsCreateGroupOpen(true)} title="إنشاء مجموعة">
            <Users className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Search */}
      {isSearching && (
        <div className="px-4 py-2 border-b animate-in slide-in-from-top duration-200">
          <Input
            autoFocus
            placeholder={t.searchPlaceholder}
            className="bg-muted/50 border-none rounded-xl h-10 focus-visible:ring-primary/30"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto no-scrollbar overscroll-contain">
        <div className="p-2 space-y-1">
          {isSearching || searchQuery.length >= 3 ? (
            <div className="space-y-1">
              <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.searchResults}</p>
              {searchResults.length > 0 ? (
                searchResults.map(user => (
                  <div
                    key={user.uid}
                    role="button"
                    tabIndex={0}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-right cursor-pointer"
                  >
                    <Avatar 
                      className="h-12 w-12 border border-border/50 hover:ring-2 ring-primary/30 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingProfileId(user.uid);
                      }}
                    >
                      <AvatarImage src={user.photoURL} />
                      <AvatarFallback 
                        className={`text-white font-bold bg-muted-foreground/20 text-muted-foreground`} 
                      >
                        {user.displayName?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div 
                      className="flex-1 min-w-0"
                      onClick={() => startChat(user)}
                    >
                      <p 
                        className={`font-semibold text-sm truncate ${user.nameColor === 'magic' ? 'magic-color-text' : ''}`} 
                        style={{ color: user.nameColor === 'magic' ? undefined : (user.nameColor || '#141414') }}
                      >
                        {user.displayName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user.phoneNumber}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-center text-muted-foreground">{t.noUsersFound}</p>
              )}
            </div>
          ) : (
            chats.map(chat => {
              const isGroup = chat.isGroup;
              const otherParticipantId = !isGroup ? chat.participants.find(p => p !== currentUser?.uid) : null;
              const otherProfile = otherParticipantId ? otherProfiles[otherParticipantId] : null;
              
              const displayName = isGroup ? chat.groupName : (otherProfile?.displayName || 'مستخدم تليعراق');
              const photoURL = isGroup ? chat.groupPhoto : otherProfile?.photoURL;
              const nameColor = isGroup ? '#8b5cf6' : (otherProfile?.nameColor || '#8b5cf6');

              return (
                <div key={chat.id} className="relative overflow-hidden rounded-xl">
                  {/* Delete Action Background */}
                  <div className="absolute inset-0 bg-destructive flex items-center justify-end px-6">
                    <Trash2 className="h-5 w-5 text-white" />
                  </div>

                  <motion.div
                    drag="x"
                    dragConstraints={{ left: -100, right: 0 }}
                    dragElastic={0.1}
                    onDragEnd={(e, info) => {
                      if (info.offset.x < -80) {
                        deleteChat(chat.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveChatId(chat.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setActiveChatId(chat.id)}
                    whileTap={{ scale: 0.98 }}
                    className={`relative w-full flex items-center gap-3 p-3 transition-all text-right group cursor-pointer bg-card ios-touch ${
                      activeChatId === chat.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-accent'
                    }`}
                  >
                    <Avatar 
                      className="h-12 w-12 border-2 border-white/10 hover:ring-2 ring-primary/30 transition-all cursor-pointer"
                      onClick={(e) => {
                        if (!isGroup && otherParticipantId) {
                          e.stopPropagation();
                          setViewingProfileId(otherParticipantId);
                        }
                      }}
                    >
                      <AvatarImage src={photoURL} />
                      <AvatarFallback 
                        className={`text-white font-bold bg-muted-foreground/20 text-muted-foreground`} 
                      >
                        {displayName?.slice(0, 2).toUpperCase() || 'CH'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <p 
                          className={`font-bold text-sm truncate ${nameColor === 'magic' ? (activeChatId === chat.id ? '' : 'magic-color-text') : ''}`} 
                          style={{ color: activeChatId === chat.id ? 'white' : (nameColor === 'magic' ? undefined : (nameColor || '#141414')) }}
                        >
                          {displayName}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] ${activeChatId === chat.id ? 'text-white/70' : 'text-muted-foreground'}`}>
                            {chat.updatedAt?.toDate ? format(chat.updatedAt.toDate(), 'hh:mm a', { locale: ar }) : ''}
                          </span>
                        </div>
                      </div>
                      <p className={`text-xs truncate ${activeChatId === chat.id ? 'text-white/80' : 'text-muted-foreground'}`}>
                        {chat.lastMessage?.senderId === currentUser?.uid ? t.you : ''}
                        {chat.lastMessage?.text || (chat.lastMessage?.senderId ? 'أرسل ملفاً' : t.startChat)}
                      </p>
                    </div>
                  </motion.div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create Group Dialog */}
      <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
        <DialogContent className="sm:max-w-[425px]" dir="rtl">
          <DialogHeader>
            <DialogTitle>إنشاء مجموعة جديدة</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">اسم المجموعة</label>
              <Input 
                placeholder="أدخل اسم المجموعة..." 
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">اختر الأعضاء</label>
              <div className="h-[200px] border rounded-md p-2 overflow-y-auto overscroll-contain">
                {contacts.map(contact => (
                  <div key={contact.uid} className="flex items-center gap-3 p-2 hover:bg-accent rounded-md cursor-pointer" onClick={() => {
                    setSelectedContacts(prev => 
                      prev.includes(contact.uid) 
                        ? prev.filter(id => id !== contact.uid) 
                        : [...prev, contact.uid]
                    );
                  }}>
                    <Checkbox checked={selectedContacts.includes(contact.uid)} />
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={contact.photoURL} />
                      <AvatarFallback style={{ backgroundColor: contact.nameColor }}>{contact.displayName?.slice(0,2)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{contact.displayName}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateGroupOpen(false)}>إلغاء</Button>
            <Button onClick={createGroup} disabled={!groupName.trim() || selectedContacts.length === 0}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
