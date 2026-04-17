import React, { useState } from 'react';
import { db } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowRight, Camera, Check, Loader2, Lock, Plus, Trash2, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useStore } from '@/store/useStore';

export function Profile() {
  const { profile, setShowProfile } = useStore();
  const onClose = () => setShowProfile(false);
  
  if (!profile) return null;

  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [status, setStatus] = useState(profile.status || '');
  const [photoURL, setPhotoURL] = useState(profile.photoURL || '');
  const [nameColor, setNameColor] = useState(profile.nameColor || '#141414');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isMagicUnlocked, setIsMagicUnlocked] = useState(() => localStorage.getItem('magic-unlocked') === 'true' || profile.nameColor === 'magic');
  const [isMagicDialogOpen, setIsMagicDialogOpen] = useState(false);
  const [magicCode, setMagicCode] = useState('');
  const [isReelsOpen, setIsReelsOpen] = useState(false);
  const [reelCaption, setReelCaption] = useState('');
  const [reelUrl, setReelUrl] = useState('');
  const [uploadingReel, setUploadingReel] = useState(false);

  const colors = [
    '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', 
    '#10b981', '#3b82f6', '#6366f1', '#141414'
  ];

  const handleColorClick = (color: string) => {
    setNameColor(color);
  };

  const handleMagicUnlock = () => {
    if (magicCode === 'asd') {
      setIsMagicUnlocked(true);
      localStorage.setItem('magic-unlocked', 'true');
      setNameColor('magic');
      setIsMagicDialogOpen(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
        setPhotoURL(reader.result as string);
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
    <div className="flex flex-col h-full bg-background" dir="rtl">
      {/* Header */}
      <div className="p-4 flex items-center gap-4 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
          <ArrowRight className="h-6 w-6 text-primary" />
        </Button>
        <h2 className="text-xl font-bold">الملف الشخصي</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="info" className="w-full">
          <TabsList className="w-full h-14 bg-card border-b rounded-none p-0 flex">
            <TabsTrigger value="info" className="flex-1 h-full rounded-none data-[state=active]:bg-accent data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all">المعلومات</TabsTrigger>
            <TabsTrigger value="reels" className="flex-1 h-full rounded-none data-[state=active]:bg-accent data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all text-primary font-bold">حالات ريلز</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="p-6 space-y-8 max-w-md mx-auto w-full mt-0 outline-none">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative group cursor-pointer" onClick={() => document.getElementById('avatar-upload')?.click()}>
                <Avatar className="h-32 w-32 border-4 border-primary/10 shadow-xl group-hover:opacity-80 transition-opacity">
                  <AvatarImage src={photoURL} />
                  <AvatarFallback 
                    className="text-4xl font-bold bg-muted-foreground/20 text-muted-foreground"
                  >
                    {displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute bottom-0 right-0 flex gap-1">
                  <div className="bg-primary text-white p-2 rounded-full shadow-lg hover:scale-110 transition-transform">
                    <Camera className="h-5 w-5" />
                  </div>
                </div>
                <input 
                  id="avatar-upload"
                  type="file" 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileChange} 
                />
              </div>
              <div className="text-center">
                <p className="text-xs text-primary font-bold mb-1 animate-pulse">اضغط على الصورة لتغييرها</p>
                <p className="text-lg font-bold">{profile.phoneNumber}</p>
                <p className="text-sm text-muted-foreground">معرفك الفريد في تليعراق</p>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-primary px-1 text-right block">الاسم المستعار</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="اسمك"
                  className="h-12 bg-muted/30 border-none rounded-xl focus-visible:ring-primary/30 text-right"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-primary px-1 text-right block">الحالة</label>
                <Input
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  placeholder="ماذا يدور في ذهنك؟"
                  className="h-12 bg-muted/30 border-none rounded-xl focus-visible:ring-primary/30 text-right"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-primary px-1 text-right block">لون الاسم</label>
                <div className="flex flex-wrap gap-3 p-2 justify-end">
                  {colors.map(color => (
                    <button
                      key={color}
                      onClick={() => handleColorClick(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${nameColor === color ? 'border-primary scale-125 shadow-md' : 'border-transparent'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <button
                    onClick={() => isMagicUnlocked ? setNameColor('magic') : setIsMagicDialogOpen(true)}
                    className={`group relative w-12 h-8 rounded-xl border-2 transition-all flex items-center justify-center overflow-hidden active:scale-95 ${nameColor === 'magic' ? 'border-primary scale-110 shadow-lg' : 'border-dashed border-muted-foreground/50'}`}
                  >
                    <div className={`absolute inset-0 magic-color-bg opacity-30 ${!isMagicUnlocked ? 'grayscale' : ''}`} />
                    {isMagicUnlocked ? (
                      <span className="relative text-[10px] font-bold text-primary z-10">السحري</span>
                    ) : (
                      <Lock className="relative h-4 w-4 text-muted-foreground z-10" />
                    )}
                  </button>
                </div>
              </div>

              <Button 
                onClick={handleSave} 
                className={`w-full h-12 text-lg font-bold rounded-xl transition-all ${saved ? 'bg-green-500' : 'purple-gradient'}`}
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin mr-2" /> : saved ? <Check className="mr-2" /> : null}
                {saved ? 'تم الحفظ بنجاح' : 'حفظ التغييرات'}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="reels" className="mt-0 outline-none p-4">
            <div className="flex flex-col gap-4">
              <Button 
                onClick={() => setIsReelsOpen(true)}
                className="w-full h-14 rounded-2xl border-2 border-dashed border-primary/30 text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 font-bold bg-transparent"
              >
                <Plus className="w-5 h-5" />
                إضافة ريلز جديد
              </Button>

              <div className="grid grid-cols-2 gap-3 pb-20">
                {profile.reels && profile.reels.length > 0 ? (
                  profile.reels.map((reel) => (
                    <div key={reel.id} className="relative aspect-[9/16] rounded-2xl overflow-hidden bg-muted shadow-lg group">
                      <video 
                        src={reel.url} 
                        className="w-full h-full object-cover"
                        controls={false}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-3">
                        {reel.caption && <p className="text-white text-[10px] line-clamp-2 mb-1">{reel.caption}</p>}
                        <div className="flex justify-between items-center gap-2">
                          <Button 
                            variant="destructive" 
                            size="icon" 
                            className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteReel(reel.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
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
            <DialogTitle>فتح اللون السحري 🌈</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground text-right italic font-bold">بواسطة المطور: أبو وطن</p>
            <p className="text-sm text-foreground text-right font-medium">أدخل الكود السري لتفعيل اللون المتعدد للأفراد المميزين فقط.</p>
            <Input 
              placeholder="أدخل الكود هنا..." 
              value={magicCode}
              onChange={(e) => setMagicCode(e.target.value)}
              className="text-center font-mono tracking-widest h-12 text-lg focus-visible:ring-primary"
            />
          </div>
          <DialogFooter className="flex flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setIsMagicDialogOpen(false)} className="flex-1 sm:flex-none h-12 rounded-xl">إلغاء</Button>
            <Button onClick={handleMagicUnlock} className="flex-1 sm:flex-none h-12 rounded-xl purple-gradient">تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
