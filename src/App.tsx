/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, getDocFromServer, onSnapshot, collection, query, where, getDocs, addDoc, limit } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Auth } from '@/components/Auth';
import { ChatList } from '@/components/ChatList';
import { ChatWindow } from '@/components/ChatWindow';
import { Profile } from '@/components/Profile';
import { Settings } from '@/components/Settings';
import { UserProfile } from '@/types';
import { Language, translations } from '@/lib/i18n';
import { Loader2, AlertCircle } from 'lucide-react';

import { IraqLogo } from '@/components/IraqLogo';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('app-language') as Language) || 'العربية');
  const [configError, setConfigError] = useState<string | null>(null);

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
  }, [loading]);

  useEffect(() => {
    document.documentElement.dir = language === 'English' ? 'ltr' : 'rtl';
    localStorage.setItem('app-language', language);
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
        // Only show fatal error if it's clearly a permission/offline issue on bootstrap
        if (error.message?.includes('the client is offline') || error.message?.includes('Missing or insufficient permissions')) {
          // We don't necessarily want to block the whole app if it's just one request,
          // but if we can't get current user profile later, that will handle it.
        }
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
        setProfile(null);
        setActiveChatId(null);
        setShowProfile(false);
        setShowSettings(false);
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

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

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background relative select-none" dir="rtl">
      {/* Page 1: Chat List */}
      <motion.div 
        initial={false}
        animate={{ 
          x: isSubPageActive ? '100.1%' : '0%',
          opacity: isSubPageActive ? 0 : 1,
          scale: isSubPageActive ? 0.95 : 1
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute inset-0 flex flex-col bg-card z-10"
        style={{ pointerEvents: isSubPageActive ? 'none' : 'auto' }}
      >
        <ChatList 
          activeChatId={activeChatId} 
          onSelectChat={setActiveChatId} 
          onOpenProfile={() => setShowProfile(true)}
          onOpenSettings={() => setShowSettings(true)}
          currentUser={profile}
          language={language}
        />
      </motion.div>

      {/* Page 2: Chat Window */}
      <motion.div 
        initial={{ x: '-100.1%' }}
        animate={{ 
          x: isLayer2Active ? '100.1%' : (activeChatId ? '0%' : '-100.1%'),
          opacity: isLayer2Active ? 0 : (activeChatId ? 1 : 0),
          scale: isLayer2Active ? 0.95 : 1
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        drag={activeChatId && !isLayer2Active ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={(e, info) => {
          // In RTL, we use x: 100% for left and x: -100% for right.
          // Chat enters from -100% (right) to 0% (center).
          // To go back, we swipe it back to the right (positive offset).
          if (info.offset.x > 100 || info.velocity.x > 500) {
            setActiveChatId(null);
          }
        }}
        className="absolute inset-0 flex flex-col bg-background z-20 shadow-xl"
        style={{ pointerEvents: !activeChatId || isLayer2Active ? 'none' : 'auto' }}
      >
        {activeChatId && (
          <ChatWindow chatId={activeChatId} currentUser={profile} onClose={() => setActiveChatId(null)} />
        )}
      </motion.div>

      {/* Page 3: Profile Overlay */}
      <AnimatePresence>
        {showProfile && profile && (
          <motion.div 
            initial={{ x: '-100.1%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100.1%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-background shadow-2xl"
          >
            <Profile profile={profile} onClose={() => setShowProfile(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page 4: Settings Overlay */}
      <AnimatePresence>
        {showSettings && profile && (
          <motion.div 
            initial={{ x: '-100.1%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100.1%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-background shadow-2xl"
          >
            <Settings 
              profile={profile} 
              onClose={() => setShowSettings(false)} 
              onOpenProfile={() => {
                setShowSettings(false);
                setShowProfile(true);
              }}
              language={language}
              onLanguageChange={setLanguage}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

