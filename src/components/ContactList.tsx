import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove, deleteField, serverTimestamp, limit, addDoc, setDoc } from 'firebase/firestore';
import { UserProfile, Chat } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, UserPlus, Loader2, BadgeCheck, X, Plus, UserMinus, MessageSquare, User, Bot, Phone, Share2, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GroupedVirtuoso } from 'react-virtuoso';
import { useStore } from '@/store/useStore';
import { translations } from '@/lib/i18n';
import { getNameColorClass, isMagicColor } from '@/lib/utils';

import { ScrollArea } from '@/components/ui/scroll-area';

export function ContactList() {
  const { 
    profile: currentUser, 
    language,
    setActiveChatId,
    setViewingProfileId,
    setQuotaExceeded,
    quotaExceeded
  } = useStore();
  
  const t = translations[language];
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdatingFriend, setIsUpdatingFriend] = useState<string | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [confirmingContact, setConfirmingContact] = useState<{ user: UserProfile; type: 'add' | 'remove' } | null>(null);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const processedMissingIds = useRef<Set<string>>(new Set());
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Derive friends list reactively from profile
  const friendsList = useMemo(() => {
    if (!currentUser?.friends) return [];
    const details = currentUser.friendDetails || {};
    return currentUser.friends
      .filter(id => id && id !== currentUser.uid)
      .map(id => {
        const detail = details[id];
        return {
          uid: id,
          displayName: detail?.displayName || 'مستخدم',
          photoURL: detail?.photoURL || '',
          nameColor: detail?.nameColor || '',
          isVerified: !!detail?.isVerified,
          phoneNumber: detail?.phoneNumber || ''
        } as UserProfile;
      });
  }, [currentUser?.friends, currentUser?.friendDetails]);

  // Fetch missing friend details in the background
  useEffect(() => {
    if (!currentUser?.uid || !currentUser?.friends) return;

    const friendIds = currentUser.friends || [];
    const detailsMap = currentUser.friendDetails || {};
    const missingIds = friendIds.filter(id => id && id !== currentUser.uid && !detailsMap[id] && !processedMissingIds.current.has(id));

    if (missingIds.length > 0) {
      const fetchMissing = async () => {
        if (quotaExceeded) return;
        // Chunk missing IDs into groups of 30 (Firestore 'in' limit)
        const chunks = [];
        for (let i = 0; i < missingIds.length; i += 30) {
          chunks.push(missingIds.slice(i, i + 30));
        }

        const batchUpdates: Record<string, any> = {};
        
        for (const chunk of chunks) {
          try {
            chunk.forEach(id => processedMissingIds.current.add(id));
            const q = query(collection(db, 'users'), where('uid', 'in', chunk));
            const querySnapshot = await getDocs(q);
            
            querySnapshot.forEach(d => {
              const data = d.data() as UserProfile;
              batchUpdates[`friendDetails.${data.uid}`] = {
                displayName: data.displayName || 'مستخدم',
                photoURL: data.photoURL || '',
                nameColor: data.nameColor || '',
                isVerified: !!data.isVerified,
                phoneNumber: data.phoneNumber || ''
              };
            });
          } catch (err: any) {
            console.error("Error fetching missing friends batch:", err);
            if (err.code === 'resource-exhausted') setQuotaExceeded(true);
          }
        }

        if (Object.keys(batchUpdates).length > 0) {
          updateDoc(doc(db, 'users', currentUser.uid), batchUpdates).catch(console.error);
        }
      };
      fetchMissing();
    }
  }, [currentUser?.uid, currentUser?.friends]);

  const getParticipantProfiles = (users: UserProfile[]) => {
    const profiles: Record<string, any> = {};
    users.forEach(u => {
      profiles[u.uid] = {
        displayName: u.displayName || 'مستخدم',
        photoURL: u.photoURL || '',
        nameColor: u.nameColor || '',
        isVerified: u.isVerified || false,
        phoneNumber: u.phoneNumber || ''
      };
    });
    return profiles;
  };

  const startSystemChat = async () => {
    if (!currentUser || systemLoading) return;
    setSystemLoading(true);
    
    try {
      const systemUser: UserProfile = {
        uid: 'teleiraq-system',
        phoneNumber: '+964000000000',
        displayName: 'تلي عراق (الدعم الفني)',
        status: 'دائماً في خدمتك 🇮🇶 تم تطويري بالذكاء الاصطناعي',
        nameColor: 'magic_rb',
        isVerified: true,
        photoURL: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png'
      };
      
      const sysDoc = await getDoc(doc(db, 'users', systemUser.uid));
      if (!sysDoc.exists()) {
        await setDoc(doc(db, 'users', systemUser.uid), {
          ...systemUser,
          createdAt: serverTimestamp()
        });
      }
      
      const q = query(
        collection(db, 'chats'), 
        where('participants', 'array-contains', currentUser.uid)
      );
      const snap = await getDocs(q);
      const existing = snap.docs.find(d => {
        const data = d.data();
        return !data.isGroup && Array.isArray(data.participants) && data.participants.includes(systemUser.uid) && data.participants.length === 2;
      });

      if (existing) {
        setActiveChatId(existing.id);
      } else {
        const newChat = {
          participants: [currentUser.uid, systemUser.uid],
          participantProfiles: getParticipantProfiles([currentUser, systemUser]),
          updatedAt: serverTimestamp(),
          lastMessage: {
            text: 'أهلاً بك في تلي عراق! أنا النظام الآلي.',
            senderId: systemUser.uid,
            createdAt: serverTimestamp()
          }
        };
        const docRef = await addDoc(collection(db, 'chats'), newChat);
        await addDoc(collection(db, 'chats', docRef.id, 'messages'), {
          chatId: docRef.id,
          senderId: systemUser.uid,
          text: 'أهلاً بك في تلي عراق! أنا النظام الآلي. كيف يمكنني مساعدتك اليوم؟ 🇮🇶',
          type: 'text',
          createdAt: serverTimestamp()
        });
        setActiveChatId(docRef.id);
      }
    } catch (err) {
      console.error("System chat error:", err);
    } finally {
      setSystemLoading(false);
    }
  };

  // Sorting and grouping logic
  const contactsData = useMemo(() => {
    // If searching, we show search results, otherwise we show friends from reactive list
    const list = [...(searchQuery.length > 0 ? searchResults : friendsList)];
    
    // Improved sorting for Arabic
    list.sort((a, b) => {
      const nameA = (a.displayName || '').replace(/^الـ|^ال/g, '');
      const nameB = (b.displayName || '').replace(/^الـ|^ال/g, '');
      return nameA.localeCompare(nameB, 'ar');
    });

    const counts: number[] = [];
    const groupLetters: string[] = [];
    let currentCount = 0;
    let currentLetter = '';

    list.forEach((user, idx) => {
      let name = user.displayName || '#';
      let letter = name.replace(/^الـ|^ال/g, '')[0]?.toUpperCase() || '#';
      if (/[أإآ]/.test(letter)) letter = 'ا';

      if (idx === 0) {
        currentLetter = letter;
        currentCount = 1;
        groupLetters.push(letter);
      } else if (letter === currentLetter) {
        currentCount++;
      } else {
        counts.push(currentCount);
        currentLetter = letter;
        currentCount = 1;
        groupLetters.push(letter);
      }
    });

    if (currentCount > 0) counts.push(currentCount);

    return { list, counts, groupLetters };
  }, [searchQuery, searchResults, friendsList]);

  // Removed old useEffect for fetching contacts manually as it's now derived

  // Arabic normalization for fuzzy search
  const normalizeArabic = (text: string) => {
    return text
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ئ/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/[\u064B-\u0652]/g, '') // Remove Harakat
      .toLowerCase()
      .trim();
  };

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!val.trim()) {
      setSearchResults([]);
      return;
    }

    // Debounce remote search to save quota
    searchTimeoutRef.current = setTimeout(async () => {
      const normalizedQuery = normalizeArabic(val);
      const rawVal = val.toLowerCase().trim();

      // Local search first (fast, no quota cost)
      const local = friendsList.filter(c => {
        const normalizedName = normalizeArabic(c.displayName || '');
        const phone = (c.phoneNumber || '').replace(/\s+/g, '');
        const email = (c.email || '').toLowerCase();
        
        return normalizedName.includes(normalizedQuery) || 
              phone.includes(rawVal) ||
              email.includes(rawVal);
      });
      setSearchResults(local);

      // Remote search for potential new contacts
      if (val.length >= 3 && !quotaExceeded) {
        setIsSearching(true);
        try {
          const isNumSearch = /^[0-9+]+$/.test(rawVal);
          let remoteQueries = [];
          
          if (isNumSearch) {
            // Phone search - handle +964 and local 07 prefix
            const phoneQueries = [
              getDocs(query(collection(db, 'users'), where('phoneNumber', '>=', rawVal), where('phoneNumber', '<=', rawVal + '\uf8ff'), limit(10)))
            ];
            if (rawVal.startsWith('07')) {
               const intVal = '+964' + rawVal.substring(1);
               phoneQueries.push(getDocs(query(collection(db, 'users'), where('phoneNumber', '>=', intVal), where('phoneNumber', '<=', intVal + '\uf8ff'), limit(10))));
            }
            remoteQueries = phoneQueries;
          } else {
            // Name/Username search
            remoteQueries = [
              getDocs(query(collection(db, 'users'), where('displayName', '>=', val), where('displayName', '<=', val + '\uf8ff'), limit(10))),
              getDocs(query(collection(db, 'users'), where('username', '>=', val.toLowerCase()), where('username', '<=', val.toLowerCase() + '\uf8ff'), limit(10))),
            ];
          }
          
          const results = await Promise.allSettled(remoteQueries);
          const remoteProfiles: UserProfile[] = [];
          
          results.forEach(result => {
            if (result.status === 'fulfilled') {
              result.value.docs.forEach(d => {
                const data = d.data() as UserProfile;
                if (data.uid !== currentUser?.uid && !remoteProfiles.find(r => r.uid === data.uid)) {
                  remoteProfiles.push(data);
                }
              });
            }
          });

          // Merge results
          const merged = [...local];
          remoteProfiles.forEach(rp => {
            if (!merged.find(m => m.uid === rp.uid)) {
              if (!isNumSearch) {
                const normalizedRPName = normalizeArabic(rp.displayName || '');
                if (normalizedRPName.includes(normalizedQuery)) {
                  merged.push(rp);
                }
              } else {
                merged.push(rp);
              }
            }
          });
          setSearchResults(merged);
        } catch (err: any) {
          if (err.code === 'resource-exhausted') setQuotaExceeded(true);
          console.error("Remote search error:", err);
        } finally {
          setIsSearching(false);
        }
      }
    }, 300);
  };

  const toggleFriend = async (target: UserProfile) => {
    if (!currentUser?.uid || !target.uid) return;
    setIsUpdatingFriend(target.uid);
    
    try {
      const friends = Array.isArray(currentUser.friends) ? currentUser.friends : [];
      const isFriend = friends.includes(target.uid);
      const userRef = doc(db, 'users', currentUser.uid);
      
      if (isFriend) {
        await updateDoc(userRef, {
          friends: arrayRemove(target.uid),
          [`friendDetails.${target.uid}`]: deleteField()
        });
        useStore.getState().setAppAlert({
          id: Date.now().toString(),
          message: `تم حذف ${target.displayName} من جهات اتصالك`,
          type: 'info'
        });
      } else {
        await updateDoc(userRef, {
          friends: arrayUnion(target.uid),
          [`friendDetails.${target.uid}`]: {
            displayName: target.displayName || 'مستخدم تلي عراق',
            photoURL: target.photoURL || '',
            nameColor: target.nameColor || '',
            isVerified: !!target.isVerified,
            phoneNumber: target.phoneNumber || ''
          }
        });
        useStore.getState().setAppAlert({
          id: Date.now().toString(),
          message: `تمت إضافة ${target.displayName} لجهات اتصالك بنجاح ✨`,
          type: 'info'
        });
      }
    } catch (err: any) {
      console.error("Error toggling friend:", err);
      if (err.code === 'resource-exhausted') setQuotaExceeded(true);
      useStore.getState().setAppAlert({
        id: Date.now().toString(),
        message: 'فشل تحديث قائمة الاتصال. يرجى المحاولة لاحقاً.',
        type: 'error'
      });
    } finally {
      setIsUpdatingFriend(null);
      setConfirmingContact(null);
    }
  };

  const onToggleClick = (e: React.MouseEvent, user: UserProfile) => {
    e.stopPropagation();
    const friends = Array.isArray(currentUser?.friends) ? currentUser.friends : [];
    const isFriend = friends.includes(user.uid);
    setConfirmingContact({ user, type: isFriend ? 'remove' : 'add' });
  };

  const handleShare = async () => {
    const inviteText = `انضم إلي في تليعراق! أفضل تطبيق محادثة عراقي 🇮🇶\n\n${window.location.origin}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'دعوة للانضمام إلى تلي عراق',
          text: inviteText,
          url: window.location.origin,
        });
      } catch (err) {
        console.log('Share failed or cancelled');
      }
    } else {
      setIsInviteDialogOpen(true);
    }
  };

  const copyInviteLink = () => {
    const inviteText = `انضم إلي في تليعراق! أفضل تطبيق محادثة عراقي 🇮🇶\n\n${window.location.origin}`;
    navigator.clipboard.writeText(inviteText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const startChat = async (target: UserProfile) => {
    if (!currentUser?.uid) return;
    
    // Check for existing chat
    try {
      const q = query(
        collection(db, 'chats'),
        where('participants', 'array-contains', currentUser.uid)
      );
      const snap = await getDocs(q);
      const existing = snap.docs.find(d => {
        const data = d.data();
        return !data.isGroup && data.participants?.includes(target.uid);
      });

      if (existing) {
        setActiveChatId(existing.id);
      } else {
        const newChat = {
          participants: [currentUser.uid, target.uid],
          participantProfiles: {
            [currentUser.uid]: {
              displayName: currentUser.displayName || 'أنت',
              photoURL: currentUser.photoURL || '',
              isVerified: !!currentUser.isVerified
            },
            [target.uid]: {
              displayName: target.displayName || 'مستخدم',
              photoURL: target.photoURL || '',
              isVerified: !!target.isVerified
            }
          },
          updatedAt: serverTimestamp(),
          lastMessage: {
            text: 'بدأت محادثة جديدة',
            senderId: currentUser.uid,
            createdAt: serverTimestamp()
          }
        };
        const ref = await addDoc(collection(db, 'chats'), newChat);
        setActiveChatId(ref.id);
      }
    } catch (err) {
      console.error("Error starting chat:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card" dir={language === 'English' ? 'ltr' : 'rtl'}>
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{t.myContacts}</h2>
            <p className="text-[10px] text-muted-foreground">{friendsList.length} {language === 'English' ? 'friend' : 'صديق'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full h-10 w-10 text-primary"
            onClick={handleShare}
          >
            <Share2 className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full h-10 w-10"
            onClick={() => setIsSearchVisible(!isSearchVisible)}
          >
            {isSearchVisible ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <AnimatePresence>
        {isSearchVisible && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b bg-muted/30"
          >
            <div className="p-4">
              <div className="relative">
                <div className="flex-1 relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="ابحث عن اسم، رقم أو بريد إلكتروني..."
                    className="bg-background border-none rounded-2xl h-12 pr-10 pl-12 shadow-sm focus-visible:ring-primary/30"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isSearching && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
                    )}
                    {searchQuery && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-muted"
                        onClick={() => handleSearch('')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 px-1">
                يمكنك البحث عن مستخدمين جدد بإدخال 3 أحرف على الأقل
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contacts List */}
      <ScrollArea className="flex-1 min-h-0 relative">
        <GroupedVirtuoso
          style={{ height: '100%' }}
          data={contactsData.list}
          groupCounts={contactsData.counts}
          groupContent={(index) => (
              <div className="bg-muted/80 backdrop-blur-sm px-6 py-2 text-[10px] font-bold text-primary uppercase tracking-widest border-b sticky top-0 z-[5] flex items-center justify-between">
                <span>{contactsData.groupLetters[index]}</span>
                <span className="bg-primary/10 px-2 py-0.5 rounded-full text-[9px]">{contactsData.counts[index]}</span>
              </div>
            )}
            components={{
              EmptyPlaceholder: () => (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                    <User className="w-10 h-10 text-muted-foreground/30" />
                  </div>
                  <h3 className="font-bold text-lg mb-1">لا توجد جهات اتصال</h3>
                  <p className="text-sm text-muted-foreground max-w-[200px]">
                    {searchQuery ? 'لم نجد أحداً بهذا الاسم' : 'ابدأ بالبحث عن أصدقائك وإضافتهم'}
                  </p>
                  {!isSearchVisible && (
                    <Button 
                      variant="outline" 
                      className="mt-6 rounded-2xl gap-2 border-primary/20 hover:bg-primary/5"
                      onClick={() => setIsSearchVisible(true)}
                    >
                      <Plus className="w-4 h-4" />
                      ابحث عن أصدقاء
                    </Button>
                  )}
                </div>
              )
            }}
            itemContent={(index, _, user) => (
              <div className="px-2 py-0.5">
                {/* Support entry for the first item if not searching */}
                {index === 0 && !searchQuery && (
                   <div className="mb-2 px-1">
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start gap-4 h-16 rounded-3xl px-4 hover:bg-orange-500/5 group transition-all ios-touch" 
                      onClick={startSystemChat}
                      disabled={systemLoading}
                    >
                      <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
                        {systemLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Bot className="w-6 h-6" />}
                      </div>
                      <div className="flex-1 text-right">
                        <p className="font-black text-sm">الدعم الفني والخدمات</p>
                        <p className="text-[10px] text-muted-foreground font-medium">تحدث مع موظف الخدمة فوراً</p>
                      </div>
                    </Button>
                  </div>
                )}
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-4 p-3 rounded-3xl hover:bg-accent/50 transition-all group ios-touch"
                  onClick={() => startChat(user)}
                >
                  <div className="relative" onClick={(e) => { e.stopPropagation(); setViewingProfileId(user.uid); }}>
                    <Avatar className="h-14 w-14 border-2 border-background shadow-md hover:ring-4 ring-primary/20 transition-all cursor-pointer">
                      <AvatarImage src={user.photoURL || undefined} />
                      <AvatarFallback style={{ backgroundColor: user.nameColor || '#8b5cf6' }} className="text-white font-bold text-lg">
                        {(user.displayName?.slice(0, 2) || '').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {user.isVerified && (
                      <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
                        <BadgeCheck className="w-5 h-5 text-blue-500 fill-blue-500/10" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className={`font-bold text-sm truncate ${getNameColorClass(user.nameColor)}`} style={{ color: isMagicColor(user.nameColor) ? undefined : (user.nameColor || 'inherit') }}>
                        {user.displayName}
                      </p>
                      {user.uid === currentUser?.uid && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-bold">أنت</span>}
                      {searchQuery && !currentUser?.friends?.includes(user.uid) && user.uid !== currentUser?.uid && (
                        <span className="text-[9px] bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded-full font-bold">جديد</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate font-medium">
                      {(user as any).username ? `@${(user as any).username}` : (user.status || (user.phoneNumber ? user.phoneNumber : 'متوفر'))}
                    </p>
                  </div>

                  <div className={`flex items-center gap-1 transition-opacity ${searchQuery ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="rounded-full hover:bg-primary/10 text-primary h-10 w-10"
                      onClick={(e) => { e.stopPropagation(); startChat(user); }}
                    >
                      <MessageSquare className="w-5 h-5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={`rounded-full h-10 w-10 ${currentUser?.friends?.includes(user.uid) ? 'text-destructive hover:bg-destructive/10' : 'text-primary hover:bg-primary/10'}`}
                      onClick={(e) => onToggleClick(e, user)}
                      disabled={isUpdatingFriend === user.uid}
                    >
                      {isUpdatingFriend === user.uid ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        currentUser?.friends?.includes(user.uid) ? <UserMinus className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />
                      )}
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          />
      </ScrollArea>

      <Dialog open={!!confirmingContact} onOpenChange={(open) => !open && setConfirmingContact(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl" dir="rtl">
          <div className="p-8 text-center space-y-6">
            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center transition-all ${
              confirmingContact?.type === 'remove' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
            }`}>
              {confirmingContact?.type === 'remove' ? <UserMinus className="w-10 h-10" /> : <UserPlus className="w-10 h-10" />}
            </div>
            
            <div className="space-y-2">
              <DialogTitle className="text-2xl font-black">
                {confirmingContact?.type === 'remove' ? 'حذف جهة اتصال' : 'إضافة جهة اتصال'}
              </DialogTitle>
              <p className="text-muted-foreground leading-relaxed">
                {confirmingContact?.type === 'remove' 
                  ? `هل أنت متأكد من حذف ${confirmingContact?.user.displayName} من قائمة أصدقائك؟`
                  : `هل تود إضافة ${confirmingContact?.user.displayName} إلى قائمة جهات اتصالك؟`
                }
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <Button 
                variant="ghost" 
                className="flex-1 h-12 rounded-2xl font-bold"
                onClick={() => setConfirmingContact(null)}
              >
                إلغاء
              </Button>
              <Button 
                variant={confirmingContact?.type === 'remove' ? "destructive" : "default"}
                className={`flex-1 h-12 rounded-2xl font-bold ${confirmingContact?.type === 'add' ? 'purple-gradient shadow-lg shadow-purple-500/20' : ''}`}
                onClick={() => confirmingContact && toggleFriend(confirmingContact.user)}
                disabled={isUpdatingFriend !== null}
              >
                {isUpdatingFriend ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  confirmingContact?.type === 'remove' ? 'نعم، حذف' : 'تأكيد الإضافة'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl" dir="rtl">
          <div className="p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-full mx-auto bg-primary/10 flex items-center justify-center text-primary">
              <Share2 className="w-10 h-10" />
            </div>
            
            <div className="space-y-2">
              <DialogTitle className="text-2xl font-black">دعوة صديق</DialogTitle>
              <p className="text-muted-foreground leading-relaxed text-sm">
                شارك رابط التطبيق مع أصدقائك لتبدأ المحادثة معهم في تلي عراق
              </p>
            </div>

            <div className="bg-muted/50 p-4 rounded-2xl flex items-center gap-3 border">
              <p className="text-[10px] font-mono flex-1 text-left truncate opacity-70">
                {window.location.origin}
              </p>
              <Button 
                size="sm" 
                className="rounded-xl h-10 px-4"
                onClick={copyInviteLink}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="mr-2 text-xs">{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
              </Button>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button 
                className="w-full h-12 rounded-2xl font-bold purple-gradient shadow-lg"
                onClick={() => {
                  const url = `https://wa.me/?text=${encodeURIComponent(`انضم إلي في تلي عراق! أفضل تطبيق محادثة عراقي 🇮🇶\n\n${window.location.origin}`)}`;
                  window.open(url, '_blank');
                }}
              >
                مشاركة عبر واتساب
              </Button>
              <Button 
                variant="ghost"
                className="w-full h-12 rounded-2xl font-bold"
                onClick={() => setIsInviteDialogOpen(false)}
              >
                إلغاء
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
