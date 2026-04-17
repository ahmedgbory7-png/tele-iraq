import { useState, useEffect } from 'react';
import { auth } from '@/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, Phone, ShieldCheck, Loader2 } from 'lucide-react';

import { IraqLogo } from '@/components/IraqLogo';

import { countryCodes } from '../constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

export function Auth() {
  const [selectedCountry, setSelectedCountry] = useState(countryCodes[0]);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const initRecaptcha = () => {
      try {
        const container = document.getElementById('recaptcha-container');
        if (!container) return;

        if (!(window as any).recaptchaVerifier) {
          (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            size: 'invisible',
            callback: () => {
              console.log('Recaptcha resolved');
            },
            'expired-callback': () => {
              console.log('Recaptcha expired');
              if ((window as any).recaptchaVerifier) {
                (window as any).recaptchaVerifier.clear();
                (window as any).recaptchaVerifier = null;
              }
              initRecaptcha();
            }
          });
        }
      } catch (err) {
        console.error('Recaptcha init error:', err);
        setError('فشل تهيئة نظام التحقق (Recaptcha). يرجى تحديث الصفحة.');
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initRecaptcha, 500);

    return () => {
      clearTimeout(timer);
      if ((window as any).recaptchaVerifier) {
        try {
          (window as any).recaptchaVerifier.clear();
        } catch (e) {
          console.warn("Error clearing Recaptcha:", e);
        }
        (window as any).recaptchaVerifier = null;
      }
    };
  }, []);

  const handleSendCode = async () => {
    if (!phoneNumber) return setError('يرجى إدخال رقم الهاتف');
    
    // Ensure recaptcha is ready
    if (!(window as any).recaptchaVerifier) {
       try {
         (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
       } catch (e) {
         return setError('فشل تهيئة نظام التحقق. يرجى تحديث الصفحة.');
       }
    }

    const fullPhoneNumber = selectedCountry.code + phoneNumber.replace(/^0+/, '');
    
    setLoading(true);
    setError('');
    try {
      const appVerifier = (window as any).recaptchaVerifier;
      const result = await signInWithPhoneNumber(auth, fullPhoneNumber, appVerifier);
      setConfirmationResult(result);
    } catch (err: any) {
      console.error('Sign in error:', err);
      
      // Handle internal error by resetting recaptcha
      if (err.code === 'auth/internal-error') {
        if ((window as any).recaptchaVerifier) {
          (window as any).recaptchaVerifier.clear();
          (window as any).recaptchaVerifier = null;
        }
        setError('حدث خطأ داخلي في نظام التحقق. يرجى المحاولة مرة أخرى أو تحديث الصفحة.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('هذا النطاق (Domain) غير مصرح به في إعدادات Firebase. يرجى إضافته في لوحة التحكم.');
      } else if (err.code === 'auth/invalid-phone-number') {
        setError('رقم الهاتف غير صحيح. تأكد من كتابته بشكل سليم.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('تم إرسال الكثير من الطلبات لهذا الرقم. يرجى المحاولة لاحقاً.');
      } else if (err.code === 'auth/billing-not-enabled') {
        setError('يجب تفعيل الدفع (Billing) في Firebase لإرسال رسائل SMS. يرجى الترقية إلى خطة Blaze أو استخدام أرقام تجريبية.');
      } else {
        setError(err.message || 'فشل إرسال الرمز. حاول مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || !confirmationResult) return;
    setLoading(true);
    setError('');
    try {
      await confirmationResult.confirm(verificationCode);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'رمز التحقق غير صحيح');
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
              {confirmationResult ? 'أدخل رمز التحقق' : 'تسجيل الدخول برقم الهاتف'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20 text-right">
              {error}
            </div>
          )}

          {!confirmationResult ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="w-1/3">
                  <Select 
                    defaultValue={selectedCountry.code} 
                    onValueChange={(val) => {
                      const country = countryCodes.find(c => c.code === val);
                      if (country) setSelectedCountry(country);
                    }}
                  >
                    <SelectTrigger className="h-12 bg-muted/50 border-none rounded-xl focus:ring-primary/30">
                      <SelectValue placeholder="الرمز" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {countryCodes.map((c) => (
                        <SelectItem key={c.code} value={c.code} className="cursor-pointer">
                          <span className="flex items-center gap-2">
                            <span>{c.flag}</span>
                            <span>{c.code}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 relative">
                  <Phone className="absolute right-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="رقم الهاتف"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="pr-10 h-12 text-lg bg-muted/50 border-none rounded-xl focus-visible:ring-primary/30 text-left"
                    dir="ltr"
                  />
                </div>
              </div>
              <Button 
                onClick={handleSendCode} 
                className="w-full h-12 text-lg font-semibold purple-gradient hover:opacity-90 transition-opacity"
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin ml-2" /> : null}
                إرسال الرمز
              </Button>

              {!confirmationResult && (
                <>
                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">أو</span>
                    </div>
                  </div>

                  <Button 
                    variant="outline" 
                    onClick={handleGoogleSignIn} 
                    className="w-full h-12 text-base font-medium border-primary/20 hover:bg-primary/5 rounded-xl gap-2 transition-all mt-2"
                    disabled={loading}
                  >
                    <div className="w-5 h-5 flex items-center justify-center">
                      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-full h-full" referrerPolicy="no-referrer" />
                    </div>
                    تسجيل الدخول عبر جوجل
                  </Button>
                  
                  <div className="text-[10px] text-center text-muted-foreground bg-primary/5 p-2 rounded-lg border border-primary/10 mt-4 leading-relaxed">
                    <p className="font-bold mb-1">تلميح للمطور:</p>
                    <p>إذا واجهت خطأ "Billing not enabled"، يرجى إضافة "أرقام هواتف للاختبار" في لوحة تحكم Firebase (Settings -{'>'} Phone numbers for testing) لتجربة الرمز مجاناً.</p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="رمز التحقق"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  className="pl-10 h-12 text-lg tracking-[0.5em] text-center"
                />
              </div>
              <Button 
                onClick={handleVerifyCode} 
                className="w-full h-12 text-lg font-semibold purple-gradient hover:opacity-90 transition-opacity"
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin mr-2" /> : null}
                تأكيد وتسجيل الدخول
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setConfirmationResult(null)} 
                className="w-full text-muted-foreground"
                disabled={loading}
              >
                تغيير رقم الهاتف
              </Button>
            </div>
          )}
          
          <p className="text-xs text-center text-muted-foreground px-6">
            بواسطة المطور: أبو وطن
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
