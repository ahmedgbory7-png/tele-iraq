import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, addDoc, serverTimestamp, or, doc, getDoc, setDoc, deleteDoc, arrayUnion, arrayRemove, deleteField, updateDoc, writeBatch } from 'firebase/firestore';
import { Chat, UserProfile } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, Settings, Edit, UserPlus, LogOut, Bot, Loader2, Users, Trash2, Check, X, Plus, AlertCircle, BadgeCheck } from 'lucide-react';
import { auth } from '@/firebase';
import { format } from 'date-fns';
import { Language, translations } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { motion, AnimatePresence } from 'motion/react';
import { Virtuoso, GroupedVirtuoso } from 'react-virtuoso';

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
  const [isUpdatingFriend, setIsUpdatingFriend] = useState<string | null>(null);

  const [isDeletingChat, setIsDeletingChat] = useState<string | null>(null);
  const [confirmDeleteType, setConfirmDeleteType] = useState<'me' | 'everyone' | null>(null);
  const [friendReels, setFriendReels] = useState<{ userId: string; displayName: string; photoURL?: string; reelsCount: number }[]>([]);

  // Memoized contacts sorting and grouping
  const contactsData = useMemo(() => {
    const list = [...(searchQuery.length > 0 ? searchResults : contacts)];
    
    // Improved sorting for Arabic
    list.sort((a, b) => {
      const nameA = (a.displayName || '').replace(/^الـ|^ال/g, ''); // Skip Al- prefix for sorting
      const nameB = (b.displayName || '').replace(/^الـ|^ال/g, '');
      return nameA.localeCompare(nameB, 'ar');
    });

    const counts: number[] = [];
    const groupLetters: string[] = [];
    let currentCount = 0;
    let currentLetter = '';

    list.forEach((user, idx) => {
      let name = user.displayName || '#';
      // Normalize Alif variations for grouping
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
  }, [searchQuery, searchResults, contacts]);

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

  useEffect(() => {
    if (!currentUser?.uid) {
      setChats([]);
      setOtherProfiles({});
      setContacts([]);
      setSearchResults([]);
      setSearchQuery('');
      return;
    }

    const fetchContacts = async () => {
      try {
        if (!currentUser?.uid) return;

        // If no friends, fetch a few "Suggested" users to avoid empty screen
        if (!currentUser.friends || currentUser.friends.length === 0) {
          try {
            const suggestedQ = query(collection(db, 'users'), limit(5));
            const suggestedSnap = await getDocs(suggestedQ);
            const suggests = suggestedSnap.docs
              .map(d => d.data() as UserProfile)
              .filter(u => u.uid !== currentUser.uid);
            setContacts(suggests);
          } catch (e) {
            console.error("Error fetching suggestions:", e);
            setContacts([]);
          }
          setFriendReels([]);
          return;
        }
        
        const friendsProfiles: UserProfile[] = [];
        const reelsList: typeof friendReels = [];

        // 1. Use denormalized friendDetails first (Instant, zero read cost)
        const detailsMap = currentUser.friendDetails || {};
        const availableUids = Object.keys(detailsMap);
        
        availableUids.forEach(friendId => {
          if (friendId === currentUser.uid) return;
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
        const missingIds = currentUser.friends.filter(id => id !== currentUser.uid && !detailsMap[id]);
        
        if (missingIds.length > 0) {
          const batchUpdates: Record<string, any> = {};
          for (const friendId of missingIds) {
            const friendDoc = await getDoc(doc(db, 'users', friendId));
            if (friendDoc.exists()) {
              const data = friendDoc.data() as UserProfile;
              friendsProfiles.push(data);
              
              // Prepare for auto-denormalization
              batchUpdates[`friendDetails.${friendId}`] = {
                displayName: data.displayName || 'مستخدم',
                photoURL: data.photoURL || '',
                nameColor: data.nameColor || '',
                isVerified: data.isVerified || false,
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
            }
          }
          // Back-fill the denormalized data to user doc to save future reads
          if (Object.keys(batchUpdates).length > 0) {
             updateDoc(doc(db, 'users', currentUser.uid), batchUpdates).catch(console.error);
          }
        }

        setContacts(friendsProfiles.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '')));
        setFriendReels(reelsList);
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
        const chatData = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Chat))
          .filter(c => !(Array.isArray(c.hiddenFor) && c.hiddenFor.includes(currentUser.uid)));
        // Sort manually to avoid composite index requirement
        chatData.sort((a, b) => {
          const timeA = a.updatedAt?.toMillis?.() || 0;
          const timeB = b.updatedAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
        setChats(chatData);

        // Optimization: Use denormalized participantProfiles if available
        const profiles: Record<string, UserProfile> = { ...otherProfiles };
        let updated = false;

        chatData.forEach(chat => {
          if (chat.participantProfiles) {
            Object.keys(chat.participantProfiles).forEach(uid => {
              if (uid !== currentUser?.uid) {
                // Always update if the cached profile is missing or if the denormalized one is verified
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

        // Fallback: Fetch missing profiles (only for old chats without participantProfiles)
        const otherIds = Array.from(new Set(chatData.flatMap(c => c.participants.filter(p => p !== currentUser.uid && !profiles[p]))));
        if (otherIds.length > 0) {
          for (const id of otherIds) {
            const docSnap = await getDoc(doc(db, 'users', id));
            if (docSnap.exists()) {
              profiles[id] = docSnap.data() as UserProfile;
              updated = true;
            }
          }
          if (updated) setOtherProfiles(profiles);
        }
      } catch (err) {
        console.error("Error in chat snapshot:", err);
      }
    }, (err) => {
      console.error("Snapshot listener error:", err);
    });

    return () => unsubscribe();
  }, [currentUser?.uid, currentUser?.friends]);

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    
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
    
    if (val.length >= 2) {
      const remoteQueries = [];
      const normalized = normalizeArabic(val);
      
      // Build aggressive variations for Arabic searches to match different Alif/Yeh/Te styles
      const Variations = [val];
      if (normalized !== val) Variations.push(normalized);
      
      // If the normalized value contains 'ا' (Alif), try variations with hamzas
      if (normalized.includes('ا')) {
        Variations.push(normalized.replace(/ا/g, 'أ'));
        Variations.push(normalized.replace(/ا/g, 'إ'));
        Variations.push(normalized.replace(/ا/g, 'آ'));
      }
      // If it contains 'ي' (Yeh), try with 'ى'
      if (normalized.includes('ي')) Variations.push(normalized.replace(/ي/g, 'ى'));
      // If it contains 'ه' (Heh), try with 'ة'
      if (normalized.includes('ه')) Variations.push(normalized.replace(/ه/g, 'ة'));
      
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
      });

      // 2. Standard phone search as typed
      remoteQueries.push(getDocs(query(
        collection(db, 'users'),
        where('phoneNumber', '>=', normalizedVal),
        where('phoneNumber', '<=', normalizedVal + '\uf8ff'),
        limit(10)
      )));

      // 3. Iraqi and General Phone variations (be aggressive to find users)
      if (normalizedVal.match(/^\d/) || (normalizedVal.startsWith('+') && normalizedVal.length > 2)) {
        // Extract significant digits for Iraqi numbers or any number
        const digitsOnly = normalizedVal.replace(/\D/g, '');
        let baseNumber = digitsOnly;
        
        // If it starts with Iraqi country code, strip it for variations
        if (baseNumber.startsWith('964')) {
          baseNumber = baseNumber.substring(3);
        }
        // Always strip leading zero for international variations
        if (baseNumber.startsWith('0')) {
          baseNumber = baseNumber.substring(1);
        }
        
        if (baseNumber.length >= 7) { // Only try variations for meaningful partials
          const variations = [
            '+964' + baseNumber,
            '964' + baseNumber,
            '0' + baseNumber,
            '+' + baseNumber,
            baseNumber
          ];
          
          // Deduplicate and run
          const uniqueVariations = Array.from(new Set(variations)).filter(v => !!v);
          uniqueVariations.forEach(fmt => {
            remoteQueries.push(getDocs(query(
              collection(db, 'users'),
              where('phoneNumber', '>=', fmt),
              where('phoneNumber', '<=', fmt + '\uf8ff'),
              limit(5)
            )));
          });
        }
      }

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
          } else {
            console.warn("Search sub-query failed:", result.reason);
          }
        });
        
        // Merge and deduplicate with local
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

  const toggleFriend = async (targetUid: string) => {
    if (!currentUser || !targetUid) return;
    setIsUpdatingFriend(targetUid);
    const friendsArray = Array.isArray(currentUser.friends) ? currentUser.friends : [];
    const isFriend = friendsArray.includes(targetUid);
    try {
      if (isFriend) {
        await updateDoc(doc(db, 'users', currentUser.uid), {
          friends: arrayRemove(targetUid),
          [`friendDetails.${targetUid}`]: deleteField()
        });
      } else {
        // Fetch friend data once to denormalize
        const friendDoc = await getDoc(doc(db, 'users', targetUid));
        if (friendDoc.exists()) {
          const data = friendDoc.data() as UserProfile;
          await updateDoc(doc(db, 'users', currentUser.uid), {
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
          displayName: targetUser.displayName || 'مستخدم تليعراق',
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
    
    try {
      const systemUser: UserProfile = {
        uid: 'teleiraq-system',
        phoneNumber: '+964000000000',
        displayName: 'تليعراق (الدعم الفني)',
        status: 'دائماً في خدمتك 🇮🇶 تم تطويري بالذكاء الاصطناعي',
        nameColor: 'magic_rb',
        isVerified: true,
        photoURL: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png'
      };
      
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
          participantProfiles: getParticipantProfiles([currentUser, systemUser]),
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
    return (
      <div className="flex flex-col h-full bg-card" dir="rtl">
        <div className="p-4 border-b flex items-center justify-between bg-background sticky top-0 z-10">
          <h2 className="text-xl font-bold">
            {searchQuery.length > 0 ? 'نتائج البحث' : (currentUser?.friends?.length ? 'جهات الاتصال' : 'اكتشف أشخاصاً')}
          </h2>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => setIsSearching(!isSearching)}>
            <Search className="h-5 w-5" />
          </Button>
        </div>
        
        {isSearching && (
          <div className="px-4 py-2 border-b animate-in slide-in-from-top duration-200">
            <div className="relative">
              <Input
                autoFocus
                placeholder="البحث في جهات الاتصال..."
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
          </div>
        )}

      <div className="flex-1 min-h-0 relative">
        {contactsData.list.length > 0 ? (
          <GroupedVirtuoso
            style={{ height: '100%' }}
            data={contactsData.list}
            groupCounts={contactsData.counts}
            groupContent={(index) => (
              <div className="bg-muted/50 px-4 py-2 text-[10px] font-bold text-primary uppercase tracking-widest border-b backdrop-blur-sm sticky top-0">
                {contactsData.groupLetters[index]}
              </div>
            )}
            itemContent={(index, _, user) => (
              <div className="p-2 pt-0 space-y-1">
                {/* Action Items for the very first item if not searching */}
                {index === 0 && !searchQuery && (
                   <div className="space-y-1 mb-2 px-1">
                    <Button variant="ghost" className="w-full justify-start gap-4 h-14 rounded-2xl px-4 hover:bg-orange-500/5 group transition-all" onClick={startSystemChat}>
                      <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div className="flex-1 text-right">
                        <p className="font-black text-sm">الدعم الفني والخدمات</p>
                        <p className="text-[10px] text-muted-foreground">تحدث مع موظف الخدمة فوراً</p>
                      </div>
                    </Button>
                  </div>
                )}
                <div
                  key={user.uid}
                  className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-accent transition-all text-right cursor-pointer active:scale-[0.98]"
                  onClick={() => startChat(user)}
                >
                  <Avatar 
                    className="h-12 w-12 border-2 border-primary/10 shadow-sm hover:ring-2 ring-primary/30 transition-all cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewingProfileId(user.uid);
                    }}
                  >
                    <AvatarImage src={user.photoURL || undefined} />
                    <AvatarFallback style={{ backgroundColor: user.nameColor || '#8b5cf6' }} className="text-white font-bold text-sm">
                      {user.displayName?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className={`font-bold text-sm truncate ${
                        user.nameColor === 'magic' ? 'magic-color-text' : 
                        user.nameColor === 'magic_neon' ? 'magic-neon-orange-text' :
                        user.nameColor === 'animated-green' ? 'animated-green-text' :
                        user.nameColor === 'animated-red' ? 'animated-red-text' : ''
                      }`} style={{ color: ['magic', 'magic_neon', 'animated-green', 'animated-red'].includes(user.nameColor || '') ? undefined : (user.nameColor || 'inherit') }}>
                        {user.displayName}
                      </p>
                      {user.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 fill-blue-500/10 shrink-0" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{user.status || 'متوفر'}</p>
                  </div>
                  
                  <Button 
                    variant={currentUser?.friends?.includes(user.uid) ? "ghost" : "outline"}
                    size="sm"
                    className={`rounded-xl h-8 px-3 shrink-0 gap-1 font-bold text-[10px] transition-all ios-touch ${
                      currentUser?.friends?.includes(user.uid) 
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
                    ) : currentUser?.friends?.includes(user.uid) ? (
                      <><Check className="w-3 h-3" /> صديق</>
                    ) : (
                      <><UserPlus className="w-3 h-3" /> إضافة</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          />
        ) : (
          <div className="py-20 text-center space-y-6 px-10">
            <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mx-auto animate-pulse">
              <UserPlus className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <div className="space-y-2">
              <p className="font-bold text-lg">لا يوجد جهات اتصال بعد</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                ابدأ بالبحث عن أصدقائك عبر الاسم أو رقم الهاتف لإضافتهم إلى قائمتك.
              </p>
            </div>
            <Button 
              onClick={() => setIsSearching(true)}
              className="rounded-2xl h-12 px-8 purple-gradient font-bold shadow-lg shadow-purple-500/20"
            >
              <Search className="w-4 h-4 ml-2" />
              البحث عن أصدقاء
            </Button>
          </div>
        )}
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
            <AvatarImage src={currentUser?.photoURL || undefined} />
            <AvatarFallback className="text-white font-bold" style={{ backgroundColor: currentUser?.nameColor || '#8b5cf6' }}>
              {currentUser?.displayName?.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className={`font-bold text-sm leading-tight flex items-center gap-1 ${
              currentUser?.nameColor === 'magic' ? 'magic-color-text' : 
              currentUser?.nameColor === 'magic_neon' ? 'magic-neon-orange-text' : 
              currentUser?.nameColor === 'magic_rb' ? 'magic-red-blue-text' : 
              currentUser?.nameColor === 'magic_pb' ? 'magic-pink-black-text' : 
              currentUser?.nameColor === 'magic_iraq' ? 'magic-iraq-text' : 
              currentUser?.nameColor === 'animated-green' ? 'animated-green-text' : 
              currentUser?.nameColor === 'animated-red' ? 'animated-red-text' : ''
            }`} style={{ color: ['magic', 'magic_neon', 'magic_rb', 'magic_pb', 'magic_iraq', 'animated-green', 'animated-red'].includes(currentUser?.nameColor || '') ? undefined : (currentUser?.nameColor || 'inherit') }}>
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

      {/* Search */}
      {isSearching && (
        <div className="px-4 py-2 border-b animate-in slide-in-from-top duration-200">
          <div className="relative">
            <Input
              autoFocus
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
                      <AvatarFallback className="font-bold">{friend.displayName.slice(0, 2)}</AvatarFallback>
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
          data={isSearching || searchQuery.length >= 3 ? searchResults : chats}
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
                        {user.displayName?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div 
                      className="flex-1 min-w-0"
                      onClick={() => startChat(user)}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <p 
                          className={`font-bold text-sm truncate ${
                            user.nameColor === 'magic' ? 'magic-color-text' : 
                            user.nameColor === 'magic_neon' ? 'magic-neon-orange-text' :
                            user.nameColor === 'magic_rb' ? 'magic-red-blue-text' :
                            user.nameColor === 'magic_pb' ? 'magic-pink-black-text' :
                            user.nameColor === 'magic_iraq' ? 'magic-iraq-text' :
                            user.nameColor === 'animated-green' ? 'animated-green-text' :
                            user.nameColor === 'animated-red' ? 'animated-red-text' : ''
                          }`} 
                          style={{ color: ['magic', 'magic_neon', 'magic_rb', 'magic_pb', 'magic_iraq', 'animated-green', 'animated-red'].includes(user.nameColor || '') ? undefined : (user.nameColor || '#141414') }}
                        >
                          {user.displayName}
                        </p>
                        {user.isVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{user.phoneNumber}</p>
                    </div>

                    <Button 
                      variant={currentUser?.friends?.includes(user.uid) ? "ghost" : "outline"}
                      size="sm"
                      className={`rounded-xl h-8 px-3 shrink-0 gap-1 font-bold text-[10px] transition-all ios-touch ${
                        currentUser?.friends?.includes(user.uid) 
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
                      ) : currentUser?.friends?.includes(user.uid) ? (
                        <><Check className="w-3 h-3" /> صديق</>
                      ) : (
                        <><UserPlus className="w-3 h-3" /> إضافة</>
                      )}
                    </Button>
                  </div>
                </div>
              );
            } else {
              const chat = item as Chat;
              const isGroup = chat.isGroup;
              const otherParticipantId = !isGroup ? chat.participants.find(p => p !== currentUser?.uid) : null;
              const otherProfile = otherParticipantId ? otherProfiles[otherParticipantId] : null;
              
              const displayName = isGroup ? chat.groupName : (otherProfile?.displayName || 'مستخدم تليعراق');
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
                        {displayName?.slice(0, 2).toUpperCase() || 'CH'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline">
                        <div className="flex items-center gap-1 truncate max-w-[75%]">
                          <p 
                            className={`font-bold text-sm truncate ${
                              activeChatId === chat.id ? '' : (
                                nameColor === 'magic' ? 'magic-color-text' : 
                                nameColor === 'magic_neon' ? 'magic-neon-orange-text' :
                                nameColor === 'magic_rb' ? 'magic-red-blue-text' :
                                nameColor === 'magic_pb' ? 'magic-pink-black-text' :
                                nameColor === 'magic_iraq' ? 'magic-iraq-text' :
                                nameColor === 'animated-green' ? 'animated-green-text' :
                                nameColor === 'animated-red' ? 'animated-red-text' : ''
                              )
                            }`} 
                            style={{ color: activeChatId === chat.id ? 'white' : (['magic', 'magic_neon', 'magic_rb', 'magic_pb', 'magic_iraq', 'animated-green', 'animated-red'].includes(nameColor) ? undefined : (nameColor || '#141414')) }}
                          >
                            {displayName}
                          </p>
                          {!isGroup && otherProfile?.isVerified && (
                            <BadgeCheck className={`w-3.5 h-3.5 shrink-0 ${activeChatId === chat.id ? 'text-white' : 'text-blue-500'} fill-current opacity-90`} />
                          )}
                        </div>
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
                {contacts.filter(c => currentUser?.friends?.includes(c.uid)).map(contact => (
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
                {contacts.filter(c => currentUser?.friends?.includes(c.uid)).length === 0 && (
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
