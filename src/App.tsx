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
    document.documentElement.dir = language === 'English' ? 'ltr' : 'rtl';
    localStorage.setItem('app-language', language);
  }, [language]);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error: any) {
        if (error.message?.includes('the client is offline')) {
          setConfigError("خطأ في الاتصال بالسيرفر. يرجى التأكد من إعدادات Firebase.");
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
        <h1 className="text-2xl font-bold mb-2">مشكلة في الإعدادات</h1>
        <p className="text-muted-foreground max-w-md">{configError}</p>
        <p className="text-sm text-muted-foreground mt-4">تأكد من إضافة رابط التطبيق إلى Authorized Domains في Firebase Console.</p>
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
    <div className="h-screen w-screen flex overflow-hidden bg-background" dir="rtl">
      {/* Sidebar */}
      <div className="w-80 border-l flex flex-col bg-card shrink-0">
        <ChatList 
          activeChatId={activeChatId} 
          onSelectChat={setActiveChatId} 
          onOpenProfile={() => setShowProfile(true)}
          onOpenSettings={() => setShowSettings(true)}
          currentUser={profile}
          language={language}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        {activeChatId ? (
          <ChatWindow chatId={activeChatId} currentUser={profile} onClose={() => setActiveChatId(null)} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center telegram-bg opacity-80">
            <div className="mb-6">
              <IraqLogo className="w-32 h-32 drop-shadow-2xl" />
            </div>
            <h2 className="text-2xl font-bold mb-2">مرحباً بك في تليعراق</h2>
            <p className="text-muted-foreground font-medium mb-6">اختر محادثة للبدء أو ابدأ محادثة تجريبية</p>
            
            <Button 
              disabled={appSystemLoading}
              onClick={async () => {
                if (!profile || appSystemLoading) return;
                setAppSystemLoading(true);
                try {
                  const systemUser = {
                    uid: 'teleiraq-system',
                    phoneNumber: '+964000000000',
                    displayName: 'نظام تليعراق',
                    status: 'الدعم الفني والآلي',
                    nameColor: '#8b5cf6',
                    photoURL: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png'
                  };
                  await setDoc(doc(db, 'users', systemUser.uid), systemUser, { merge: true });
                  
                  // Check if chat exists
                  const q = query(collection(db, 'chats'), where('participants', 'array-contains', profile.uid));
                  const snap = await getDocs(q);
                  const existing = snap.docs.find(d => d.data().participants.includes(systemUser.uid));
                  
                  if (existing) {
                    setActiveChatId(existing.id);
                  } else {
                    const newChat = {
                      participants: [profile.uid, systemUser.uid],
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
                } catch (err) {
                  console.error("System chat error in App:", err);
                } finally {
                  setAppSystemLoading(false);
                }
              }}
              className="purple-gradient h-12 px-8 rounded-full font-bold shadow-lg hover:scale-105 transition-transform"
            >
              {appSystemLoading ? <Loader2 className="animate-spin mr-2" /> : null}
              ابدأ محادثة تجريبية مع النظام
            </Button>

            <p className="text-xs text-muted-foreground mt-8">تطوير: أبو وطن</p>
          </div>
        )}

        {/* Profile Overlay */}
        {showProfile && profile && (
          <div className="absolute inset-0 z-50 bg-background">
            <Profile profile={profile} onClose={() => setShowProfile(false)} />
          </div>
        )}

        {/* Settings Overlay */}
        {showSettings && profile && (
          <div className="absolute inset-0 z-50 bg-background">
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
          </div>
        )}
      </div>
    </div>
  );
}

