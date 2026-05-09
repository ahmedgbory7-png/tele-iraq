/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, getDocFromServer, onSnapshot, collection, query, where, getDocs, addDoc, limit, updateDoc, orderBy } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Auth } from '@/components/Auth';
import { ChatList } from '@/components/ChatList';
import { ContactList } from '@/components/ContactList';
import { ChatWindow } from '@/components/ChatWindow';
import { Profile } from '@/components/Profile';
import { Settings } from '@/components/Settings';
import { UserManagementDashboard } from '@/components/UserManagementDashboard';
import { SystemAlert } from '@/components/SystemAlert';
import { UserProfile, Chat } from '@/types';
import { Language, translations } from '@/lib/i18n';
import { Loader2, AlertCircle, X, MessageSquare, Bell, Users, User as UserIcon, Settings as SettingsIcon, Phone, VideoOff, PhoneOff, Video } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import { motion, AnimatePresence } from 'motion/react';

import { useStore } from './store/useStore';
import { NOTIFICATION_SOUNDS, RINGTONE_URL } from '@/constants';
import { requestNotificationPermission, showSystemNotification } from '@/lib/notifications';

export default function App() {
  const {
    user, setUser,
    profile, setProfile,
    loading, setLoading,
    activeChatId, setActiveChatId,
    showProfile, setShowProfile,
    showSettings, setShowSettings,
    language, setLanguage,
    configError, setConfigError,
    globalCall, setGlobalCall,
    notification, setNotification,
    currentTab, setCurrentTab,
    resetApp,
    viewingProfileId, setViewingProfileId,
    lastChatId,
    quotaExceeded, setQuotaExceeded,
    showUserDashboard, setShowUserDashboard,
    chats, setChats,
    fontSize, setActiveRealCall,
    isFocusMode
  } = useStore();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('font-size-small', 'font-size-medium', 'font-size-large', 'font-size-xlarge');
    root.classList.add(`font-size-${fontSize}`);
  }, [fontSize]);

  const lastNotificationTimeRef = useRef<number>(Date.now());
  const activeChatIdRef = useRef<string | null>(activeChatId);
  const migrationAttemptedRef = useRef(false);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const [totalUnread, setTotalUnread] = useState(0);

  const senderProfilesRef = useRef<Record<string, string>>({});
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const [incomingCall, setIncomingCall] = useState<any>(null);

  useEffect(() => {
    if (user) {
      requestNotificationPermission();
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setGlobalCall(null);
      setNotification(null);
      setTotalUnread(0);
      setChats([]);
      senderProfilesRef.current = {};
      setIncomingCall(null);
      setActiveRealCall(null); // Clear active call on logout
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current = null;
      }
      return;
    }

    // Global Call Listener
    if (useStore.getState().quotaExceeded) return;

    const callsQ = query(
      collection(db, 'calls'),
      where('receiverId', '==', user.uid),
      where('status', '==', 'calling'),
      limit(1)
    );

    const callUnsubscribe = onSnapshot(callsQ, async (snapshot) => {
      const currentActiveCall = useStore.getState().activeRealCall;
      if (!snapshot.empty) {
        const callDoc = snapshot.docs[0];
        const callData = { ...callDoc.data(), id: callDoc.id } as any;

        if (currentActiveCall) {
          // Send busy status if already in call
          try {
            await updateDoc(doc(db, 'calls', callData.id), { status: 'busy' });
          } catch (e) {}
          return;
        }

        setIncomingCall(callData);
        
        // Notification & Ringtone
        if (!ringtoneRef.current) {
          ringtoneRef.current = new Audio(RINGTONE_URL);
          ringtoneRef.current.loop = true;
          ringtoneRef.current.play().catch(() => {});
        }

        if (document.hidden || !document.hasFocus()) {
          // Fetch caller profile for better notification
          let callerName = callData.callerId?.slice(0,6) + '...';
          try {
            const callerSnap = await getDocFromServer(doc(db, 'users', callData.callerId));
            if (callerSnap.exists()) {
              callerName = callerSnap.data().displayName;
            }
          } catch (err) {}

          const callTypeText = callData.type === 'video' ? 'فيديو' : 'صوتية';
          showSystemNotification('مكالمة واردة', {
            body: `مكالمة ${callTypeText} من ${callerName}`,
            tag: 'incoming-call',
            requireInteraction: true,
            silent: false
          });
        }
      } else {
        setIncomingCall(null);
        if (ringtoneRef.current) {
          ringtoneRef.current.pause();
          ringtoneRef.current = null;
        }
      }
    });
    
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(30)
    );

    if (useStore.getState().quotaExceeded) {
      // Don't start more listeners if already erroring
      return;
    }

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (useStore.getState().quotaExceeded) return;
      
      const newChats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chat));
      
      // Sort manually to match what UI expects
      newChats.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis?.() || 0;
        const timeB = b.updatedAt?.toMillis?.() || 0;
        return timeB - timeA;
      });

      setChats(newChats);

      let unread = 0;
      newChats.forEach(data => {
        unread += (data.unreadCount?.[user.uid] || 0);
      });
      setTotalUnread(unread);

              // 2. Check for message notifications
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'modified') {
          const chatData = change.doc.data() as Chat;
          const chatId = change.doc.id;
          
          if (
            chatData.lastMessage && 
            chatData.lastMessage.senderId !== user.uid && 
            chatId !== activeChatIdRef.current &&
            chatData.lastMessage.createdAt
          ) {
            const msgTime = chatData.lastMessage.createdAt.toMillis ? chatData.lastMessage.createdAt.toMillis() : Date.now();
            
            // Only notify if it's a NEW message that happened just now
            if (msgTime > lastNotificationTimeRef.current) {
              lastNotificationTimeRef.current = msgTime;
              
              let senderName = 'مستخدم تلي عراق';
              const senderId = chatData.lastMessage.senderId;

              // Priority 1: Check chatData participantProfiles (Denormalized in document)
              if (chatData.isGroup && chatData.groupName) {
                senderName = chatData.groupName;
              } else if (chatData.participantProfiles && senderId) {
                const p = chatData.participantProfiles[senderId] as any;
                if (p?.displayName) {
                  senderName = p.displayName;
                }
              }
              
              // Priority 2: Use cache
              if (senderName === 'مستخدم تلي عراق' && senderProfilesRef.current[senderId]) {
                senderName = senderProfilesRef.current[senderId];
              }

              // Priority 3: Check friendDetails in currentUser profile (already in memory)
              if (senderName === 'مستخدم تلي عراق' && useStore.getState().profile?.friendDetails?.[senderId]) {
                senderName = useStore.getState().profile?.friendDetails?.[senderId]?.displayName || senderName;
                senderProfilesRef.current[senderId] = senderName;
              }

              // Priority 4: Fallback to fetch only if absolutely necessary and not in cache
              // We use a small optimization here: we check if we already tried fetching this session
              if (senderName === 'مستخدم تلي عراق' && !chatData.isGroup) {
                try {
                  // Reduced frequency of fetches by relying on above layers
                  const senderDoc = await getDoc(doc(db, 'users', senderId));
                  if (senderDoc.exists()) {
                    senderName = (senderDoc.data() as UserProfile).displayName;
                    senderProfilesRef.current[senderId] = senderName;
                  }
                } catch (e: any) {
                  console.error("Minimal fetch fail:", e);
                  if (e.code === 'resource-exhausted') setQuotaExceeded(true);
                }
              }

              setNotification({
                chatId,
                senderName,
                text: chatData.lastMessage.text
              });
              
              const settings = JSON.parse(localStorage.getItem('app-notifications') || '{"private":true,"groups":true,"calls":true,"globalMute":false}');
              const isGlobalMuted = settings.globalMute === true;

              // Also show system notification
              if (!isGlobalMuted) {
                showSystemNotification(senderName, {
                  body: chatData.lastMessage.text,
                  tag: chatId, // Replace older notifications from same chat
                  renotify: true
                } as any);
              }

              // Clear notification after 5 seconds
              setTimeout(() => {
                setNotification(null);
              }, 5000);

              // Play subtle sound if possible
              try {
                const state = useStore.getState();
                const settings = JSON.parse(localStorage.getItem('app-notifications') || '{"private":true,"groups":true,"calls":true}');
                const isGroup = chatData.isGroup;
                
                // Only play sound if notifications are enabled for this type
                const isEnabled = isGroup ? settings.groups : settings.private;
                const isGlobalMuted = settings.globalMute === true;
                
                if (isEnabled && !isGlobalMuted) {
                  // Check for chat-specific sound first
                  const chatSound = state.chatSounds[chatId];
                  const soundId = chatSound || (isGroup ? state.groupChatSound : state.privateChatSound);
                  
                  let soundUrl = '';
                  const presetSound = NOTIFICATION_SOUNDS.find(s => s.id === soundId);
                  
                  if (presetSound) {
                    soundUrl = presetSound.url;
                  } else if (soundId?.includes('data:audio')) {
                    soundUrl = soundId; // Custom uploaded sound
                  } else {
                    soundUrl = NOTIFICATION_SOUNDS[0].url; // Default
                  }
                  
                  if (soundUrl) {
                    const audio = new Audio(soundUrl);
                    audio.volume = 0.4;
                    audio.play().catch(() => {});
                  }
                }
              } catch (e) {
                console.error("Audio playback error:", e);
              }
            }
          }
        }
      });
    }, (error: any) => {
      console.error("Global chats snapshot error:", error);
      if (error.code === 'resource-exhausted' || error.message?.includes('quota')) {
        setQuotaExceeded(true);
      }
    });

    return () => {
      unsubscribe();
      callUnsubscribe();
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
      }
    };
  }, [user, setGlobalCall, setNotification, setChats]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        // Just set loading false and log a warning instead of a hard error screen
        // if we still haven't received auth state.
        console.warn("Auth initialization is taking longer than expected...");
        setLoading(false);
      }
    }, 20000);

    const handleError = (event: ErrorEvent) => {
      // Don't show hard error screen for generic script errors or benign warnings
      if (event.message?.includes('ResizeObserver') || event.message?.includes('Extension')) return;
      
      console.error("Global error:", event.error);
      // We'll log it but not block the app unless it's a major missing config error
      if (event.error?.message?.includes('apiKey') || event.error?.message?.includes('projectId')) {
        setConfigError(`إعدادات Firebase غير مكتملة: ${event.error?.message}`);
      }
    };

    window.addEventListener('error', handleError);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('error', handleError);
    };
  }, [loading, setLoading, setConfigError]);

  useEffect(() => {
    document.documentElement.dir = language === 'English' ? 'ltr' : 'rtl';
    requestNotificationPermission();
  }, [language]);

  useEffect(() => {
    async function testConnection() {
      // Removed redundant connection test to save quota. 
      // Individual listeners already handle quota and connection errors.
      console.log("Monitoring connectivity...");
    }
    testConnection();

    let profileUnsubscribe: (() => void) | null = null;

    const authUnsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
      }

      if (firebaseUser) {
        // Listen to profile in real-time
        profileUnsubscribe = onSnapshot(doc(db, 'users', firebaseUser.uid), async (snapshot) => {
          try {
            if (snapshot.exists()) {
              const data = snapshot.data() as UserProfile;
              
              // Handle ban or deletion
              if (data.isBanned || data.isDeleted) {
                auth.signOut();
                setConfigError(data.isBanned ? 'تم حظر هذا الحساب من قبل الإدارة.' : 'هذا الحساب تم حذفه.');
                return;
              }

              // Handle forced logout signal
              const lastLogoutSignal = parseInt(localStorage.getItem(`force_logout_${firebaseUser.uid}`) || '0');
              if (data.forceLogoutSignal && data.forceLogoutSignal > lastLogoutSignal) {
                localStorage.setItem(`force_logout_${firebaseUser.uid}`, data.forceLogoutSignal.toString());
                auth.signOut();
                return;
              }

              // Data migration for old users - only if really missing to save writes
              if ((data.friends === undefined || data.blockedUsers === undefined) && !migrationAttemptedRef.current) {
                migrationAttemptedRef.current = true;
                try {
                  await updateDoc(doc(db, 'users', firebaseUser.uid), {
                    friends: data.friends || [],
                    blockedUsers: data.blockedUsers || []
                  });
                } catch (err) {
                  console.error("Migration write failed:", err);
                }
                return; // Let the next snapshot trigger
              }
              const currentLocal = parseInt(localStorage.getItem(`session_${firebaseUser.uid}`) || '0');
              
              // Handle cross-device session termination
              if (data.sessionVersion && data.sessionVersion > currentLocal) {
                if (currentLocal === 0) {
                  localStorage.setItem(`session_${firebaseUser.uid}`, data.sessionVersion.toString());
                } else {
                  localStorage.removeItem(`session_${firebaseUser.uid}`);
                  auth.signOut();
                  return;
                }
              }
              
              setProfile(data);
            } else {
              const newProfile: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || `${firebaseUser.uid?.slice(0, 8)}@teleiraq.app`,
                phoneNumber: firebaseUser.phoneNumber || '',
                displayName: firebaseUser.displayName || 'مستخدم تلي عراق',
                status: 'أنا أستخدم تلي عراق!',
                lastSeen: serverTimestamp(),
                nameColor: '#8b5cf6',
                friends: [],
                blockedUsers: []
              };
              await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
              setProfile(newProfile);
            }
          } catch (err: any) {
            console.error("Error in profile processing:", err);
            setConfigError(`خطأ في تهيئة الحساب: ${err.message}`);
          } finally {
            setLoading(false);
          }
        }, (error: any) => {
          console.error("Profile snapshot error:", error);
          setLoading(false);
          if (error.code === 'resource-exhausted' || error.message?.includes('quota')) {
            setQuotaExceeded(true);
          }
          setConfigError(`خطأ في تحميل الملف الشخصي: ${error.message}`);
        });
      } else {
        resetApp();
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, [setUser, setProfile, setLoading, setConfigError, resetApp]);

  useEffect(() => {
    if (!user) return;
    
    let lastPresenceUpdate = 0;
    const PRESENCE_COOLDOWN = 900000; // 15 minutes cooldown

    // Heartbeat for "Last Seen"
    const updatePresence = async () => {
      if (!user?.uid || useStore.getState().quotaExceeded) return;
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastPresenceUpdate < PRESENCE_COOLDOWN) return;
        
        try {
          lastPresenceUpdate = now;
          // Use setDoc with merge: true to avoid "not found" or permission errors if profile doesn't exist yet
          await setDoc(doc(db, 'users', user.uid), {
            lastSeen: serverTimestamp()
          }, { merge: true });
        } catch (e: any) {
          if (e.code === 'resource-exhausted') {
            setQuotaExceeded(true);
          } else {
            console.error("Heartbeat error:", e);
          }
        }
      }
    };

    updatePresence();
    const interval = setInterval(updatePresence, 900000); // 15 minutes
    
    document.addEventListener('visibilitychange', updatePresence);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', updatePresence);
    };
  }, [user]);

  const t = translations[language];

  const isSubPageActive = !!activeChatId || !!viewingProfileId;

  if (configError) {
    const handleClearAndReload = () => {
      localStorage.clear();
      window.location.reload();
    };

    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <AlertCircle className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">تنبيه النظام</h1>
        <p className="text-muted-foreground max-w-md mb-6">{configError}</p>
        
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <Button onClick={() => window.location.reload()} variant="default">إعادة المحاولة</Button>
          <Button onClick={handleClearAndReload} variant="outline">مسح الذاكرة وإعادة التشغيل</Button>
          <Button onClick={() => setConfigError(null)} variant="ghost" className="text-xs text-muted-foreground">تجاوز الخطأ (قد لا يعمل التطبيق)</Button>
        </div>

        <div className="mt-12 text-[10px] text-left opacity-30 font-mono grayscale hover:grayscale-0 transition-all">
          <p>Dev Info:</p>
          <p>ID: {auth.app.options.projectId}</p>
          <p>URL: {window.location.hostname}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const renderTabContent = () => {
    switch (currentTab) {
      case 'chats':
        return <ChatList />;
      case 'contacts':
        return <ContactList onClose={() => setCurrentTab('chats')} />;
      case 'profile':
        return <Profile />;
      case 'settings':
        return <Settings />;
      default:
        return <ChatList />;
    }
  };

  const closeSubPage = () => {
    setActiveChatId(null);
    setViewingProfileId(null);
    if (currentTab === 'profile' || currentTab === 'settings') {
      setCurrentTab('chats');
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background relative touch-pan-y" dir={language === 'English' ? 'ltr' : 'rtl'}>
      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Page 1: Main Tabs (Chats/Contacts) */}
        <motion.div 
          initial={false}
          animate={{ 
            x: isSubPageActive ? '100.1%' : '0%',
            opacity: isFocusMode && isSubPageActive ? 0.05 : (isSubPageActive ? 0.4 : 1),
            scale: isFocusMode && isSubPageActive ? 0.9 : (isSubPageActive ? 0.98 : 1),
            filter: isFocusMode && isSubPageActive ? 'blur(10px)' : 'blur(0px)'
          }}
          drag={(!isSubPageActive && !!lastChatId) ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.8 }}
          onDragEnd={(_, info) => {
            if (!isSubPageActive && lastChatId && info.offset.x > 100) {
              setActiveChatId(lastChatId);
            }
          }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute inset-0 flex flex-col bg-card z-10"
          style={{ pointerEvents: isSubPageActive ? 'none' : 'auto' }}
        >
          {renderTabContent()}
        </motion.div>

        {/* Page 2: Overlays (Chat/Profile/Settings) */}
        <motion.div 
          initial={{ x: '-100.1%' }}
          animate={{ 
            x: isSubPageActive ? '0%' : '-100.1%',
            opacity: isSubPageActive ? 1 : 0,
          }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0.8, right: 0 }}
          onDragEnd={(_, info) => {
            if (isSubPageActive && info.offset.x < -100) {
              closeSubPage();
            }
          }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className={`absolute inset-0 flex flex-col bg-background z-20 shadow-2xl ${
            language === 'English' ? 'border-l border-border/40' : 'border-r border-border/40'
          }`}
          style={{ 
            pointerEvents: !isSubPageActive ? 'none' : 'auto',
            boxShadow: isSubPageActive ? (language === 'English' ? '-10px 0 30px -10px rgba(0,0,0,0.2)' : '10px 0 30px -10px rgba(0,0,0,0.2)') : 'none'
          }}
        >
          {viewingProfileId ? (
            <Profile />
          ) : activeChatId ? (
            <ChatWindow chatId={activeChatId} onClose={closeSubPage} />
          ) : null}
        </motion.div>
      </div>

      <AnimatePresence>
        {incomingCall && !activeChatId && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-x-4 bottom-24 z-[1000] bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center gap-4"
            dir="rtl"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                <Avatar className="h-20 w-20 border-4 border-primary/20 shadow-2xl">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Phone className="w-8 h-8" />
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="text-center">
                <h3 className="text-lg font-black text-white">مكالمة {incomingCall.type === 'video' ? 'فيديو' : 'صوتية'} واردة</h3>
                <p className="text-xs text-white/60">يرغب بالاتصال بك...</p>
              </div>
            </div>
            
            <div className="flex gap-4 w-full">
              <Button 
                variant="destructive" 
                className="flex-1 h-14 rounded-2xl gap-2 font-bold shadow-lg shadow-red-500/20 active:scale-95 transition-transform"
                onClick={async () => {
                   try {
                     await updateDoc(doc(db, 'calls', incomingCall.id), { status: 'rejected' });
                   } catch (e) {
                     console.error("Error rejecting call:", e);
                   }
                }}
              >
                <PhoneOff className="w-5 h-5" />
                رفض
              </Button>
              <Button 
                className="flex-1 h-14 rounded-2xl bg-green-600 hover:bg-green-700 text-white gap-2 font-bold shadow-lg shadow-green-500/20 active:scale-95 transition-transform"
                onClick={async () => {
                   const chatId = incomingCall.chatId;
                   const callData = incomingCall;
                   
                   // Fetch other profile if needed for the call screen
                   let otherP = null;
                   try {
                     const snap = await getDoc(doc(db, 'users', callData.callerId));
                     if (snap.exists()) otherP = snap.data();
                   } catch (e) {}
                   
                   // Set active real call before switching chat to avoid race
                   setActiveRealCall({ 
                     type: callData.type, 
                     isCaller: false, 
                     callId: callData.id 
                   });
                   
                   setActiveChatId(chatId);
                   setIncomingCall(null);
                }}
              >
                <Phone className="w-5 h-5" />
                رد
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {quotaExceeded && !showUserDashboard && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            className="fixed top-0 left-0 right-0 z-[9999] p-4"
          >
            <div className="bg-orange-500 text-white rounded-2xl shadow-2xl p-4 flex items-center justify-between gap-4 backdrop-blur-md border border-orange-400/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm leading-tight">تم الوصول للحد اليومي (الكوتا)</p>
                  <p className="text-[10px] opacity-90 font-medium">سيتم إعادة تصفير العداد خلال 24 ساعة. شكراً لصبركم 🇮🇶</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="hover:bg-white/20 text-white shrink-0" onClick={() => setQuotaExceeded(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Bottom Navigation Bar */}
      <AnimatePresence>
        {!isSubPageActive && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="fixed bottom-0 inset-x-0 h-20 bg-background/80 backdrop-blur-2xl border-t border-border/50 flex items-center justify-around px-2 pb-safe z-[60] shadow-[0_-10px_30px_rgba(0,0,0,0.05)]"
          >
            {[
              { id: 'chats', icon: MessageSquare, label: language === 'العربية' ? 'المحادثات' : 'Chats' },
              { id: 'contacts', icon: Users, label: language === 'العربية' ? 'جهات الاتصال' : 'Contacts' },
              { id: 'profile', icon: UserIcon, label: language === 'العربية' ? 'الملف الشخصي' : 'Profile' },
              { id: 'settings', icon: SettingsIcon, label: language === 'العربية' ? 'الإعدادات' : 'Settings' }
            ].map((tab) => {
              const isActive = currentTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setCurrentTab(tab.id as any)}
                  className={`relative flex flex-col items-center justify-center gap-1.5 w-[72px] h-14 transition-all ${
                    isActive ? 'text-primary' : 'text-muted-foreground/60'
                  }`}
                >
                  {isActive && (
                    <motion.div 
                      layoutId="nav-active-bg"
                      className="absolute inset-0 bg-primary/10 rounded-2xl -z-10"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  
                  <div className="relative">
                    <tab.icon className={`w-5 h-5 transition-all duration-300 ${isActive ? 'scale-110 stroke-[2.5px]' : 'scale-100 opacity-80'}`} />
                    {tab.id === 'chats' && totalUnread > 0 && (
                      <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-white text-[9px] font-black flex items-center justify-center border-2 border-background shadow-lg"
                      >
                        {totalUnread > 99 ? '99+' : totalUnread}
                      </motion.div>
                    )}
                  </div>
                  
                  <span className={`text-[10px] font-black uppercase tracking-tight transition-all duration-300 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-0.5'}`}>
                    {tab.label}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Call UI */}
      <SystemAlert />
      {/* User Management Dashboard Overlay */}
      <AnimatePresence>
        {showUserDashboard && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[1100]"
          >
            <UserManagementDashboard onClose={() => setShowUserDashboard(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ y: -50, opacity: 0, scale: 0.95 }}
            animate={{ y: 20, opacity: 1, scale: 1 }}
            exit={{ y: -50, opacity: 0, scale: 0.95 }}
            className="fixed top-0 left-4 right-4 z-[1100] bg-card/90 backdrop-blur-xl border border-border/50 shadow-2xl p-4 rounded-3xl flex items-center gap-4 cursor-pointer hover:bg-accent/50 transition-colors ios-touch"
            dir="rtl"
            onClick={() => {
              setActiveChatId(notification.chatId);
              setNotification(null);
            }}
          >
            <div className="w-12 h-12 rounded-full purple-gradient flex items-center justify-center text-white shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm truncate">{notification.senderName}</span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">الآن</span>
              </div>
              <p className="text-xs text-muted-foreground truncate line-clamp-1 mt-0.5">
                {notification.text}
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="rounded-full h-8 w-8 hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                setNotification(null);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

