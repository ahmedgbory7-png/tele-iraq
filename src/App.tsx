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
import { Loader2, AlertCircle, Phone, X, Video, MessageSquare, Bell, Users, User, Settings as SettingsIcon } from 'lucide-react';

import { IraqLogo } from '@/components/IraqLogo';
import { motion, AnimatePresence } from 'motion/react';

import { useStore } from './store/useStore';

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
    resetApp
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
      // 1. Check for calls
      const chatWithCall = snapshot.docs.find(doc => {
         const data = doc.data() as Chat;
         return data.call && data.call.status === 'ringing' && data.call.callerId !== user.uid;
      });

      if (chatWithCall) {
        const data = chatWithCall.data() as Chat;
        const callerDoc = await getDoc(doc(db, 'users', data.call!.callerId));
        setGlobalCall({ 
          chatId: chatWithCall.id, 
          callerName: callerDoc.exists() ? (callerDoc.data() as UserProfile).displayName : 'مستخدم تليعراق',
          type: data.call!.type
        });

        // Auto-end call after 60 seconds if not answered
        const timeoutId = setTimeout(async () => {
          const currentChatDoc = await getDoc(doc(db, 'chats', chatWithCall.id));
          if (currentChatDoc.exists()) {
            const currentData = currentChatDoc.data() as Chat;
            if (currentData.call?.status === 'ringing') {
              await updateDoc(doc(db, 'chats', chatWithCall.id), { 'call.status': 'ended' });
            }
          }
        }, 60000);
      } else {
        setGlobalCall(null);
      }

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

              // Clear notification after 5 seconds
              setTimeout(() => {
                setNotification(null);
              }, 5000);

              // Play subtle sound if possible
              try {
                const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3');
                audio.volume = 0.4;
                audio.play().catch(() => {});
              } catch (e) {}
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
            setProfile(snapshot.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              phoneNumber: firebaseUser.phoneNumber || '',
              displayName: 'مستخدم تليعراق',
              status: 'أنا أستخدم تليعراق!',
              lastSeen: serverTimestamp(),
              nameColor: '#8b5cf6'
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

  const isSubPageActive = !!activeChatId || showProfile || showSettings;
  const isLayer2Active = showProfile || showSettings;

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
        return <div className="flex flex-col h-full bg-card"><ChatList /></div>; // We'll tweak ChatList to handle contacts mode or just use it as is
      case 'settings':
        return <Settings />;
      case 'profile':
        return <Profile />;
      default:
        return <ChatList />;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background relative touch-pan-y" dir="rtl">
      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Page 1: Current Tab */}
        <motion.div 
          initial={false}
          animate={{ 
            x: activeChatId ? '100.1%' : '0%',
            opacity: activeChatId ? 0.4 : 1,
            scale: activeChatId ? 0.98 : 1
          }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute inset-0 flex flex-col bg-card z-10"
          style={{ pointerEvents: activeChatId ? 'none' : 'auto' }}
        >
          {renderTabContent()}
        </motion.div>

        {/* Page 2: Chat Window */}
        <motion.div 
          initial={{ x: '-100.1%' }}
          animate={{ 
            x: activeChatId ? '0%' : '-100.1%',
            opacity: activeChatId ? 1 : 0,
          }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="absolute inset-0 flex flex-col bg-background z-20 shadow-xl"
          style={{ pointerEvents: !activeChatId ? 'none' : 'auto' }}
        >
          {activeChatId && (
            <ChatWindow chatId={activeChatId} onClose={() => setActiveChatId(null)} />
          )}
        </motion.div>
      </div>

      {/* Telegram-style Bottom Navigation */}
      <AnimatePresence>
        {!activeChatId && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="h-16 bg-card border-t flex items-center justify-around px-4 pb-safe z-[60]"
          >
            {[
              { id: 'chats', icon: MessageSquare, label: 'المحادثات' },
              { id: 'contacts', icon: Users, label: 'جهات الاتصال' },
              { id: 'settings', icon: SettingsIcon, label: 'الإعدادات' },
              { id: 'profile', icon: User, label: 'الملف الشخصي' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id as any)}
                className={`flex flex-col items-center justify-center gap-1 min-w-[64px] transition-all ${
                  currentTab === tab.id ? 'text-primary scale-110' : 'text-muted-foreground'
                }`}
              >
                <tab.icon className={`w-5 h-5 ${currentTab === tab.id ? 'fill-primary/10' : ''}`} />
                <span className="text-[10px] font-medium">{tab.label}</span>
                {currentTab === tab.id && (
                  <motion.div 
                    layoutId="activeTab"
                    className="w-1 h-1 rounded-full bg-primary mt-0.5"
                  />
                )}
              </button>
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
            className="fixed top-0 left-4 right-4 z-[1100] bg-card border border-border shadow-2xl p-4 rounded-2xl flex items-center gap-4 cursor-pointer hover:bg-accent/50 transition-colors"
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

      <AnimatePresence>
        {globalCall && activeChatId !== globalCall.chatId && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 20, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-0 left-4 right-4 z-[1000] bg-zinc-900 border border-white/10 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4"
            dir="rtl"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center animate-pulse ${globalCall.type === 'video' ? 'bg-blue-500' : 'purple-gradient'}`}>
                {globalCall.type === 'video' ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm">
                  {globalCall.type === 'video' ? 'مكالمة فيديو واردة' : 'مكالمة صوتية واردة'}
                </span>
                <span className="text-xs text-white/60">{globalCall.callerName} يتصل بك...</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="destructive" 
                className="rounded-full h-10 w-10 p-0"
                onClick={async () => {
                  await updateDoc(doc(db, 'chats', globalCall.chatId), { 'call.status': 'ended' });
                }}
              >
                <X className="w-4 h-4" />
              </Button>
              <Button 
                size="sm" 
                className="rounded-full bg-green-500 hover:bg-green-600 px-4 h-10 font-bold"
                onClick={() => {
                  setActiveChatId(globalCall.chatId);
                  setGlobalCall(null);
                }}
              >
                رد
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

