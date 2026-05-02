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
        // Allow ONLY alphanumeric and . _ - for clean username
        const cleanName = trimmedEmail.replace(/[^a-zA-Z0-9._\-]/g, '').toLowerCase();
        if (!cleanName) return setError('اسم المستخدم غير صالح');
        authEmail = `${cleanName}@teleiraq.app`;
      }
    }

    try {
      if (isLogin) {
        try {
          await signInWithEmailAndPassword(auth, authEmail, password);
        } catch (signInErr: any) {
          // If developer account not found, suggest registration
          if ((signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') && normalizedId === 'isofiq') {
            setError('حساب المطور غير موجود أو البيانات غير صحيحة. يرجى "إنشاء حساب" أولاً بنفس هذه البيانات.');
            return;
          }
          throw signInErr;
        }
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName });
        
        // Create initial profile with normalized data
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          username: isEmail ? null : trimmedEmail.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
          displayName: displayName,
          status: 'أنا أستخدم تلي عراق!',
          lastSeen: serverTimestamp(),
          nameColor: '#8b5cf6',
          photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          reels: [],
          friends: [],
          blockedUsers: [],
          isDeveloper: user.email?.toLowerCase() === 'isofiq@teleiraq.app',
          isVerified: user.email?.toLowerCase() === 'isofiq@teleiraq.app',
          sessionVersion: 1
        });
      }
    } catch (err: any) {
      console.error('Auth error details:', err.code, err.message);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('خطأ في اسم المستخدم أو كلمة المرور. تأكد من البيانات المدخلة.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('اسم المستخدم هذا مستخدم مسبقاً، يرجى اختيار اسم آخر.');
      } else if (err.code === 'auth/weak-password') {
        setError('كلمة المرور ضعيفة جداً، يرجى اختيار 6 أحرف أو أكثر.');
      } else if (err.code === 'auth/invalid-email') {
        setError('الاسم أو البريد غير صالح. استخدم أحرف إنجليزية وأرقام فقط.');
      } else {
        setError('حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background telegram-bg" dir="rtl">
      <div id="recaptcha-container"></div>
      
      <Card className="w-full max-w-md border-none shadow-2xl overflow-hidden">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto">
            <IraqLogo className="w-20 h-20" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-4xl font-black tracking-tight magic-iraq-text pb-1">تلي عراق</CardTitle>
            <CardDescription className="text-base font-medium">
              {isLogin ? 'تسجيل الدخول إلى حسابك' : 'إنشاء حساب جديد في تلي عراق'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20 text-right animate-shake">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <label className="text-sm font-bold px-1">اسم المستخدم الكامل</label>
                <div className="relative">
                  <MessageSquare className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="مثال: أحمد العراقي"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pr-10 h-12 bg-muted/50 border-none rounded-xl focus-visible:ring-primary/30"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-bold px-1">اسم المستخدم أو البريد</label>
              <div className="relative">
                <Mail className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pr-10 h-12 bg-muted/50 border-none rounded-xl focus-visible:ring-primary/30 text-left"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold px-1">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10 h-12 bg-muted/50 border-none rounded-xl focus-visible:ring-primary/30 text-left"
                  dir="ltr"
                />
              </div>
            </div>

            <Button 
              type="submit"
              className="w-full h-12 text-lg font-semibold purple-gradient hover:opacity-90 transition-all rounded-xl shadow-lg active:scale-[0.98]"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin ml-2 h-5 w-5" /> : (isLogin ? <LogIn className="ml-2 h-5 w-5" /> : <UserPlus className="ml-2 h-5 w-5" />)}
              {isLogin ? 'تسجيل الدخول' : 'بدء الاستخدام'}
            </Button>

            <div className="flex justify-center text-sm">
              <button 
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:underline font-bold"
              >
                {isLogin ? 'ليس لديك حساب؟ سجل الآن' : 'لديك حساب بالفعل؟ سجل دخولك'}
              </button>
            </div>
          </form>
          
          <p className="text-xs text-center text-muted-foreground px-6">
            بواسطة المطور: أبو وطن
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
