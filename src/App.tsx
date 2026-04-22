/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useRef } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, getDocFromServer, onSnapshot, collection, query, where, getDocs, addDoc, limit, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Auth } from '@/components/Auth';
import { ChatList } from '@/components/ChatList';
import { ChatWindow } from '@/components/ChatWindow';
import { Profile } from '@/components/Profile';
import { Settings } from '@/components/Settings';
import { UserProfile, Chat } from '@/types';
import { Language, translations } from '@/lib/i18n';
import { Loader2, AlertCircle, X, MessageSquare, Bell, Users, User as UserIcon, Settings as SettingsIcon } from 'lucide-react';

import { IraqLogo } from '@/components/IraqLogo';
import { motion, AnimatePresence } from 'motion/react';

import { useStore } from './store/useStore';
import { NOTIFICATION_SOUNDS } from '@/constants';
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
    lastChatId
  } = useStore();

  const lastNotificationTimeRef = useRef<number>(Date.now());
  const activeChatIdRef = useRef<string | null>(activeChatId);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    if (!user) {
      setGlobalCall(null);
      setNotification(null);
      return;
    }
    
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      // 1. Check for message notifications
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
              
              let senderName = 'مستخد تليعراق';
              if (chatData.isGroup && chatData.groupName) {
                senderName = chatData.groupName;
              } else {
                const senderDoc = await getDoc(doc(db, 'users', chatData.lastMessage.senderId));
                if (senderDoc.exists()) {
                  senderName = (senderDoc.data() as UserProfile).displayName;
                }
              }

              setNotification({
                chatId,
                senderName,
                text: chatData.lastMessage.text
              });

              // Also show system notification
              showSystemNotification(senderName, {
                body: chatData.lastMessage.text,
                tag: chatId, // Replace older notifications from same chat
                renotify: true
              } as any);

              // Clear notification after 5 seconds
              setTimeout(() => {
                setNotification(null);
              }, 5000);

              // Play subtle sound if possible
              try {
                const settings = JSON.parse(localStorage.getItem('app-notifications') || '{}');
                const isGroup = chatData.isGroup;
                const soundId = isGroup ? (settings.groupSound || 'default') : (settings.privateSound || 'default');
                const sound = NOTIFICATION_SOUNDS.find(s => s.id === soundId) || NOTIFICATION_SOUNDS[0];
                
                const audio = new Audio(sound.url);
                audio.volume = 0.4;
                audio.play().catch(() => {});
              } catch (e) {
                console.error("Audio playback error:", e);
              }
            }
          }
        }
      });
    });

    return () => unsubscribe();
  }, [user, setGlobalCall, setNotification]);

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
      try {
        // Just checking if we can get anything from a known collection
        const q = query(collection(db, 'users'), limit(1));
        await getDocs(q);
        console.log("Firestore connection verified");
      } catch (error: any) {
        console.warn("Connection test warning:", error);
      }
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
          if (snapshot.exists()) {
            const data = snapshot.data() as UserProfile;
            
            // Data migration for old users
            if (!data.friends || !data.blockedUsers) {
              await updateDoc(doc(db, 'users', firebaseUser.uid), {
                friends: data.friends || [],
                blockedUsers: data.blockedUsers || []
              });
              return; // Let the next snapshot trigger
            }
            const currentLocal = parseInt(localStorage.getItem(`session_${firebaseUser.uid}`) || '0');
            
            // Handle cross-device session termination
            if (data.sessionVersion && data.sessionVersion > currentLocal) {
              if (currentLocal === 0) {
                // New device/session, adopt the current version
                localStorage.setItem(`session_${firebaseUser.uid}`, data.sessionVersion.toString());
              } else {
                console.log("Session terminated remotely");
                localStorage.removeItem(`session_${firebaseUser.uid}`);
                auth.signOut();
                return;
              }
            }
            
            setProfile(data);
          } else {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              phoneNumber: firebaseUser.phoneNumber || '',
              displayName: 'مستخدم تليعراق',
              status: 'أنا أستخدم تليعراق!',
              lastSeen: serverTimestamp(),
              nameColor: '#8b5cf6',
              friends: [],
              blockedUsers: []
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile(newProfile);
          }
          setLoading(false);
        }, (error) => {
          console.error("Profile snapshot error:", error);
          setLoading(false);
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
    
    // Heartbeat for "Last Seen"
    const updatePresence = async () => {
      if (!user?.uid) return;
      if (document.visibilityState === 'visible') {
        try {
          // Use setDoc with merge: true to avoid "not found" or permission errors if profile doesn't exist yet
          await setDoc(doc(db, 'users', user.uid), {
            lastSeen: serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.error("Heartbeat error:", e);
        }
      }
    };

    updatePresence();
    const interval = setInterval(updatePresence, 60000); // 1 minute
    
    document.addEventListener('visibilitychange', updatePresence);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', updatePresence);
    };
  }, [user]);

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
        return <div className="flex flex-col h-full bg-card"><ChatList /></div>;
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
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background relative touch-pan-y" dir="rtl">
      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Page 1: Main Tabs (Chats/Contacts) */}
        <motion.div 
          initial={false}
          animate={{ 
            x: isSubPageActive ? '100.1%' : '0%',
            opacity: isSubPageActive ? 0.4 : 1,
            scale: isSubPageActive ? 0.98 : 1
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
          className="absolute inset-0 flex flex-col bg-background z-20 shadow-xl"
          style={{ pointerEvents: !isSubPageActive ? 'none' : 'auto' }}
        >
          {viewingProfileId ? (
            <Profile />
          ) : activeChatId ? (
            <ChatWindow chatId={activeChatId} onClose={closeSubPage} />
          ) : null}
        </motion.div>
      </div>

      {/* Telegram-style Bottom Navigation */}
      <AnimatePresence>
        {!isSubPageActive && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="h-16 bg-card border-t flex items-center justify-around px-4 pb-safe z-[60]"
          >
            {/* Bottom Nav Items */}
            {[
              { id: 'chats', icon: MessageSquare, label: 'المحادثات' },
              { id: 'contacts', icon: Users, label: 'جهات الاتصال' },
              { id: 'settings', icon: SettingsIcon, label: 'الإعدادات' },
              { id: 'profile', icon: UserIcon, label: 'الملف الشخصي' }
            ].map((tab) => (
              <motion.button
                key={tab.id}
                whileTap={{ scale: 0.9 }}
                onClick={() => setCurrentTab(tab.id as any)}
                className={`flex flex-col items-center justify-center gap-1 min-w-[64px] transition-all ios-touch ${
                  currentTab === tab.id ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <tab.icon className={`w-5 h-5 transition-transform ${currentTab === tab.id ? 'fill-primary/10 scale-110' : ''}`} />
                <span className="text-[10px] font-medium">{tab.label}</span>
                {currentTab === tab.id && (
                  <motion.div 
                    layoutId="activeTab"
                    className="w-1 h-1 rounded-full bg-primary mt-0.5"
                  />
                )}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Call UI */}
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

