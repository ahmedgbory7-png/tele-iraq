import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { doc, updateDoc, getDoc, query, collection, where, getDocs, addDoc, serverTimestamp, orderBy, onSnapshot, deleteDoc, increment, writeBatch } from 'firebase/firestore';
import { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowRight, Camera, Check, Loader2, Lock, Plus, Trash2, Play, MessageSquare, User, BadgeCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from 'motion/react';
import { format, isToday, isYesterday } from 'date-fns';
import { ar } from 'date-fns/locale';

import { useStore } from '@/store/useStore';

export function Profile() {
  const { profile, setShowProfile, setCurrentTab, viewingProfileId, setViewingProfileId, setActiveChatId } = useStore();
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [isOtherProfileLoading, setIsOtherProfileLoading] = useState(false);

  const onClose = () => {
    setShowProfile(false);
    setViewingProfileId(null);
    setCurrentTab('chats');
  };

  useEffect(() => {
    if (viewingProfileId) {
      setIsOtherProfileLoading(true);
      getDoc(doc(db, 'users', viewingProfileId)).then(snap => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setTargetProfile(data);
          // Sync local state for display
          setDisplayName(data.displayName || '');
          setStatus(data.status || '');
          setPhotoURL(data.photoURL || '');
          setNameColor(data.nameColor || '#141414');
          setIsVerified(!!data.isVerified);
        }
        setIsOtherProfileLoading(false);
      });
    } else if (profile) {
      setTargetProfile(profile);
      setDisplayName(profile.displayName || '');
      setStatus(profile.status || '');
      setPhotoURL(profile.photoURL || '');
      setNameColor(profile.nameColor || '#141414');
      setIsVerified(!!profile.isVerified);
    }
  }, [viewingProfileId, profile]);
  
  const currentProfile = targetProfile;
  const isMe = !viewingProfileId || viewingProfileId === profile?.uid;

  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [nameColor, setNameColor] = useState('#141414');
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [isMagicUnlocked, setIsMagicUnlocked] = useState(false);
  const [isMagic2Unlocked, setIsMagic2Unlocked] = useState(false);
  const [isMagic3Unlocked, setIsMagic3Unlocked] = useState(false);
  const [isMagic4Unlocked, setIsMagic4Unlocked] = useState(false);
  const [isMagicIraqUnlocked, setIsMagicIraqUnlocked] = useState(false);
  const [remainingDaysMagic, setRemainingDaysMagic] = useState<number | null>(null);
  const [remainingDaysMagic2, setRemainingDaysMagic2] = useState<number | null>(null);
  const [remainingDaysMagic3, setRemainingDaysMagic3] = useState<number | null>(null);
  const [remainingDaysMagic4, setRemainingDaysMagic4] = useState<number | null>(null);
  const [remainingDaysMagicIraq, setRemainingDaysMagicIraq] = useState<number | null>(null);

  useEffect(() => {
    if (currentProfile?.magicUnlockedAt) {
      const unlockDate = currentProfile.magicUnlockedAt.toDate ? currentProfile.magicUnlockedAt.toDate() : new Date(currentProfile.magicUnlockedAt);
      const now = new Date();
      const diffMs = unlockDate.getTime() + (30 * 24 * 60 * 60 * 1000) - now.getTime();
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (days > 0) {
        setIsMagicUnlocked(true);
        setRemainingDaysMagic(days);
      } else {
        setIsMagicUnlocked(false);
        setRemainingDaysMagic(0);
      }
    } else {
      setIsMagicUnlocked(false);
      setRemainingDaysMagic(null);
    }

    if (currentProfile?.magic2UnlockedAt) {
      const unlockDate = currentProfile.magic2UnlockedAt.toDate ? currentProfile.magic2UnlockedAt.toDate() : new Date(currentProfile.magic2UnlockedAt);
      const now = new Date();
      const diffMs = unlockDate.getTime() + (30 * 24 * 60 * 60 * 1000) - now.getTime();
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (days > 0) {
        setIsMagic2Unlocked(true);
        setRemainingDaysMagic2(days);
      } else {
        setIsMagic2Unlocked(false);
        setRemainingDaysMagic2(0);
      }
    } else {
      setIsMagic2Unlocked(false);
      setRemainingDaysMagic2(null);
    }

    if (currentProfile?.magic3UnlockedAt) {
      const unlockDate = currentProfile.magic3UnlockedAt.toDate ? currentProfile.magic3UnlockedAt.toDate() : new Date(currentProfile.magic3UnlockedAt);
      const now = new Date();
      const diffMs = unlockDate.getTime() + (30 * 24 * 60 * 60 * 1000) - now.getTime();
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (days > 0) {
        setIsMagic3Unlocked(true);
        setRemainingDaysMagic3(days);
      } else {
        setIsMagic3Unlocked(false);
        setRemainingDaysMagic3(0);
      }
    } else {
      setIsMagic3Unlocked(false);
      setRemainingDaysMagic3(null);
    }

    if (currentProfile?.magic4UnlockedAt) {
      const unlockDate = currentProfile.magic4UnlockedAt.toDate ? currentProfile.magic4UnlockedAt.toDate() : new Date(currentProfile.magic4UnlockedAt);
      const now = new Date();
      const diffMs = unlockDate.getTime() + (30 * 24 * 60 * 60 * 1000) - now.getTime();
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (days > 0) {
        setIsMagic4Unlocked(true);
        setRemainingDaysMagic4(days);
      } else {
        setIsMagic4Unlocked(false);
        setRemainingDaysMagic4(0);
      }
    } else {
      setIsMagic4Unlocked(false);
      setRemainingDaysMagic4(null);
    }

    if (currentProfile?.magicIraqUnlockedAt) {
      const unlockDate = currentProfile.magicIraqUnlockedAt.toDate ? currentProfile.magicIraqUnlockedAt.toDate() : new Date(currentProfile.magicIraqUnlockedAt);
      const now = new Date();
      const diffMs = unlockDate.getTime() + (30 * 24 * 60 * 60 * 1000) - now.getTime();
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      
      if (days > 0) {
        setIsMagicIraqUnlocked(true);
        setRemainingDaysMagicIraq(days);
      } else {
        setIsMagicIraqUnlocked(false);
        setRemainingDaysMagicIraq(0);
      }
    } else {
      setIsMagicIraqUnlocked(false);
      setRemainingDaysMagicIraq(null);
    }
  }, [currentProfile]);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [magicCode, setMagicCode] = useState('');
  const [pendingMagicColor, setPendingMagicColor] = useState<string | null>(null);
  const [isMagicDialogOpen, setIsMagicDialogOpen] = useState(false);

  const formatLastSeen = (p: UserProfile | null) => {
    if (!p) return 'متصل منذ وقت طويل';
    
    // Privacy check
    const privacy = p.privacy?.lastSeen || 'everyone';
    if (privacy === 'nobody' && !isMe) {
      return 'آخر ظهور كان قريباً';
    }
    
    const timestamp = p.lastSeen;
    if (!timestamp) return 'متصل منذ وقت طويل';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000;

    if (diff < 60) return 'متصل الآن';
    if (isToday(date)) {
      return `آخر ظهور اليوم في ${format(date, 'hh:mm a', { locale: ar })}`;
    }
    if (isYesterday(date)) {
      return `آخر ظهور أمس في ${format(date, 'hh:mm a', { locale: ar })}`;
    }
    return `آخر ظهور بتاريخ ${format(date, 'yyyy/MM/dd')}`;
  };

  if (isOtherProfileLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentProfile) return null;

  const colors = [
    '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', 
    '#10b981', '#3b82f6', '#6366f1', '#141414',
    '#f43f5e', '#a855f7', '#06b6d4', '#84cc16',
    '#eab308', '#f97316', '#d946ef', '#1d4ed8'
  ];

  const propagateProfileUpdate = async (userData: Partial<UserProfile>) => {
    if (!profile?.uid) return;
    try {
      const batch = writeBatch(db);
      const chatsQ = query(collection(db, 'chats'), where('participants', 'array-contains', profile.uid));
      const chatsSnap = await getDocs(chatsQ);
      
      const isVerifiedStatus = userData.isVerified !== undefined ? userData.isVerified : (isVerified || false);

      chatsSnap.docs.forEach(d => {
        batch.update(d.ref, {
          [`participantProfiles.${profile.uid}`]: {
            displayName: userData.displayName || displayName || profile.displayName || 'مستخدم',
            photoURL: userData.photoURL || photoURL || profile.photoURL || '',
            nameColor: userData.nameColor || nameColor || profile.nameColor || '',
            isVerified: isVerifiedStatus,
            phoneNumber: profile.phoneNumber || ''
          }
        });
      });

      await batch.commit();
    } catch (err) {
      console.error("Error propagating profile update:", err);
    }
  };

  const handleColorClick = (color: string) => {
    setNameColor(color);
    // Auto-save color change if we have the profile
    if (profile?.uid) {
      updateDoc(doc(db, 'users', profile.uid), { nameColor: color })
        .then(() => propagateProfileUpdate({ nameColor: color }))
        .catch(err => console.error("Auto-save color error:", err));
    }
  };

  const handleMagicColorClick = (color: string, isUnlocked: boolean) => {
    // Show preview immediately for visual feedback
    setNameColor(color);
    
    if (isUnlocked) {
      handleColorClick(color);
    } else {
      setPendingMagicColor(color);
      setIsMagicDialogOpen(true);
    }
  };

  const handleUnlockCode = async () => {
    const code = magicCode.trim().toUpperCase();
    if (code === '0099') {
      try {
        setLoading(true);
        let newColor = pendingMagicColor || 'magic';

        await updateDoc(doc(db, 'users', profile.uid), {
          magicUnlockedAt: serverTimestamp(),
          magic2UnlockedAt: serverTimestamp(),
          magic3UnlockedAt: serverTimestamp(),
          magic4UnlockedAt: serverTimestamp(),
          magicIraqUnlockedAt: serverTimestamp(),
          nameColor: newColor
        });
        await propagateProfileUpdate({ nameColor: newColor });
        setIsMagicUnlocked(true);
        setIsMagic2Unlocked(true);
        setIsMagic3Unlocked(true);
        setIsMagic4Unlocked(true);
        setIsMagicIraqUnlocked(true);
        setNameColor(newColor);
        setIsMagicDialogOpen(false);
        setSaved(true);
        setMagicCode('');
        setPendingMagicColor(null);
        alert('✨ تم تفعيل الميزات المميزة واللون السحري بنجاح!');
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        console.error(err);
        alert('فشل تفعيل الميزات المميزة. تأكد من اتصال الإنترنت.');
      } finally {
        setLoading(false);
      }
    } else if (code === '500') {
      try {
        setLoading(true);
        await updateDoc(doc(db, 'users', profile.uid), {
          isVerified: true,
          verifiedAt: serverTimestamp()
        });
        setIsVerified(true);
        await propagateProfileUpdate({ isVerified: true });
        setIsMagicDialogOpen(false);
        setMagicCode('');
        alert('✔️ تم توثيق حسابك بنجاح! تظهر الآن علامة التوثيق الزرقاء بجانب اسمك.');
      } catch (err) {
        console.error(err);
        alert('فشل توثيق الحساب.');
      } finally {
        setLoading(false);
      }
    } else {
      alert('الكود غير صحيح! يرجى التأكد من الكود والمحاولة مرة أخرى.');
    }
  };

  const handleSave = async () => {
    if (!profile?.uid) {
      alert('يجب تسجيل الدخول أولاً لإجراء التغييرات.');
      return;
    }
    setLoading(true);
    try {
      // Ensure we don't accidentally lose verification status
      const currentVerifiedStatus = isVerified || !!profile.isVerified;
      
      const updatedData = {
        displayName: displayName.trim() || profile.displayName || 'مستخدم تليعراق',
        status: status.trim() || profile.status || 'أنا أستخدم تليعراق!',
        photoURL,
        nameColor,
        isVerified: currentVerifiedStatus
      };
      
      await updateDoc(doc(db, 'users', profile.uid), updatedData);
      setIsVerified(currentVerifiedStatus); // Sync local state
      await propagateProfileUpdate(updatedData);
      setSaved(true);
      alert('✅ تم حفظ التغييرات في ملفك الشخصي بنجاح!');
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('too large')) {
        alert('❌ حجم الصورة كبير جداً. يرجى اختيار صورة بحجم أقل من 1 ميجابايت.');
      } else {
        alert('❌ فشل في حفظ التغييرات. يرجى التأكد من اتصال الإنترنت.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 1MB is the strict Firestore limit for the entire document
      if (file.size > 950 * 1024) {
        alert('الملف كبير جداً. الحد الأقصى للجودة العالية هو 1 ميجابايت لضمان المزامنة.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        // No resizing for 8K quality, storing raw base64
        setPhotoURL(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden" dir="rtl">
      {/* Immersive Header (Telegram Style) */}
      <div className="relative h-80 shrink-0 overflow-hidden">
        <div className="absolute inset-0 bg-zinc-950">
          <img 
            src={photoURL || 'https://picsum.photos/seed/profile/1080/1920'} 
            className="w-full h-full object-cover opacity-60 blur-[2px]" 
            alt="Profile Background"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/30" />
        </div>
        
        <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between z-10 text-white safe-top">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-white/10 ios-touch">
            <ArrowRight className="h-6 w-6" />
          </Button>
          <div className="flex gap-2">
            {isMe && (
              <>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10 ios-touch" onClick={() => document.getElementById('avatar-upload')?.click()}>
                  <Camera className="h-5 w-5" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10 ios-touch" onClick={handleSave}>
                  {loading ? <Loader2 className="animate-spin h-5 w-5" /> : <Check className={`h-5 w-5 ${saved ? 'text-green-500' : ''}`} />}
                </Button>
              </>
            )}
            {!isMe && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-full hover:bg-white/10 bg-white/20 backdrop-blur-md ios-touch"
                onClick={async () => {
                  // Find or create chat logic
                  if(!profile?.uid || !currentProfile?.uid) return;
                  const targetUid = currentProfile.uid;
                  // Simplified: we'll just try to open or let user find them in list
                  // Actually let's just trigger active chat if we can
                  const q = query(
                    collection(db, 'chats'),
                    where('participants', 'array-contains', profile.uid)
                  );
                  const snap = await getDocs(q);
                  const chat = snap.docs.find(d => {
                    const data = d.data() as any;
                    return Array.isArray(data?.participants) && data.participants.includes(targetUid);
                  });
                  if(chat) {
                    setActiveChatId(chat.id);
                    setViewingProfileId(null);
                  } else {
                    // Create chat then open
                    const newChat = {
                      participants: [profile.uid, targetUid],
                      updatedAt: serverTimestamp(),
                      lastMessage: {
                        text: 'بدأت محادثة جديدة',
                        senderId: profile.uid,
                        createdAt: serverTimestamp()
                      }
                    };
                    const docRef = await addDoc(collection(db, 'chats'), newChat);
                    setActiveChatId(docRef.id);
                    setViewingProfileId(null);
                  }
                }}
              >
                <MessageSquare className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        <div className="absolute bottom-6 inset-x-6 flex flex-col items-center text-white text-center">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-1"
          >
            <h1 className={`text-3xl font-bold tracking-tight flex items-center gap-1.5 ${
              nameColor === 'magic' ? 'magic-color-text' : 
              nameColor === 'magic_neon' ? 'magic-neon-orange-text' : 
              nameColor === 'magic_rb' ? 'magic-red-blue-text' : 
              nameColor === 'magic_pb' ? 'magic-pink-black-text' : 
              nameColor === 'magic_iraq' ? 'magic-iraq-text' : ''
            }`} style={{ color: (nameColor === 'magic' || nameColor === 'magic_neon' || nameColor === 'magic_rb' || nameColor === 'magic_pb' || nameColor === 'magic_iraq') ? undefined : nameColor === '#141414' ? 'white' : nameColor }}>
              {displayName || 'مستخدم جديد'}
              {isVerified ? (
                <BadgeCheck className="w-6 h-6 text-blue-500 fill-blue-500/10" />
              ) : isMe && (
                <BadgeCheck 
                  className="w-6 h-6 text-white/30 cursor-pointer hover:text-white/50 transition-colors" 
                  onClick={() => setIsMagicDialogOpen(true)}
                />
              )}
            </h1>
            <p className="text-white/60 text-sm font-medium">{formatLastSeen(currentProfile)}</p>
          </motion.div>
        </div>
        
        <input 
          id="avatar-upload"
          type="file" 
          className="hidden" 
          accept="image/*" 
          onChange={handleFileChange} 
        />
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        <section className="bg-card">
          <div className="p-6 space-y-8 flex flex-col items-center text-center">
            <div className="w-full max-w-sm space-y-6">
              <div className="flex flex-col items-center gap-2 border-b border-border/40 pb-6 w-full">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">رقم الهاتف</span>
                <span className="text-lg font-bold text-primary">{currentProfile.phoneNumber}</span>
              </div>

              <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">الاسم المستعار</label>
                {isMe ? (
                  <div className="flex items-center gap-2 w-full justify-center">
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="أدخل اسمك..."
                      className="h-12 bg-muted/20 border-border/40 rounded-2xl text-center font-bold text-lg flex-1"
                    />
                    {isVerified ? (
                      <BadgeCheck className="w-6 h-6 text-blue-500 fill-blue-500/20 shrink-0" />
                    ) : (
                      <BadgeCheck 
                        className="w-6 h-6 text-muted-foreground/30 cursor-pointer hover:text-muted-foreground/50 transition-colors shrink-0" 
                        onClick={() => setIsMagicDialogOpen(true)}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5">
                    <p className={`text-xl font-bold ${
                      (currentProfile.nameColor === 'magic' || currentProfile.nameColor === 'magic_neon' || currentProfile.nameColor === 'magic_rb' || currentProfile.nameColor === 'magic_pb' || currentProfile.nameColor === 'magic_iraq') 
                        ? (
                            currentProfile.nameColor === 'magic' ? 'magic-color-text' : 
                            currentProfile.nameColor === 'magic_neon' ? 'magic-neon-orange-text' : 
                            currentProfile.nameColor === 'magic_rb' ? 'magic-red-blue-text' : 
                            currentProfile.nameColor === 'magic_pb' ? 'magic-pink-black-text' : 'magic-iraq-text'
                          ) 
                        : ''
                    }`} style={{ color: (currentProfile.nameColor === 'magic' || currentProfile.nameColor === 'magic_neon' || currentProfile.nameColor === 'magic_rb' || currentProfile.nameColor === 'magic_pb' || currentProfile.nameColor === 'magic_iraq') ? undefined : (currentProfile.nameColor || 'inherit') }}>
                      {currentProfile.displayName}
                    </p>
                    {currentProfile.isVerified && <BadgeCheck className="w-5 h-5 text-blue-500" />}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">النبذة التعريفية</label>
                {isMe ? (
                  <Input
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    placeholder="اكتب شيئاً عنك..."
                    className="h-12 bg-muted/20 border-border/40 rounded-2xl text-center font-medium"
                  />
                ) : (
                  <p className="font-medium text-muted-foreground text-center text-sm px-4">{currentProfile.status}</p>
                )}
              </div>

              <div className="flex flex-col items-center gap-4 border-b border-border/40 pb-6 w-full">
                <div 
                  className="flex flex-col items-center gap-2 cursor-pointer w-full"
                  onClick={() => isMe && setShowColorPicker(!showColorPicker)}
                >
                  <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">لون الاسم</label>
                  <div className="flex items-center gap-3 bg-muted/30 px-6 py-3 rounded-2xl border border-border/20 shadow-sm transition-all hover:bg-muted/50">
                    <div 
                      className={`w-8 h-8 rounded-full border-2 border-white/20 shadow-inner ${
                        nameColor === 'magic' ? 'magic-color-bg' : 
                        nameColor === 'magic_neon' ? 'magic-neon-orange-bg' : 
                        nameColor === 'magic_rb' ? 'magic-red-blue-bg' : 
                        nameColor === 'magic_pb' ? 'magic-pink-black-bg' : 
                        nameColor === 'magic_iraq' ? 'magic-iraq-bg' : ''
                      }`} 
                      style={{ backgroundColor: (nameColor === 'magic' || nameColor === 'magic_neon' || nameColor === 'magic_rb' || nameColor === 'magic_pb' || nameColor === 'magic_iraq') ? undefined : nameColor }}
                    />
                    <span className={`font-black text-base drop-shadow-sm ${
                      nameColor === 'magic' ? 'magic-color-text' : 
                      nameColor === 'magic_neon' ? 'magic-neon-orange-text' : 
                      nameColor === 'magic_rb' ? 'magic-red-blue-text' : 
                      nameColor === 'magic_pb' ? 'magic-pink-black-text' : 
                      nameColor === 'magic_iraq' ? 'magic-iraq-text' : ''
                    }`} style={{ color: (nameColor === 'magic' || nameColor === 'magic_neon' || nameColor === 'magic_rb' || nameColor === 'magic_pb' || nameColor === 'magic_iraq') ? undefined : nameColor }}>
                      {nameColor === 'magic' ? 'سحري (RGB)' : 
                       nameColor === 'magic_neon' ? 'سحري (فسفوري)' : 
                       nameColor === 'magic_rb' ? 'سحري (أحمر وأزرق)' : 
                       nameColor === 'magic_pb' ? 'سحري (وردي وأسود)' : 
                       nameColor === 'magic_iraq' ? 'سحري (عـلم العراق)' : 'لون مخصص'}
                    </span>
                    {isMe && (
                      <motion.div animate={{ rotate: showColorPicker ? 180 : 0 }}>
                        <ArrowRight className="h-4 w-4 text-primary rotate-90" />
                      </motion.div>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                  {isMe && showColorPicker && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0, y: -20 }}
                      animate={{ height: 'auto', opacity: 1, y: 0 }}
                      exit={{ height: 0, opacity: 0, y: -20 }}
                      className="overflow-hidden space-y-6 pt-4 w-full"
                    >
                      <div className="flex flex-wrap gap-3 justify-center">
                        {colors.map(color => (
                          <button
                            key={color}
                            onClick={() => handleColorClick(color)}
                            className={`w-10 h-10 rounded-full border-4 transition-all hover:scale-110 active:scale-90 shadow-sm ${nameColor === color ? 'border-primary ring-4 ring-primary/20 shadow-lg scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 justify-center mt-6">
                        <button
                          onClick={() => handleMagicColorClick('magic', isMagicUnlocked)}
                          className={`group relative w-full h-14 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-[1.02] active:scale-[0.98] ${nameColor === 'magic' ? 'border-primary ring-4 ring-primary/20 shadow-xl' : 'border-dashed border-muted-foreground/30'}`}
                        >
                          <div className={`absolute inset-0 magic-color-bg opacity-40 ${!isMagicUnlocked ? 'grayscale blur-[1px]' : ''}`} />
                          {isMagicUnlocked ? (
                            <>
                              <span className="relative text-xs font-black text-primary dark:text-white z-10 drop-shadow-md">سحري (RGB)</span>
                              {remainingDaysMagic !== null && (
                                <span className="relative text-[10px] font-bold text-muted-foreground z-10 tracking-wider">{remainingDaysMagic} يوم متبقي</span>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-2 relative z-10">
                              <Lock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-bold text-muted-foreground">سحري (RGB)</span>
                            </div>
                          )}
                        </button>

                        <button
                          onClick={() => handleMagicColorClick('magic_neon', isMagic2Unlocked)}
                          className={`group relative w-full h-14 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-[1.02] active:scale-[0.98] ${nameColor === 'magic_neon' ? 'border-primary ring-4 ring-primary/20 shadow-xl' : 'border-dashed border-muted-foreground/30'}`}
                        >
                          <div className={`absolute inset-0 magic-neon-orange-bg opacity-40 ${!isMagic2Unlocked ? 'grayscale blur-[1px]' : ''}`} />
                          {isMagic2Unlocked ? (
                            <>
                              <span className="relative text-xs font-black text-primary dark:text-white z-10 drop-shadow-md">سحري (فسفوري)</span>
                              {remainingDaysMagic2 !== null && (
                                <span className="relative text-[10px] font-bold text-muted-foreground z-10 tracking-wider">{remainingDaysMagic2} يوم متبقي</span>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-2 relative z-10">
                              <Lock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-bold text-muted-foreground">سحري (فسفوري)</span>
                            </div>
                          )}
                        </button>

                        <button
                          onClick={() => handleMagicColorClick('magic_rb', isMagic3Unlocked)}
                          className={`group relative w-full h-14 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-[1.02] active:scale-[0.98] ${nameColor === 'magic_rb' ? 'border-primary ring-4 ring-primary/20 shadow-xl' : 'border-dashed border-muted-foreground/30'}`}
                        >
                          <div className={`absolute inset-0 magic-red-blue-bg opacity-40 ${!isMagic3Unlocked ? 'grayscale blur-[1px]' : ''}`} />
                          {isMagic3Unlocked ? (
                            <>
                              <span className="relative text-xs font-black text-primary dark:text-white z-10 drop-shadow-md">سحري (أحمر وأزرق)</span>
                              {remainingDaysMagic3 !== null && (
                                <span className="relative text-[10px] font-bold text-muted-foreground z-10 tracking-wider">{remainingDaysMagic3} يوم متبقي</span>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-2 relative z-10">
                              <Lock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-bold text-muted-foreground">سحري (أحمر وأزرق)</span>
                            </div>
                          )}
                        </button>

                        <button
                          onClick={() => handleMagicColorClick('magic_pb', isMagic4Unlocked)}
                          className={`group relative w-full h-14 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-[1.02] active:scale-[0.98] ${nameColor === 'magic_pb' ? 'border-primary ring-4 ring-primary/20 shadow-xl' : 'border-dashed border-muted-foreground/30'}`}
                        >
                          <div className={`absolute inset-0 magic-pink-black-bg opacity-40 ${!isMagic4Unlocked ? 'grayscale blur-[1px]' : ''}`} />
                          {isMagic4Unlocked ? (
                            <>
                              <span className="relative text-xs font-black text-primary dark:text-white z-10 drop-shadow-md">سحري (وردي وأسود)</span>
                              {remainingDaysMagic4 !== null && (
                                <span className="relative text-[10px] font-bold text-muted-foreground z-10 tracking-wider">{remainingDaysMagic4} يوم متبقي</span>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-2 relative z-10">
                              <Lock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-bold text-muted-foreground">سحري (وردي وأسود)</span>
                            </div>
                          )}
                        </button>

                        <button
                          onClick={() => handleMagicColorClick('magic_iraq', isMagicIraqUnlocked)}
                          className={`group relative w-full h-14 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-[1.02] active:scale-[0.98] ${nameColor === 'magic_iraq' ? 'border-primary ring-4 ring-primary/20 shadow-xl' : 'border-dashed border-muted-foreground/30'}`}
                        >
                          <div className={`absolute inset-0 magic-iraq-bg opacity-40 ${!isMagicIraqUnlocked ? 'grayscale blur-[1px]' : ''}`} />
                          {isMagicIraqUnlocked ? (
                            <>
                              <span className="relative text-xs font-black text-primary dark:text-white z-10 drop-shadow-md">سحري (ألوان علم العراق)</span>
                              {remainingDaysMagicIraq !== null && (
                                <span className="relative text-[10px] font-bold text-muted-foreground z-10 tracking-wider">{remainingDaysMagicIraq} يوم متبقي</span>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-2 relative z-10">
                              <Lock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs font-bold text-muted-foreground">سحري (ألوان علم العراق)</span>
                            </div>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </section>
        
        <div className="p-6 flex flex-col gap-6 max-w-sm mx-auto">
          {isMe ? (
            <>
              <Button 
                onClick={handleSave} 
                className={`w-full h-16 text-xl font-black rounded-2xl transition-all shadow-2xl active:scale-[0.95] ${saved ? 'bg-green-500 hover:bg-green-600' : 'purple-gradient'}`}
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin ml-2 h-6 w-6" /> : saved ? <Check className="ml-2 h-6 w-6" /> : null}
                {saved ? 'تم الحفظ بنجاح' : 'حفظ المعلومات كاملة'}
              </Button>
              
              <div className="bg-primary/10 p-6 rounded-3xl border-2 border-dashed border-primary/30 flex flex-col items-center gap-3">
                <p className="text-[12px] font-black text-primary text-center leading-relaxed">لشراء الألوان السحرية المميزة وتفعيل الحساب الكامل التواصل عبر الواتساب</p>
                <div className="flex items-center gap-2 bg-primary/20 px-4 py-2 rounded-xl border border-primary/30">
                  <span className="text-lg font-black text-primary">07745121483</span>
                  <span className="text-sm font-bold opacity-70">أبو وطن</span>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-primary/5 p-6 rounded-3xl border border-primary/10">
               <p className="text-center text-base font-bold text-primary">أنت تشاهد الملف الشخصي لـ {currentProfile.displayName}</p>
            </div>
          )}
        </div>
      </div>

      {/* Magic Dialog */}
      <Dialog open={isMagicDialogOpen} onOpenChange={setIsMagicDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفعيل الميزات المميزة 🌈✨</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground text-right italic font-bold">بواسطة المطور: أبو وطن</p>
            <p className="text-sm text-foreground text-right font-medium">أدخل كود التفعيل لفتح الألوان السحرية والمتحركة لمدة شهر واحد.</p>
            <Input 
              placeholder="أدخل الكود هنا..." 
              value={magicCode}
              onChange={(e) => setMagicCode(e.target.value)}
              className="text-center font-mono tracking-widest h-12 text-lg focus-visible:ring-primary"
            />
          </div>
          <DialogFooter className="flex flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setIsMagicDialogOpen(false)} className="flex-1 sm:flex-none h-12 rounded-xl">إلغاء</Button>
            <Button onClick={handleUnlockCode} className="flex-1 sm:flex-none h-12 rounded-xl purple-gradient">تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
