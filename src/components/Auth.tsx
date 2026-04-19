import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Mail, Lock, LogIn, UserPlus, ShieldCheck, Loader2 } from 'lucide-react';
import { auth, db } from '@/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup,
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
    
    // Normalize "username" to email if it's not an email
    // Remove spaces and special characters for the local part if not already an email
    const authEmail = trimmedEmail.includes('@') 
      ? trimmedEmail 
      : `${trimmedEmail.replace(/\s+/g, '').toLowerCase()}@teleiraq.app`;

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, authEmail, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName });
        
        // Create initial profile
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: displayName,
          status: 'أنا أستخدم تليعراق!',
          lastSeen: serverTimestamp(),
          nameColor: '#8b5cf6',
          reels: [],
          friends: [],
          blockedUsers: []
        });
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('خطأ في اسم المستخدم أو كلمة المرور');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('اسم المستخدم هذا مستخدم بالفعل');
      } else if (err.code === 'auth/weak-password') {
        setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      } else if (err.code === 'auth/invalid-email') {
        setError('اسم المستخدم غير صالح. يرجى استخدام أحرف وأرقام فقط.');
      } else {
        setError(err.message || 'حدث خطأ أثناء تسجيل الدخول');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Google sign in error:', err);
      if (err.code === 'auth/popup-blocked') {
        setError('تم حظر النافذة المنبثقة. يرجily السماح بالمنبثقات لهذا الموقع.');
      } else {
        setError(err.message || 'فشل تسجيل الدخول عبر جوجل');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background telegram-bg" dir="rtl">
      <div id="recaptcha-container"></div>
      
      <Card className="w-full max-w-md border-none shadow-2xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto">
            <IraqLogo className="w-20 h-20" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-3xl font-bold tracking-tight">تليعراق</CardTitle>
            <CardDescription className="text-base">
              {isLogin ? 'تسجيل الدخول إلى حسابك' : 'إنشاء حساب جديد في تليعراق'}
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

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">أو عبر جوجل</span>
              </div>
            </div>

            <Button 
              type="button"
              variant="outline" 
              onClick={handleGoogleSignIn} 
              className="w-full h-12 text-base font-medium border-primary/20 hover:bg-primary/5 rounded-xl gap-2 transition-all transition-colors"
              disabled={loading}
            >
              <div className="w-5 h-5 flex items-center justify-center">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-full h-full" referrerPolicy="no-referrer" />
              </div>
              تسجيل الدخول عبر جوجل
            </Button>
          </form>
          
          <p className="text-xs text-center text-muted-foreground px-6">
            بواسطة المطور: أبو وطن
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
