import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { doc, updateDoc, getDoc, query, collection, where, getDocs, addDoc, serverTimestamp, orderBy, onSnapshot, deleteDoc, increment } from 'firebase/firestore';
import { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowRight, Camera, Check, Loader2, Lock, Plus, Trash2, Play, MessageSquare, User } from 'lucide-react';
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
        }
        setIsOtherProfileLoading(false);
      });
    } else if (profile) {
      setTargetProfile(profile);
      setDisplayName(profile.displayName || '');
      setStatus(profile.status || '');
      setPhotoURL(profile.photoURL || '');
      setNameColor(profile.nameColor || '#141414');
    }
  }, [viewingProfileId, profile]);
  
  const currentProfile = targetProfile;
  const isMe = !viewingProfileId || viewingProfileId === profile?.uid;

  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [nameColor, setNameColor] = useState('#141414');
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
  const [isReelsOpen, setIsReelsOpen] = useState(false);
  const [reelCaption, setReelCaption] = useState('');
  const [reelUrl, setReelUrl] = useState('');
  const [uploadingReel, setUploadingReel] = useState(false);
  const [isMagicDialogOpen, setIsMagicDialogOpen] = useState(false);

  const [userReels, setUserReels] = useState<any[]>([]);

  useEffect(() => {
    const uid = viewingProfileId || profile?.uid;
    if (!uid) return;

    const q = query(
      collection(db, 'users', uid, 'userReels'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snap) => {
      setUserReels(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubscribe();
  }, [viewingProfileId, profile?.uid]);

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

  const handleColorClick = (color: string) => {
    setNameColor(color);
    // Auto-save color change if we have the profile
    if (profile?.uid) {
      updateDoc(doc(db, 'users', profile.uid), { nameColor: color })
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
      const updatedData = {
        displayName: displayName.trim() || profile.displayName || 'مستخدم تليعراق',
        status: status.trim() || profile.status || 'أنا أستخدم تليعراق!',
        photoURL,
        nameColor
      };
      
      await updateDoc(doc(db, 'users', profile.uid), updatedData);
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
      if (file.size > 800 * 1024) {
        alert('حجم الصورة كبير جداً. يرجى اختيار صورة أقل من 800 كيلوبايت.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDimension = 500; // Reduced from 600

          if (width > height) {
            if (width > maxDimension) {
              height *= maxDimension / width;
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width *= maxDimension / height;
              height = maxDimension;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          setPhotoURL(canvas.toDataURL('image/jpeg', 0.6)); // Reduced quality
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limit base64 storage to ~800KB final string size
    if (file.size > 800 * 1024) {
      alert('حجم الملف كبير جداً. يرجى اختيار فيديو أو صورة أقل من 800 كيلوبايت لضمان النشر بنجاح.');
      return;
    }

    setUploadingReel(true);
    const isVideo = file.type.startsWith('video/');
    const reader = new FileReader();

    reader.onload = async (event) => {
      const result = event.target?.result as string;
      
      if (!isVideo) {
        // Resize image
        const img = new Image();
        img.src = result;
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 800; // Reduced from 1080
          if (width > height) {
            if (width > maxDim) { height *= maxDim / width; width = maxDim; }
          } else {
            if (height > maxDim) { width *= maxDim / height; height = maxDim; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          setReelUrl(canvas.toDataURL('image/jpeg', 0.5)); // Reduced quality
        };
      } else {
        setReelUrl(result);
      }
      setUploadingReel(false);
    };
    reader.readAsDataURL(file);
  };

  const handleAddReel = async () => {
    if (!reelUrl) return;
    
    // Safety check for Firestore document size limit (1MB)
    if (reelUrl.length > 900 * 1024) {
      alert('الملف كبير جداً ليتم حفظه في قاعدة البيانات. يرجى اختيار ملف أصغر.');
      setUploadingReel(false);
      return;
    }

    setUploadingReel(true);
    try {
      const reelData = {
        url: reelUrl.trim(),
        caption: reelCaption.trim(),
        createdAt: serverTimestamp(),
        userId: profile.uid
      };
      
      await addDoc(collection(db, 'users', profile.uid, 'userReels'), reelData);
      
      await updateDoc(doc(db, 'users', profile.uid), {
        reelsCount: increment(1),
        lastReelAt: serverTimestamp()
      });
      
      setReelUrl('');
      setReelCaption('');
      setIsReelsOpen(false);
    } catch (err) {
      console.error(err);
      alert('فشل إضافة الريلز');
    } finally {
      setUploadingReel(false);
    }
  };

  const handleDeleteReel = async (reelId: string) => {
    if (!profile?.uid) return;
    if (!window.confirm('هل أنت متأكد من حذف هذا الريلز؟')) return;
    try {
      await deleteDoc(doc(db, 'users', profile.uid, 'userReels', reelId));
      await updateDoc(doc(db, 'users', profile.uid), {
        reelsCount: increment(-1)
      });
    } catch (err) {
      console.error(err);
      alert('فشل حذف الريلز');
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
                  const chat = snap.docs.find(d => (d.data() as any).participants.includes(targetUid));
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

        <div className="absolute bottom-6 inset-x-6 flex flex-col items-start text-white">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col gap-1"
          >
            <h1 className={`text-3xl font-bold tracking-tight ${
              nameColor === 'magic' ? 'magic-color-text' : 
              nameColor === 'magic_neon' ? 'magic-neon-orange-text' : 
              nameColor === 'magic_rb' ? 'magic-red-blue-text' : 
              nameColor === 'magic_pb' ? 'magic-pink-black-text' : 
              nameColor === 'magic_iraq' ? 'magic-iraq-text' : ''
            }`} style={{ color: (nameColor === 'magic' || nameColor === 'magic_neon' || nameColor === 'magic_rb' || nameColor === 'magic_pb' || nameColor === 'magic_iraq') ? undefined : nameColor === '#141414' ? 'white' : nameColor }}>
              {displayName || 'مستخدم جديد'}
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

      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="info" className="w-full">
          <TabsList className="w-full h-12 bg-card border-b rounded-none p-0 flex sticky top-0 z-20 shadow-sm">
            <TabsTrigger value="info" className="flex-1 h-full rounded-none data-[state=active]:bg-primary/5 data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all font-bold">الحساب</TabsTrigger>
            <TabsTrigger value="reels" className="flex-1 h-full rounded-none data-[state=active]:bg-primary/5 data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all font-bold">الوسائط والمقاطع</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-0 outline-none pb-20">
            <section className="bg-card border-y">
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between group cursor-pointer border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-col flex-1">
                    <span className="text-sm font-semibold">{currentProfile.phoneNumber}</span>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">رقم الهاتف</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-b pb-4">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">الاسم المستعار</label>
                  {isMe ? (
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="أدخل اسمك..."
                      className="h-10 bg-muted/20 border-border/40 rounded-xl text-right font-medium"
                    />
                  ) : (
                    <p className={`font-bold ${
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
                  )}
                </div>

                <div className="flex flex-col gap-2 border-b pb-4">
                  <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">النبذة التعريفية</label>
                  {isMe ? (
                    <Input
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      placeholder="اكتب شيئاً عنك..."
                      className="h-10 bg-muted/20 border-border/40 rounded-xl text-right font-medium"
                    />
                  ) : (
                    <p className="font-medium text-muted-foreground">{currentProfile.status}</p>
                  )}
                </div>

                <div className="flex flex-col gap-2 border-b pb-4">
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => isMe && setShowColorPicker(!showColorPicker)}
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">لون الاسم</span>
                      <div className="flex items-center gap-2">
                        <div 
                          className={`w-6 h-6 rounded-full border border-white/20 ${
                            nameColor === 'magic' ? 'magic-color-bg' : 
                            nameColor === 'magic_neon' ? 'magic-neon-orange-bg' : 
                            nameColor === 'magic_rb' ? 'magic-red-blue-bg' : 
                            nameColor === 'magic_pb' ? 'magic-pink-black-bg' : 
                            nameColor === 'magic_iraq' ? 'magic-iraq-bg' : ''
                          }`} 
                          style={{ backgroundColor: (nameColor === 'magic' || nameColor === 'magic_neon' || nameColor === 'magic_rb' || nameColor === 'magic_pb' || nameColor === 'magic_iraq') ? undefined : nameColor }}
                        />
                        <span className={`font-bold text-sm ${
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
                      </div>
                    </div>
                    {isMe && (
                      <motion.div animate={{ rotate: showColorPicker ? 180 : 0 }}>
                        <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90" />
                      </motion.div>
                    )}
                  </div>

                  <AnimatePresence>
                    {isMe && showColorPicker && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-4 pt-4"
                      >
                        <div className="flex flex-wrap gap-2 justify-start">
                          {colors.map(color => (
                            <button
                              key={color}
                              onClick={() => handleColorClick(color)}
                              className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-90 ${nameColor === color ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-transparent'}`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>

                        <div className="flex flex-wrap gap-2 justify-start mt-4">
                          <button
                            onClick={() => handleMagicColorClick('magic', isMagicUnlocked)}
                            className={`group relative w-32 h-12 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-105 active:scale-95 ${nameColor === 'magic' ? 'border-primary ring-4 ring-primary/20 shadow-lg' : 'border-dashed border-muted-foreground/30'}`}
                          >
                            <div className={`absolute inset-0 magic-color-bg opacity-40 ${!isMagicUnlocked ? 'grayscale blur-[1px]' : ''}`} />
                            {isMagicUnlocked ? (
                              <>
                                <span className="relative text-[10px] font-bold text-primary dark:text-white z-10 drop-shadow-sm">سحري (RGB)</span>
                                {remainingDaysMagic !== null && (
                                  <span className="relative text-[8px] font-bold text-muted-foreground z-10">{remainingDaysMagic} يوم</span>
                                )}
                              </>
                            ) : (
                              <Lock className="relative h-4 w-4 text-muted-foreground z-10" />
                            )}
                          </button>

                          <button
                            onClick={() => handleMagicColorClick('magic_neon', isMagic2Unlocked)}
                            className={`group relative w-32 h-12 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-105 active:scale-95 ${nameColor === 'magic_neon' ? 'border-primary ring-4 ring-primary/20 shadow-lg' : 'border-dashed border-muted-foreground/30'}`}
                          >
                            <div className={`absolute inset-0 magic-neon-orange-bg opacity-40 ${!isMagic2Unlocked ? 'grayscale blur-[1px]' : ''}`} />
                            {isMagic2Unlocked ? (
                              <>
                                <span className="relative text-[10px] font-bold text-primary dark:text-white z-10 drop-shadow-sm">سحري (فسفوري)</span>
                                {remainingDaysMagic2 !== null && (
                                  <span className="relative text-[8px] font-bold text-muted-foreground z-10">{remainingDaysMagic2} يوم</span>
                                )}
                              </>
                            ) : (
                              <Lock className="relative h-4 w-4 text-muted-foreground z-10" />
                            )}
                          </button>

                          <button
                            onClick={() => handleMagicColorClick('magic_rb', isMagic3Unlocked)}
                            className={`group relative w-32 h-12 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-105 active:scale-95 ${nameColor === 'magic_rb' ? 'border-primary ring-4 ring-primary/20 shadow-lg' : 'border-dashed border-muted-foreground/30'}`}
                          >
                            <div className={`absolute inset-0 magic-red-blue-bg opacity-40 ${!isMagic3Unlocked ? 'grayscale blur-[1px]' : ''}`} />
                            {isMagic3Unlocked ? (
                              <>
                                <span className="relative text-[10px] font-bold text-primary dark:text-white z-10 drop-shadow-sm">سحري (أحمر وأزرق)</span>
                                {remainingDaysMagic3 !== null && (
                                  <span className="relative text-[8px] font-bold text-muted-foreground z-10">{remainingDaysMagic3} يوم</span>
                                )}
                              </>
                            ) : (
                              <Lock className="relative h-4 w-4 text-muted-foreground z-10" />
                            )}
                          </button>

                          <button
                            onClick={() => handleMagicColorClick('magic_pb', isMagic4Unlocked)}
                            className={`group relative w-32 h-12 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-105 active:scale-95 ${nameColor === 'magic_pb' ? 'border-primary ring-4 ring-primary/20 shadow-lg' : 'border-dashed border-muted-foreground/30'}`}
                          >
                            <div className={`absolute inset-0 magic-pink-black-bg opacity-40 ${!isMagic4Unlocked ? 'grayscale blur-[1px]' : ''}`} />
                            {isMagic4Unlocked ? (
                              <>
                                <span className="relative text-[10px] font-bold text-primary dark:text-white z-10 drop-shadow-sm">سحري (وردي وأسود)</span>
                                {remainingDaysMagic4 !== null && (
                                  <span className="relative text-[8px] font-bold text-muted-foreground z-10">{remainingDaysMagic4} يوم</span>
                                )}
                              </>
                            ) : (
                              <Lock className="relative h-4 w-4 text-muted-foreground z-10" />
                            )}
                          </button>

                          <button
                            onClick={() => handleMagicColorClick('magic_iraq', isMagicIraqUnlocked)}
                            className={`group relative w-32 h-12 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-105 active:scale-95 ${nameColor === 'magic_iraq' ? 'border-primary ring-4 ring-primary/20 shadow-lg' : 'border-dashed border-muted-foreground/30'}`}
                          >
                            <div className={`absolute inset-0 magic-iraq-bg opacity-40 ${!isMagicIraqUnlocked ? 'grayscale blur-[1px]' : ''}`} />
                            {isMagicIraqUnlocked ? (
                              <>
                                <span className="relative text-[10px] font-bold text-primary dark:text-white z-10 drop-shadow-sm">سحري (علم العراق)</span>
                                {remainingDaysMagicIraq !== null && (
                                  <span className="relative text-[8px] font-bold text-muted-foreground z-10">{remainingDaysMagicIraq} يوم</span>
                                )}
                              </>
                            ) : (
                              <Lock className="relative h-4 w-4 text-muted-foreground z-10" />
                            )}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </section>
            
            <div className="p-4 flex flex-col gap-4">
              {isMe ? (
                <>
                  <p className="text-[10px] text-muted-foreground text-center font-medium">سيتمكن الآخرون من رؤية معلوماتك ولون اسمك المميز في المحادثات.</p>
                  <Button 
                    onClick={handleSave} 
                    className={`w-full h-14 text-lg font-bold rounded-2xl transition-all shadow-xl active:scale-[0.98] ${saved ? 'bg-green-500 hover:bg-green-600' : 'purple-gradient'}`}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="animate-spin ml-2 h-5 w-5" /> : saved ? <Check className="ml-2 h-5 w-5" /> : null}
                    {saved ? 'تم حفظ ملفك الشخصي' : 'حفظ المعلومات كاملة'}
                  </Button>
                  
                  <div className="bg-muted/50 p-4 rounded-2xl border border-dashed border-primary/20 mt-2">
                    <p className="text-[11px] font-bold text-primary text-center mb-1">- لشراء الالوان المتحركة التواصل عبر الواتساب -</p>
                    <p className="text-[12px] font-bold text-foreground text-center">07745121483 ابو وطن</p>
                  </div>
                </>
              ) : (
                <div className="bg-primary/5 p-4 rounded-2xl">
                   <p className="text-center text-sm font-medium text-primary">أنت تشاهد الملف الشخصي لـ {currentProfile.displayName}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="reels" className="mt-0 outline-none p-4">
            <div className="flex flex-col gap-4">
              {isMe && (
                <Button 
                  onClick={() => setIsReelsOpen(true)}
                  className="w-full h-14 rounded-2xl border-2 border-dashed border-primary/30 text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 font-bold bg-transparent"
                >
                  <Plus className="w-5 h-5" />
                  إضافة ريلز جديد
                </Button>
              )}

              <div className="grid grid-cols-2 gap-3 pb-20">
                {userReels && userReels.length > 0 ? (
                  userReels.map((reel) => (
                    <div key={reel.id} className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-muted shadow-lg group">
                      {reel.url.startsWith('data:video') ? (
                        <video 
                          src={reel.url} 
                          className="w-full h-full object-cover"
                          controls={false}
                        />
                      ) : (
                        <img 
                          src={reel.url} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-3">
                        {reel.caption && <p className="text-white text-[10px] line-clamp-2 mb-1">{reel.caption}</p>}
                        <div className="flex justify-between items-center gap-2">
                          {isMe && (
                            <Button 
                              variant="destructive" 
                              size="icon" 
                              className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleDeleteReel(reel.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                          <div className={`h-8 w-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center ${!isMe ? 'mr-auto' : ''}`}>
                            <Play className="w-4 h-4 text-white fill-white" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 py-20 text-center space-y-4 opacity-50">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                      <Play className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">لا توجد حالات ريلز حالياً</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isReelsOpen} onOpenChange={setIsReelsOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة حالة ريلز 🎬</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">اختر من الاستوديو</label>
              <div 
                className="w-full aspect-[9/16] max-h-[40vh] bg-muted rounded-2xl border-2 border-dashed border-primary/20 flex flex-col items-center justify-center gap-4 cursor-pointer overflow-hidden relative mx-auto"
                onClick={() => document.getElementById('reel-video-upload')?.click()}
              >
                {reelUrl ? (
                  reelUrl.startsWith('data:video') ? (
                    <video src={reelUrl} className="w-full h-full object-cover" />
                  ) : (
                    <img src={reelUrl} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  )
                ) : (
                  <>
                    <Play className="w-12 h-12 text-primary/40" />
                    <p className="text-xs text-muted-foreground">اضغط لاختيار فيديو أو صورة</p>
                  </>
                )}
                <input 
                  id="reel-video-upload"
                  type="file" 
                  className="hidden" 
                  accept="video/*,image/*" 
                  onChange={handleReelFileChange} 
                />
                {uploadingReel && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">وصف الريلز (اختياري)</label>
              <Input 
                placeholder="ماذا تريد أن تكتب؟" 
                value={reelCaption}
                onChange={(e) => setReelCaption(e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-row gap-2 sm:justify-end sticky bottom-0 bg-background pt-2">
            <Button variant="outline" onClick={() => setIsReelsOpen(false)} className="flex-1 rounded-xl">إلغاء</Button>
            <Button onClick={handleAddReel} className="flex-1 rounded-xl purple-gradient" disabled={uploadingReel || !reelUrl}>
              {uploadingReel ? <Loader2 className="animate-spin w-4 h-4" /> : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
