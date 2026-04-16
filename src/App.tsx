/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, getDocFromServer, onSnapshot, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
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
        setLoading(false);
        setConfigError("استغرق التحميل وقتاً طويلاً. قد تكون هناك مشكلة في الاتصال أو الإعدادات.");
      }
    }, 10000);

    const handleError = (event: ErrorEvent) => {
      console.error("Global error:", event.error);
      setConfigError(`خطأ غير متوقع: ${event.error?.message || "حدث خطأ أثناء تشغيل التطبيق"}`);
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
        const testDoc = doc(db, 'test', 'connection');
        await getDocFromServer(testDoc);
      } catch (error: any) {
        console.error("Connection test error:", error);
        if (error.message?.includes('the client is offline') || error.message?.includes('failed-precondition')) {
          setConfigError("خطأ في الاتصال بالسيرفر. يرجى التأكد من إعدادات Firebase وتوفر الإنترنت.");
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
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, []);

  const [appSystemLoading, setAppSystemLoading] = useState(false);

  if (configError) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <AlertCircle className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">مشكلة في التشغيل</h1>
        <p className="text-muted-foreground max-w-md mb-4">{configError}</p>
        <div className="text-xs text-left bg-muted p-4 rounded-lg overflow-auto max-w-full font-mono">
          <p>Project ID: {auth.app.options.projectId}</p>
          <p>Auth Domain: {auth.app.options.authDomain}</p>
          <p>Platform: {navigator.userAgent.includes('Android') ? 'Android' : 'Web/Other'}</p>
          <p>URL: {window.location.href}</p>
        </div>
        <p className="text-sm text-muted-foreground mt-4">تأكد من إضافة <b>localhost</b> و <b>{window.location.hostname}</b> إلى Authorized Domains في Firebase Console.</p>
        <Button onClick={() => window.location.reload()} className="mt-6">إعادة المحاولة</Button>
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
    <div className="h-screen w-screen flex overflow-hidden bg-background relative" dir="rtl">
      {/* Sidebar / Chat List */}
      <motion.div 
        initial={false}
        animate={{ x: activeChatId ? '100%' : '0%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute inset-0 flex flex-col bg-card z-10"
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

      {/* Main Content / Chat Window */}
      <motion.div 
        initial={{ x: '-100%' }}
        animate={{ x: activeChatId ? '0%' : '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={(e, info) => {
          // In RTL, swiping to the left (negative x) is "back"
          if (info.offset.x < -100 || info.velocity.x < -500) {
            setActiveChatId(null);
          }
        }}
        className="absolute inset-0 flex flex-col bg-background z-20 shadow-[0_0_20px_rgba(0,0,0,0.2)]"
      >
        {activeChatId && (
          <ChatWindow chatId={activeChatId} currentUser={profile} onClose={() => setActiveChatId(null)} />
        )}
      </motion.div>

      {/* Profile Overlay */}
      <AnimatePresence>
        {showProfile && profile && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-background"
          >
            <Profile profile={profile} onClose={() => setShowProfile(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Overlay */}
      <AnimatePresence>
        {showSettings && profile && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-50 bg-background"
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

