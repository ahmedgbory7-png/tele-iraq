import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { doc, updateDoc, getDoc, query, collection, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
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
  const [isAnimatedUnlocked, setIsAnimatedUnlocked] = useState(false);
  const [remainingDaysMagic, setRemainingDaysMagic] = useState<number | null>(null);
  const [remainingDaysAnimated, setRemainingDaysAnimated] = useState<number | null>(null);

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
        if (nameColor === 'magic') setNameColor('#141414');
      }
    } else {
      setIsMagicUnlocked(false);
      setRemainingDaysMagic(null);
    }
  }, [currentProfile, nameColor]);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [magicCode, setMagicCode] = useState('');
  const [isReelsOpen, setIsReelsOpen] = useState(false);
  const [reelCaption, setReelCaption] = useState('');
  const [reelUrl, setReelUrl] = useState('');
  const [uploadingReel, setUploadingReel] = useState(false);
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

  const handleColorClick = (color: string) => {
    setNameColor(color);
  };

  const handleUnlockCode = async () => {
    if (magicCode === '900') {
      try {
        setLoading(true);
        await updateDoc(doc(db, 'users', profile.uid), {
          magicUnlockedAt: serverTimestamp(),
          nameColor: 'magic'
        });
        setIsMagicUnlocked(true);
        setNameColor('magic');
        setIsMagicDialogOpen(false);
        setSaved(true);
        setMagicCode('');
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        console.error(err);
        alert('فشل تفعيل الميزات المميزة');
      } finally {
        setLoading(false);
      }
    } else {
      alert('الكود غير صحيح! حاول مرة أخرى.');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName,
        status,
        photoURL,
        nameColor
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('too large')) {
        alert('حجم صورة البروفايل كبير جداً. يرجى اختيار صورة أصغر.');
      } else {
        alert('فشل حفظ التغييرات. تحقق من الاتصال بالإنترنت.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.src = reader.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDimension = 600;

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
          setPhotoURL(canvas.toDataURL('image/jpeg', 0.8));
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddReel = async () => {
    if (!reelUrl.trim()) return;
    setUploadingReel(true);
    try {
      const newReel = {
        id: Math.random().toString(36).substr(2, 9),
        url: reelUrl.trim(),
        caption: reelCaption.trim(),
        createdAt: new Date().toISOString()
      };
      
      const updatedReels = [...(profile.reels || []), newReel];
      await updateDoc(doc(db, 'users', profile.uid), {
        reels: updatedReels
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
    if (!window.confirm('هل أنت متأكد من حذف هذا الريلز؟')) return;
    try {
      const updatedReels = (profile.reels || []).filter(r => r.id !== reelId);
      await updateDoc(doc(db, 'users', profile.uid), {
        reels: updatedReels
      });
    } catch (err) {
      console.error(err);
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
                  if(!profile || !currentProfile) return;
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
              nameColor === 'magic' ? 'magic-color-text' : ''
            }`} style={{ color: nameColor === 'magic' ? undefined : nameColor === '#141414' ? 'white' : nameColor }}>
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
                      currentProfile.nameColor === 'magic' ? 'magic-color-text' : ''
                    }`} style={{ color: currentProfile.nameColor === 'magic' ? undefined : (currentProfile.nameColor || 'inherit') }}>
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
                            nameColor === 'magic' ? 'magic-color-bg' : ''
                          }`} 
                          style={{ backgroundColor: nameColor === 'magic' ? undefined : nameColor }}
                        />
                        <span className={`font-bold text-sm ${
                          nameColor === 'magic' ? 'magic-color-text' : ''
                        }`} style={{ color: nameColor === 'magic' ? undefined : nameColor }}>
                          {nameColor === 'magic' ? 'سحري' : 'لون مخصص'}
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
                            onClick={() => isMagicUnlocked ? setNameColor('magic') : setIsMagicDialogOpen(true)}
                            className={`group relative w-32 h-12 rounded-2xl border-2 transition-all flex flex-col items-center justify-center overflow-hidden hover:scale-105 active:scale-95 ${nameColor === 'magic' ? 'border-primary ring-4 ring-primary/20 shadow-lg' : 'border-dashed border-muted-foreground/30'}`}
                          >
                            <div className={`absolute inset-0 magic-color-bg opacity-40 ${!isMagicUnlocked ? 'grayscale blur-[1px]' : ''}`} />
                            {isMagicUnlocked ? (
                              <>
                                <span className="relative text-[10px] font-bold text-primary dark:text-white z-10 drop-shadow-sm">سحري</span>
                                {remainingDaysMagic !== null && (
                                  <span className="relative text-[8px] font-bold text-muted-foreground z-10">{remainingDaysMagic} يوم</span>
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
                {currentProfile.reels && currentProfile.reels.length > 0 ? (
                  currentProfile.reels.map((reel) => (
                    <div key={reel.id} className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-muted shadow-lg group">
                      <video 
                        src={reel.url} 
                        className="w-full h-full object-cover"
                        controls={false}
                      />
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
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة حالة ريلز 🎬</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">رابط الفيديو</label>
              <Input 
                placeholder="أدخل رابط الفيديو (MP4)..." 
                value={reelUrl}
                onChange={(e) => setReelUrl(e.target.value)}
                className="h-12 rounded-xl"
              />
              <p className="text-[10px] text-muted-foreground">ملاحظة: يفضل استخدام روابط فيديو مباشرة MP4</p>
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
          <DialogFooter className="flex flex-row gap-2 sm:justify-end">
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
