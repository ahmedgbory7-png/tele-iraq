import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, addDoc, serverTimestamp, or, doc, getDoc, setDoc, deleteDoc, arrayUnion, arrayRemove, deleteField, updateDoc, writeBatch } from 'firebase/firestore';
import { Chat, UserProfile } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, Settings, Edit, UserPlus, LogOut, Bot, Loader2, Users, Trash2, Check, X, Plus, AlertCircle, BadgeCheck, Pin, AtSign, Filter } from 'lucide-react';
import { auth } from '@/firebase';
import { format } from 'date-fns';
import { Language, translations } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { motion, AnimatePresence } from 'motion/react';
import { Virtuoso } from 'react-virtuoso';

import { ar } from 'date-fns/locale';
import { useStore } from '@/store/useStore';
import { getNameColorClass, isMagicColor } from '@/lib/utils';

// Global cache for suggestions to avoid excessive reads across component mounts
let suggestionsCache: UserProfile[] | null = null;

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
    setViewingProfileId,
    setQuotaExceeded,
    quotaExceeded,
    chats,
    setChats // Keep setChats if we still need sorting logic but App.tsx handles it now
  } = useStore();
  
  const t = translations[language];
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [otherProfiles, setOtherProfiles] = useState<Record<string, UserProfile>>({});
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [isUpdatingFriend, setIsUpdatingFriend] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);

  const [isDeletingChat, setIsDeletingChat] = useState<string | null>(null);
  const [confirmDeleteType, setConfirmDeleteType] = useState<'me' | 'everyone' | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'pinned' | 'mentions'>('all');
  const [friendReels, setFriendReels] = useState<{ userId: string; displayName: string; photoURL?: string; reelsCount: number }[]>([]);
  const processedMissingIds = useRef<Set<string>>(new Set());

  const handleDeleteForEveryone = async (chatId: string) => {
    try {
      // 1. Get all messages
      const q = query(collection(db, 'chats', chatId, 'messages'));
      const snap = await getDocs(q);
      
      // 2. Use batch for large deletions
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(doc(db, 'chats', chatId));
      
      await batch.commit();
      
      if (activeChatId === chatId) setActiveChatId(null);
      setIsDeletingChat(null);
      setConfirmDeleteType(null);
    } catch (err) {
      console.error("Error deleting for everyone:", err);
      alert('فشل في الحذف للجميع. يرجى التحقق من الأذونات.');
    }
  };

  const handleDeleteForMe = async (chatId: string) => {
    if (!currentUser) return;
    
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        hiddenFor: arrayUnion(currentUser.uid)
      });
      
      if (activeChatId === chatId) setActiveChatId(null);
      setIsDeletingChat(null);
      setConfirmDeleteType(null);
    } catch (err) {
      console.error("Error hiding chat:", err);
      alert('فشل في الحذف من طرفك.');
    }
  };

  const togglePin = async (chatId: string) => {
    if (!currentUser) return;
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    const isPinned = Array.isArray(chat.pinnedBy) && chat.pinnedBy.includes(currentUser.uid);
    try {
      await updateDoc(doc(db, 'chats', chatId), {
        pinnedBy: isPinned ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
      });
    } catch (err) {
      console.error("Error toggling pin:", err);
    }
  };

  useEffect(() => {
    if (!currentUser?.uid) {
      setOtherProfiles({});
      setContacts([]);
      setSearchResults([]);
      setSearchQuery('');
      return;
    }

    const fetchContacts = async () => {
      if (quotaExceeded) return;
      try {
        if (!currentUser?.uid) return;

        const friendsProfiles: UserProfile[] = [];
        const reelsList: typeof friendReels = [];

        // 1. Use denormalized friendDetails first (Instant, zero read cost)
        const detailsMap = currentUser.friendDetails || {};
        const availableUids = Object.keys(detailsMap);
        
        const friendsArray = Array.isArray(currentUser?.friends) ? currentUser.friends : [];
        availableUids.forEach(friendId => {
          if (friendId === currentUser.uid || !friendsArray.includes(friendId)) return;
          const data = { uid: friendId, ...detailsMap[friendId] } as UserProfile;
          friendsProfiles.push(data);
          
          if (data.reelsCount && data.reelsCount > 0) {
            reelsList.push({
              userId: friendId,
              displayName: data.displayName || 'مستخدم',
              photoURL: data.photoURL,
              reelsCount: data.reelsCount
            });
          }
        });

        // 2. Fetch only missing friends (fallback for legacy data)
        const missingIds = friendsArray.filter(id => id && id !== currentUser.uid && !detailsMap[id] && !processedMissingIds.current.has(id));
        
        if (missingIds.length > 0) {
          const batchUpdates: Record<string, any> = {};
          
          // Chunk missing IDs into groups of 30 (Firestore 'in' limit)
          for (let i = 0; i < missingIds.length; i += 30) {
            const chunk = missingIds.slice(i, i + 30);
            try {
              chunk.forEach(id => processedMissingIds.current.add(id));
              const q = query(collection(db, 'users'), where('uid', 'in', chunk));
              const querySnapshot = await getDocs(q);
              
              querySnapshot.forEach(d => {
                const data = d.data() as UserProfile;
                friendsProfiles.push(data);
                
                batchUpdates[`friendDetails.${data.uid}`] = {
                  displayName: data.displayName || 'مستخدم',
                  photoURL: data.photoURL || '',
                  nameColor: data.nameColor || '',
                  isVerified: !!data.isVerified,
                  reelsCount: data.reelsCount || 0
                };

                if (data.reelsCount && data.reelsCount > 0) {
                  reelsList.push({
                    userId: data.uid,
                    displayName: data.displayName || 'مستخدم',
                    photoURL: data.photoURL,
                    reelsCount: data.reelsCount
                  });
                }
              });
            } catch (innerErr: any) {
              console.error(`Error fetching profiles batch:`, innerErr);
              if (innerErr.code === 'resource-exhausted') setQuotaExceeded(true);
            }
          }
          
          if (Object.keys(batchUpdates).length > 0) {
             updateDoc(doc(db, 'users', currentUser.uid), batchUpdates).catch(console.error);
          }
        }

        // If after all that we still have NO friends, fetch some suggestions
        if (friendsProfiles.length === 0) {
          if (suggestionsCache) {
            setContacts(suggestionsCache);
          } else {
            try {
              const suggestedQ = query(collection(db, 'users'), limit(10));
              const suggestedSnap = await getDocs(suggestedQ);
              const suggests = suggestedSnap.docs
                .map(d => d.data() as UserProfile)
                .filter(u => u.uid !== currentUser.uid);
              suggestionsCache = suggests;
              setContacts(suggests);
            } catch (e: any) {
              if (e.code === 'resource-exhausted' || e.message?.includes('quota')) {
                console.error("Quota exceeded while fetching suggestions");
              } else {
                console.error("Error fetching suggestions:", e);
              }
              setContacts([]);
            }
          }
        } else {
          setContacts(friendsProfiles.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '')));
        }
        
        setFriendReels(reelsList);
      } catch (err) {
        console.error("Error fetching contacts:", err);
      }
    };
    fetchContacts();
  }, [currentUser?.uid, JSON.stringify(currentUser?.friends)]);
  
  const filteredChats = useMemo(() => {
    if (!currentUser) return chats;
    let filtered = chats.filter(c => !(Array.isArray(c.hiddenFor) && c.hiddenFor.includes(currentUser.uid)));
    
    if (activeFilter === 'unread') {
      filtered = filtered.filter(c => (c.unreadCount?.[currentUser.uid] || 0) > 0);
    } else if (activeFilter === 'pinned') {
      filtered = filtered.filter(c => Array.isArray(c.pinnedBy) && c.pinnedBy.includes(currentUser.uid));
    } else if (activeFilter === 'mentions') {
      filtered = filtered.filter(c => (c.mentionsCount?.[currentUser.uid] || 0) > 0);
    }
    
    // Always keep pinned chats at top regardless of filter (except when searching)
    return [...filtered].sort((a, b) => {
      const aPinned = Array.isArray(a.pinnedBy) && a.pinnedBy.includes(currentUser.uid);
      const bPinned = Array.isArray(b.pinnedBy) && b.pinnedBy.includes(currentUser.uid);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [chats, currentUser, activeFilter]);

  useEffect(() => {
    if (!currentUser?.uid || chats.length === 0) return;

    // Process profiles for chats currently in store
    const profiles: Record<string, UserProfile> = { ...otherProfiles };
    let updated = false;

    // Filter hidden chats
    const visibleChats = chats.filter(c => !(Array.isArray(c.hiddenFor) && c.hiddenFor.includes(currentUser.uid)));

    visibleChats.forEach(chat => {
      if (chat.participantProfiles) {
        Object.keys(chat.participantProfiles).forEach(uid => {
          if (uid !== currentUser?.uid) {
            const existing = profiles[uid];
            const incoming = chat.participantProfiles![uid];
            
            if (!existing || (incoming.isVerified && !existing.isVerified) || incoming.photoURL !== existing.photoURL || incoming.displayName !== existing.displayName) {
              profiles[uid] = { ...existing, ...incoming } as UserProfile;
              updated = true;
            }
          }
        });
      }
    });

    if (updated) {
      setOtherProfiles(profiles);
    }

    // Fetch batch missing profiles
    const otherIds = Array.from(new Set(visibleChats.flatMap(c => c.participants.filter(p => p !== currentUser.uid && !profiles[p]))));
    if (otherIds.length > 0) {
      const fetchMissing = async () => {
        try {
          for (let i = 0; i < otherIds.length; i += 30) {
            const chunk = otherIds.slice(i, i + 30);
            const q = query(collection(db, 'users'), where('uid', 'in', chunk));
            const querySnapshot = await getDocs(q);
            
            querySnapshot.forEach(d => {
              profiles[d.id] = d.data() as UserProfile;
              updated = true;
            });
          }
          if (updated) setOtherProfiles(profiles);
        } catch (err: any) {
          console.error("Error fetching missing profiles in store sync:", err);
          if (err.code === 'resource-exhausted') setQuotaExceeded(true);
        }
      };
      fetchMissing();
    }
  }, [chats, currentUser?.uid]);

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!val.trim()) {
      setSearchResults([]);
      setIsSearchingRemote(false);
      return;
    }

    // Debounce remote search to save quota
    searchTimeoutRef.current = setTimeout(async () => {
      // Normalization helper for Arabic
      const normalizeArabic = (s: string) => 
        s.replace(/[أإآ]/g, 'ا')
         .replace(/ة/g, 'ه')
         .replace(/ى/g, 'ي')
         .replace(/[\u064B-\u0652]/g, '') // Remove Harakat
         .trim();

      const normalizedVal = normalizeArabic(val);
      
      // Local search first in loaded contacts
      const localResults = contacts.filter(c => {
        const dbName = normalizeArabic(c.displayName || '');
        const searchName = normalizedVal;
        return dbName.includes(searchName) || (c.phoneNumber && normalizeArabic(c.phoneNumber).includes(searchName));
      });
      
      if (val.length >= 3) {
        setIsSearchingRemote(true);
        const remoteQueries = [];
        const normalized = normalizeArabic(val);
        
        // Build variations for Arabic searches
        const Variations = [val];
        if (normalized !== val) Variations.push(normalized);
        
        const capitalized = val.charAt(0).toUpperCase() + val.slice(1);
        if (capitalized !== val) Variations.push(capitalized);

        const uniqueSearches = Array.from(new Set(Variations));
        uniqueSearches.forEach(name => {
          remoteQueries.push(getDocs(query(
            collection(db, 'users'),
            where('displayName', '>=', name),
            where('displayName', '<=', name + '\uf8ff'),
            limit(10)
          )));
          remoteQueries.push(getDocs(query(
            collection(db, 'users'),
            where('username', '>=', name.toLowerCase()),
            where('username', '<=', name.toLowerCase() + '\uf8ff'),
            limit(10)
          )));
        });

        // Phone search as typed
        remoteQueries.push(getDocs(query(
          collection(db, 'users'),
          where('phoneNumber', '>=', normalizedVal),
          where('phoneNumber', '<=', normalizedVal + '\uf8ff'),
          limit(10)
        )));

        try {
          const results = await Promise.allSettled(remoteQueries);
          const remoteResults: UserProfile[] = [];
          
          results.forEach(result => {
            if (result.status === 'fulfilled') {
              result.value.docs.forEach((doc: any) => {
                const data = doc.data() as UserProfile;
                if (data.uid !== currentUser?.uid && !remoteResults.find(r => r.uid === data.uid)) {
                  remoteResults.push(data);
                }
              });
            }
          });
          
          // Merge and deduplicate with local
          const merged = [...localResults];
          remoteResults.forEach(r => {
            if (!merged.find(m => m.uid === r.uid)) merged.push(r);
          });
          setSearchResults(merged);
        } catch (err: any) {
          console.error("Search error:", err);
          if (err.code === 'resource-exhausted') setQuotaExceeded(true);
          setSearchResults(localResults);
        } finally {
          setIsSearchingRemote(false);
        }
      } else {
        setSearchResults(localResults);
      }
    }, 500);
  };

  const toggleFriend = async (targetUid: string) => {
    if (!currentUser?.uid || !targetUid) return;
    setIsUpdatingFriend(targetUid);
    
    try {
      const friendsArray = Array.isArray(currentUser.friends) ? currentUser.friends : [];
      const isFriend = friendsArray.includes(targetUid);
      
      const userRef = doc(db, 'users', currentUser.uid);
      
      if (isFriend) {
        await updateDoc(userRef, {
          friends: arrayRemove(targetUid),
          [`friendDetails.${targetUid}`]: deleteField()
        });
      } else {
        // Fetch friend data once to denormalize
        const friendDoc = await getDoc(doc(db, 'users', targetUid));
        if (friendDoc.exists()) {
          const data = friendDoc.data() as UserProfile;
          await updateDoc(userRef, {
            friends: arrayUnion(targetUid),
            [`friendDetails.${targetUid}`]: {
              displayName: data.displayName || 'مستخدم',
              photoURL: data.photoURL || '',
              nameColor: data.nameColor || '',
              isVerified: data.isVerified || false,
              reelsCount: data.reelsCount || 0
            }
          });
        }
      }
    } catch (err) {
      console.error("Error toggling friend:", err);
    } finally {
      setIsUpdatingFriend(null);
    }
  };

  const startChat = async (targetUser: UserProfile) => {
    if (!currentUser || !targetUser?.uid) return;
    
    // Auto-add friend with details denormalization for persistence
    const friendsArray = Array.isArray(currentUser.friends) ? currentUser.friends : [];
    if (!friendsArray.includes(targetUser.uid)) {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        friends: arrayUnion(targetUser.uid),
        [`friendDetails.${targetUser.uid}`]: {
          uid: targetUser.uid,
          displayName: targetUser.displayName || 'مستخدم تلي عراق',
          photoURL: targetUser.photoURL || null,
          nameColor: targetUser.nameColor || 'white',
          isVerified: !!targetUser.isVerified
        }
      });
    }

    const existingChat = (chats || []).find(c => Array.isArray(c.participants) && c.participants.includes(targetUser.uid));
    if (existingChat) {
      setActiveChatId(existingChat.id);
      setIsSearching(false);
      setSearchQuery('');
      return;
    }

    const newChat = {
      participants: [currentUser.uid, targetUser.uid],
      participantProfiles: getParticipantProfiles([currentUser, targetUser]),
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
        title: 'تلي عراق',
        text: 'انضم إلينا في تطبيق تلي عراق - تواصل بحرية وأمان!',
        url: window.location.href,
      }).catch(console.error);
    } else {
      // Fallback for browsers that do not support navigator.share
      navigator.clipboard.writeText(`انضم إلينا في تطبيق تلي عراق: ${window.location.href}`);
      alert('تم نسخ رابط الدعوة إلى الحافظة!');
    }
  };

  const createGroup = async () => {
    if (!currentUser || !groupName.trim() || selectedContacts.length === 0) return;

    const groupParticipants = [currentUser, ...contacts.filter(c => Array.isArray(selectedContacts) && selectedContacts.includes(c.uid))];
    const newChat = {
      participants: groupParticipants.map(u => u.uid),
      participantProfiles: getParticipantProfiles(groupParticipants),
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
    setIsSearching(false); // Close search if open
    
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

  return (
    <div className="flex flex-col h-full bg-card shadow-inner" dir={language === 'English' ? 'ltr' : 'rtl'}>
      {/* Header */}
      <div className="glass-header p-4 flex items-center justify-between safe-top">
        <motion.div 
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-3 cursor-pointer" 
          onClick={() => setShowProfile(true)}
        >
          <Avatar className="h-10 w-10 border-2 border-primary/20 shadow-sm">
            <AvatarImage src={currentUser?.photoURL || undefined} />
            <AvatarFallback className="text-white font-bold" style={{ backgroundColor: currentUser?.nameColor || '#8b5cf6' }}>
              {(currentUser?.displayName?.slice(0, 2) || '').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className={`font-bold text-sm leading-tight flex items-center gap-1 ${getNameColorClass(currentUser?.nameColor)}`} style={{ color: isMagicColor(currentUser?.nameColor) ? undefined : (currentUser?.nameColor || 'inherit') }}>
              {currentUser?.displayName || t.appName}
              {currentUser?.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            </span>
            <span className="text-[10px] text-muted-foreground">{currentUser?.status || t.byAuthor}</span>
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

      {/* Search and Helper */}
      <div className="px-4 py-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            placeholder={t.searchPlaceholder}
            className="bg-muted/50 border-none rounded-xl h-10 pr-10 focus-visible:ring-primary/30"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground" />
          </div>
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute inset-y-0 left-0 h-10 w-10 rounded-xl hover:bg-transparent"
              onClick={() => handleSearch('')}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
        <Button 
          variant="secondary" 
          size="icon" 
          className="rounded-xl h-10 w-10 shrink-0 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
          onClick={startSystemChat}
          disabled={systemLoading}
          title="الدعم الفني"
        >
          {systemLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-5 h-5 shadow-sm" />}
        </Button>
      </div>

      {/* Filter Bar */}
      {!searchQuery && (
        <div className="px-4 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <Button 
            variant={activeFilter === 'all' ? 'default' : 'ghost'} 
            size="sm" 
            className={`rounded-full px-4 h-8 text-[11px] font-bold transition-all ${activeFilter === 'all' ? 'purple-gradient border-none' : 'text-muted-foreground'}`}
            onClick={() => setActiveFilter('all')}
          >
            الكل
          </Button>
          <Button 
            variant={activeFilter === 'unread' ? 'default' : 'ghost'} 
            size="sm" 
            className={`rounded-full px-4 h-8 text-[11px] font-bold transition-all gap-1.5 ${activeFilter === 'unread' ? 'purple-gradient border-none' : 'text-muted-foreground' }`}
            onClick={() => setActiveFilter('unread')}
          >
            {activeFilter === 'unread' ? null : <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
            غير مقروءة
          </Button>
          <Button 
            variant={activeFilter === 'pinned' ? 'default' : 'ghost'} 
            size="sm" 
            className={`rounded-full px-4 h-8 text-[11px] font-bold transition-all gap-1.5 ${activeFilter === 'pinned' ? 'purple-gradient border-none' : 'text-muted-foreground' }`}
            onClick={() => setActiveFilter('pinned')}
          >
            <Pin className="w-3 h-3" />
            المثبتة
          </Button>
          <Button 
            variant={activeFilter === 'mentions' ? 'default' : 'ghost'} 
            size="sm" 
            className={`rounded-full px-4 h-8 text-[11px] font-bold transition-all gap-1.5 ${activeFilter === 'mentions' ? 'purple-gradient border-none' : 'text-muted-foreground' }`}
            onClick={() => setActiveFilter('mentions')}
          >
            <AtSign className="w-3 h-3" />
            منشن
          </Button>
        </div>
      )}

      {/* WhatsApp Style Reels */}
      {currentTab === 'chats' && !searchQuery && friendReels.length > 0 && (
        <div className="bg-card border-b py-4">
          <ScrollArea className="w-full">
            <div className="flex px-4 gap-4">
              {/* Friends Status */}
              {friendReels.map((friend) => (
                <div 
                  key={friend.userId} 
                  className="flex flex-col items-center gap-1 cursor-pointer group"
                  onClick={() => setViewingProfileId(friend.userId)}
                >
                  <div className="p-[2px] rounded-full border-2 border-primary">
                    <Avatar className="h-14 w-14 border-2 border-card">
                      <AvatarImage src={friend.photoURL || undefined} className="rounded-full" />
                      <AvatarFallback className="font-bold">{friend.displayName?.slice(0, 2) || 'CH'}</AvatarFallback>
                    </Avatar>
                  </div>
                  <span className="text-[10px] font-bold truncate max-w-[66px]">{friend.displayName}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* List */}
      <div className="flex-1 min-h-0 relative">
        <Virtuoso
          style={{ height: '100%' }}
          data={isSearching || searchQuery.length >= 3 ? searchResults : filteredChats}
          components={{
            EmptyPlaceholder: () => (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center mt-20">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Search className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground font-medium">
                  {isSearching || searchQuery.length >= 3 ? t.noUsersFound : t.noChatsFound || 'لا توجد محادثات بعد'}
                </p>
              </div>
            )
          }}
          itemContent={(index, item) => {
            if (isSearching || searchQuery.length >= 3) {
              const user = item as UserProfile;
              return (
                <div className="p-2">
                  {index === 0 && <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t.searchResults}</p>}
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
                      <AvatarImage src={user.photoURL || undefined} />
                      <AvatarFallback 
                        className={`text-white font-bold bg-muted-foreground/20 text-muted-foreground`} 
                      >
                        {(user.displayName?.slice(0, 2) || '').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div 
                      className="flex-1 min-w-0"
                      onClick={() => startChat(user)}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <p 
                          className={`font-bold text-sm truncate ${getNameColorClass(user.nameColor)}`} 
                          style={{ color: isMagicColor(user.nameColor) ? undefined : (user.nameColor || '#141414') }}
                        >
                          {user.displayName}
                        </p>
                        {user.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {(user as any).username ? `@${(user as any).username}` : (user.phoneNumber || user.status || (language === 'English' ? 'Available' : 'متوفر'))}
                      </p>
                    </div>

                    <Button 
                      variant={(Array.isArray(currentUser?.friends) ? currentUser.friends : []).includes(user.uid) ? "ghost" : "outline"}
                      size="sm"
                      className={`rounded-xl h-8 px-3 shrink-0 gap-1 font-bold text-[10px] transition-all ios-touch ${
                        (Array.isArray(currentUser?.friends) ? currentUser.friends : []).includes(user.uid) 
                          ? 'text-green-500 bg-green-500/10 hover:bg-green-500/20' 
                          : 'text-primary border-primary/20 hover:bg-primary/5'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFriend(user.uid);
                      }}
                      disabled={isUpdatingFriend === user.uid}
                    >
                      {isUpdatingFriend === user.uid ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (Array.isArray(currentUser?.friends) ? currentUser.friends : []).includes(user.uid) ? (
                        <><Check className="w-3 h-3" /> {language === 'English' ? 'Friend' : 'صديق'}</>
                      ) : (
                        <><UserPlus className="w-3 h-3" /> {language === 'English' ? 'Add' : 'إضافة'}</>
                      )}
                    </Button>
                  </div>
                </div>
              );
            } else {
              const chat = item as Chat;
              if (!chat) return null;
              const isGroup = chat.isGroup;
              const otherParticipantId = !isGroup ? chat.participants.find(p => p !== currentUser?.uid) : null;
              const otherProfile = otherParticipantId ? otherProfiles[otherParticipantId] : null;
              
              const displayName = isGroup ? chat.groupName : (otherProfile?.displayName || 'مستخدم تلي عراق');
              const photoURL = isGroup ? chat.groupPhoto : otherProfile?.photoURL;
              const nameColor = isGroup ? '#8b5cf6' : (otherProfile?.nameColor || '#8b5cf6');

              return (
                <div key={chat.id} className="p-1 px-2 relative overflow-hidden rounded-xl">
                  {/* Delete Action Background - Removed Red */}
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-end px-6">
                    <Trash2 className="h-5 w-5 text-primary" />
                  </div>

                  <motion.div
                    drag="x"
                    dragConstraints={{ left: -100, right: 0 }}
                    dragElastic={0.1}
                    onDragEnd={(e, info) => {
                      if (info.offset.x < -80) {
                        setIsDeletingChat(chat.id);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setIsDeletingChat(chat.id);
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveChatId(chat.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setActiveChatId(chat.id)}
                    whileTap={{ scale: 0.98 }}
                    className={`relative w-full flex items-center gap-3 p-3 transition-all text-right group cursor-pointer bg-card ios-touch rounded-xl ${
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
                      <AvatarImage src={photoURL || undefined} />
                      <AvatarFallback 
                        className={`text-white font-bold bg-muted-foreground/20 text-muted-foreground`} 
                      >
                        {(displayName?.slice(0, 2) || 'CH').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline">
                          <div className="flex items-center gap-1 truncate max-w-[75%]">
                            <p 
                              className={`font-bold text-sm truncate ${
                                activeChatId === chat.id ? '' : getNameColorClass(nameColor)
                              }`} 
                              style={{ color: activeChatId === chat.id ? 'white' : (isMagicColor(nameColor) ? undefined : (nameColor || '#141414')) }}
                            >
                              {displayName}
                            </p>
                            {otherProfile?.isVerified && (
                              <BadgeCheck className={`w-3.5 h-3.5 shrink-0 ${activeChatId === chat.id ? 'text-white' : 'text-blue-500'} fill-current opacity-90`} />
                            )}
                            {Array.isArray(chat.pinnedBy) && chat.pinnedBy.includes(currentUser?.uid || '') && (
                              <Pin className={`w-3 h-3 shrink-0 ${activeChatId === chat.id ? 'text-white' : 'text-primary'} rotate-45`} />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] ${activeChatId === chat.id ? 'text-white/70' : 'text-muted-foreground'}`}>
                              {chat.updatedAt?.toDate ? format(chat.updatedAt.toDate(), 'hh:mm a', { locale: ar }) : ''}
                            </span>
                            {chat.mentionsCount?.[currentUser?.uid || ''] ? (
                              <div className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce">
                                @
                              </div>
                            ) : null}
                            {chat.unreadCount?.[currentUser?.uid || ''] ? (
                              <div className={`min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center animate-in zoom-in duration-300 ${activeChatId === chat.id ? 'bg-white/20' : 'bg-primary'}`}>
                                {chat.unreadCount[currentUser?.uid || ''] > 99 ? '99+' : chat.unreadCount[currentUser?.uid || '']}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {Object.keys(chat.typing || {}).some(uid => uid !== currentUser?.uid && chat.typing?.[uid]) ? (
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-bold text-primary animate-pulse italic">جاري الكتابة...</p>
                            <motion.div 
                              className="flex gap-0.5"
                              animate={{ opacity: [0.4, 1, 0.4] }}
                              transition={{ duration: 1.5, repeat: Infinity }}
                            >
                              <span className="w-1 h-1 rounded-full bg-primary" />
                              <span className="w-1 h-1 rounded-full bg-primary" />
                              <span className="w-1 h-1 rounded-full bg-primary" />
                            </motion.div>
                          </div>
                        ) : (
                          <p className={`text-xs truncate ${activeChatId === chat.id ? 'text-white/80' : 'text-muted-foreground'}`}>
                            {chat.lastMessage?.senderId === currentUser?.uid ? t.you : ''}
                            {chat.lastMessage?.text || (chat.lastMessage?.senderId ? 'أرسل ملفاً' : t.startChat)}
                          </p>
                        )}
                      </div>
                  </motion.div>
                </div>
              );
            }
          }}
        />
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
              <label className="text-sm font-medium">اختر الأعضاء (الأصدقاء فقط)</label>
              <div className="h-[200px] border rounded-md p-2 overflow-y-auto overscroll-contain">
                {contacts.filter(c => (Array.isArray(currentUser?.friends) ? currentUser.friends : []).includes(c.uid)).map(contact => (
                  <div key={contact.uid} className="flex items-center gap-3 p-2 hover:bg-accent rounded-md cursor-pointer" onClick={() => {
                    setSelectedContacts(prev => 
                      prev.includes(contact.uid) 
                        ? prev.filter(id => id !== contact.uid) 
                        : [...prev, contact.uid]
                    );
                  }}>
                    <Checkbox checked={selectedContacts.includes(contact.uid)} />
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={contact.photoURL || undefined} />
                      <AvatarFallback style={{ backgroundColor: contact.nameColor }}>{contact.displayName?.slice(0,2)}</AvatarFallback>
                    </Avatar>
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-sm truncate">{contact.displayName}</span>
                      {contact.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                    </div>
                  </div>
                ))}
                {contacts.filter(c => (Array.isArray(currentUser?.friends) ? currentUser.friends : []).includes(c.uid)).length === 0 && (
                  <p className="text-xs text-center text-muted-foreground p-4">لا يوجد أصدقاء لإضافتهم للمجموعة</p>
                )}
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

      {/* Deletion Dialog */}
      <Dialog open={!!isDeletingChat && !confirmDeleteType} onOpenChange={(open) => !open && setIsDeletingChat(null)}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl p-6" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right text-xl font-black">إدارة المحادثة</DialogTitle>
          </DialogHeader>
          <div className="py-6 space-y-4">
            <Button 
              variant="outline" 
              className="w-full h-16 rounded-2xl justify-start gap-4 border-primary/20 hover:bg-primary/5 group transition-all"
              onClick={() => {
                if (isDeletingChat) {
                  togglePin(isDeletingChat);
                  setIsDeletingChat(null);
                }
              }}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Pin className="w-5 h-5" />
              </div>
              <div className="text-right flex-1">
                <p className="font-bold text-base text-primary">
                  {chats.find(c => c.id === isDeletingChat)?.pinnedBy?.includes(currentUser?.uid || '') ? 'إزالة التثبيت' : 'تثبيت المحادثة'}
                </p>
                <p className="text-[10px] text-muted-foreground">ستبقى المحادثة دائماً في الأعلى</p>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="w-full h-16 rounded-2xl justify-start gap-4 border-primary/20 hover:bg-primary/5 group transition-all"
              onClick={() => {
                setConfirmDeleteType('me');
              }}
            >
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="text-right flex-1">
                <p className="font-bold text-base text-primary">حذف من طرفي فقط</p>
                <p className="text-[10px] text-muted-foreground">سيتم إخفاء المحادثة عندك فقط</p>
              </div>
            </Button>

            <Button 
              variant="outline" 
              className="w-full h-16 rounded-2xl justify-start gap-4 border-destructive/20 hover:bg-destructive/5 group transition-all"
              onClick={() => {
                setConfirmDeleteType('everyone');
              }}
            >
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive group-hover:scale-110 transition-transform">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="text-right flex-1">
                <p className="font-bold text-base text-destructive">حذف نهائياً للجميع</p>
                <p className="text-[10px] text-muted-foreground">سيتم الحذف من الطرفين تماماً</p>
              </div>
            </Button>
            
            <Button 
              variant="ghost" 
              className="w-full h-12 rounded-2xl text-muted-foreground font-bold hover:bg-muted"
              onClick={() => setIsDeletingChat(null)}
            >
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Final Confirmation Dialog */}
      <Dialog open={!!confirmDeleteType} onOpenChange={(open) => !open && setConfirmDeleteType(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl p-6 shadow-2xl border-none" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right text-lg font-black flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              تأكيد الحذف
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4 text-right">
            <p className="text-sm font-medium leading-relaxed text-muted-foreground">
              {confirmDeleteType === 'everyone' 
                ? 'هل أنت متأكد من حذف هذه المحادثة نهائياً للجميع؟ لا يمكن التراجع عن هذا الإجراء وسيتم حذف جميع الرسائل من الطرفين تماماً.'
                : 'هل تريد حذف هذه المحادثة من قائمتك الخاصة؟ ستبقى الرسائل متاحة للطرف الآخر.'}
            </p>
          </div>

          <div className="flex gap-3 mt-4">
            <Button 
              className={`flex-1 h-12 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-95 ${confirmDeleteType === 'everyone' ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'}`}
              onClick={() => {
                if (isDeletingChat) {
                  if (confirmDeleteType === 'everyone') handleDeleteForEveryone(isDeletingChat);
                  else handleDeleteForMe(isDeletingChat);
                }
              }}
            >
              تأكيد الحذف
            </Button>
            <Button 
              variant="ghost" 
              className="flex-1 h-12 rounded-2xl font-bold hover:bg-muted transition-colors"
              onClick={() => setConfirmDeleteType(null)}
            >
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
