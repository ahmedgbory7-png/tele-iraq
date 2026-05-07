import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Mail, Lock, LogIn, UserPlus, ShieldCheck, Loader2 } from 'lucide-react';
import { auth, db } from '@/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

import { IraqLogo } from '@/components/IraqLogo';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return setError('يرجى ملء جميع الحقول');
    if (!isLogin && !displayName) return setError('يرجى إدخال اسم المستخدم');

    setLoading(true);
    setError('');
    
    // Smart mapping for user intent:
    // 1. If it's a real email, use it.
    // 2. If it's "ISOFIQ" (developer), map to isofiq@teleiraq.app.
    // 3. If it's a username without @, treat as local username and map to @teleiraq.app domain.
    const isEmail = trimmedEmail.includes('@');
    const normalizedId = trimmedEmail.toLowerCase();
    let authEmail = trimmedEmail;

    if (!isEmail) {
      if (normalizedId === 'isofiq') {
        authEmail = 'isofiq@teleiraq.app';
      } else {
        // Support Arabic and other characters by generating a safe email prefix
        // We clean it but if it becomes empty we use a hex representation of the string
        let cleanName = trimmedEmail.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        
        if (!cleanName) {
          // If the username is purely Arabic or symbol-heavy, generate a deterministic hash/id
          // This allows users to "Sign In" with their Arabic nickname as an ID
          let hash = 0;
          for (let i = 0; i < trimmedEmail.length; i++) {
            hash = ((hash << 5) - hash) + trimmedEmail.charCodeAt(i);
            hash = hash & hash; // Convert to 32bit int
          }
          cleanName = 'user_' + Math.abs(hash).toString(36);
        }
        
        authEmail = `${cleanName}@teleiraq.app`;
      }
    }

    try {
      if (isLogin) {
        try {
          await signInWithEmailAndPassword(auth, authEmail, password);
        } catch (signInErr: any) {
          console.log('SignIn error:', signInErr.code);
          // If user not found, help them out
          if (signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') {
            // Check if this is a registration attempt on the login page
            setError('هذا الحساب غير موجود. هل تقصد "إنشاء حساب" جديد؟');
            return;
          }
          throw signInErr;
        }
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName });
        
        // Create initial profile with normalized data
        const initialProfile: any = {
          uid: user.uid,
          email: user.email,
          username: isEmail ? null : (trimmedEmail.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || authEmail.split('@')[0]),
          displayName: displayName,
          status: 'أنا أستخدم تلي عراق!',
          lastSeen: serverTimestamp(),
          nameColor: '#8b5cf6',
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          reels: [],
          friends: [],
          blockedUsers: [],
          sessionVersion: 1
        };

        // Only add developer/verified flags if the email matches - otherwise Firestore rules will reject the 'create'
        if (user.email?.toLowerCase() === 'isofiq@teleiraq.app' || user.email?.toLowerCase() === 'ahmedgbory7@gmail.com') {
          initialProfile.isDeveloper = true;
          initialProfile.isVerified = true;
        }

        await setDoc(doc(db, 'users', user.uid), initialProfile);
      }
    } catch (err: any) {
      console.error('Auth error details:', err.code, err.message);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('بيانات الدخول غير صحيحة. يرجى التأكد من اسم المستخدم وكلمة المرور.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('اسم المستخدم هذا محجوز بالفعل. يرجى اختيار اسم آخر.');
      } else if (err.code === 'auth/weak-password') {
        setError('كلمة المرور ضعيفة جداً. استخدم 6 خانات أو أكثر.');
      } else if (err.code === 'auth/invalid-email') {
        setError('البريد أو الاسم المدخل غير صالح.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('مشكلة في الاتصال بالإنترنت. يرجى المحاولة لاحقاً.');
      } else {
        setError('عذراً، حدث خطأ ما أثناء العملية. حاول مجدداً.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background telegram-bg px-4" dir="rtl">
      <div id="recaptcha-container"></div>
      
      <Card className="w-full max-w-md border-none shadow-2xl overflow-hidden glass-morphism rounded-[2.5rem]">
        <CardHeader className="text-center space-y-4 pt-10">
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mx-auto"
          >
            <IraqLogo className="w-24 h-24 drop-shadow-2xl" />
          </motion.div>
          <div className="space-y-2">
            <CardTitle className="text-4xl font-black tracking-tight magic-iraq-text pb-1">تلي عراق</CardTitle>
            <CardDescription className="text-base font-bold text-muted-foreground/80">
              {isLogin ? 'تسجيل الدخول إلى حسابك' : 'إنشاء حساب جديد في تلي عراق'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pb-12 px-8">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-destructive/10 text-destructive text-sm p-4 rounded-2xl border border-destructive/20 text-right font-bold"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleEmailAuth} className="space-y-5">
            <AnimatePresence mode="popLayout">
              {!isLogin && (
                <motion.div 
                  initial={{ x: 50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -50, opacity: 0 }}
                  className="space-y-2"
                >
                  <label className="text-xs font-black uppercase tracking-wider text-muted-foreground/70 px-2">الاسم الذي سيظهر للآخرين</label>
                  <div className="relative group">
                    <UserPlus className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <Input
                      placeholder="مثال: أحمد العراقي"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="pr-12 h-14 bg-muted/30 border-2 border-transparent focus:border-primary/20 rounded-2xl font-bold transition-all"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground/70 px-2">اسم المستخدم أو المعرف</label>
              <div className="relative group">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  type="text"
                  placeholder="Username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pr-12 h-14 bg-muted/30 border-2 border-transparent focus:border-primary/20 rounded-2xl font-bold transition-all text-left"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground/70 px-2">كلمة المرور</label>
              <div className="relative group">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-12 h-14 bg-muted/30 border-2 border-transparent focus:border-primary/20 rounded-2xl font-bold transition-all text-left"
                  dir="ltr"
                />
              </div>
            </div>

            <Button 
              type="submit"
              className="w-full h-14 text-lg font-black purple-gradient hover:opacity-90 transition-all rounded-2xl shadow-xl active:scale-[0.98] mt-4"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin ml-2 h-6 w-6" /> : (isLogin ? <LogIn className="ml-2 h-6 w-6" /> : <UserPlus className="ml-2 h-6 w-6" />)}
              {isLogin ? 'دخول آمن' : 'إنشاء الحساب الآن'}
            </Button>

            <div className="pt-2">
              <button 
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="w-full py-3 text-sm font-black text-primary hover:text-primary/80 transition-colors"
              >
                {isLogin ? (
                  <span className="flex items-center justify-center gap-2">
                    ليس لديك حساب؟ <span className="underline decoration-2 underline-offset-4">سجل مجاناً</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    لديك حساب بالفعل؟ <span className="underline decoration-2 underline-offset-4">قم بتسجيل الدخول</span>
                  </span>
                )}
              </button>
            </div>
          </form>
          
          <div className="text-[10px] text-center text-muted-foreground/50 font-bold uppercase tracking-[0.2em] pt-4">
            نظام تلي عراق المطور • {new Date().getFullYear()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
