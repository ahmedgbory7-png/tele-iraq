import React, { useState, useEffect } from 'react';
import { auth, db } from '@/firebase';
import { doc, updateDoc, getDoc, query, collection, where, getDocs, addDoc, serverTimestamp, orderBy, onSnapshot, deleteDoc, increment, writeBatch, arrayUnion, arrayRemove, deleteField } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowRight, Camera, Check, Loader2, Lock, Plus, Trash2, Play, MessageSquare, User, BadgeCheck, UserPlus, UserMinus, Palette, LogOut } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from 'motion/react';
import { format, isToday, isYesterday } from 'date-fns';
import { ar } from 'date-fns/locale';

import { useStore } from '@/store/useStore';
import { getNameColorClass, isMagicColor } from '@/lib/utils';

export function Profile() {
  const { profile, setProfile, setShowProfile, setShowSettings, setCurrentTab, viewingProfileId, setViewingProfileId, setActiveChatId, language, setQuotaExceeded, quotaExceeded } = useStore();
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [isOtherProfileLoading, setIsOtherProfileLoading] = useState(false);
  const [isUpdatingFriend, setIsUpdatingFriend] = useState(false);
  const [confirmingContact, setConfirmingContact] = useState<{ type: 'add' | 'remove' } | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const onClose = () => {
    setShowSettings(false);
    setShowProfile(false);
    setViewingProfileId(null);
    setCurrentTab('chats');
  };

  const getParticipantProfiles = (users: UserProfile[]) => {
    const profiles: Record<string, any> = {};
    users.forEach(u => {
      profiles[u.uid] = {
        displayName: u.displayName || 'مستخدم',
        photoURL: u.photoURL || '',
        nameColor: u.nameColor || '',
        isVerified: u.isVerified || false,
        phoneNumber: u.phoneNumber || ''
      };
    });
    return profiles;
  };

  useEffect(() => {
    if (viewingProfileId) {
      if (quotaExceeded) {
        setIsOtherProfileLoading(false);
        return;
      }
      setIsOtherProfileLoading(true);
      getDoc(doc(db, 'users', viewingProfileId)).then(snap => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setTargetProfile(data);
          // Sync local state for display
          setDisplayName(data.displayName || '');
          setUsername((data as any).username || '');
          setStatus(data.status || '');
          setPhotoURL(data.photoURL || '');
          setNameColor(data.nameColor || '#141414');
          setIsVerified(!!data.isVerified);
          setChatBackground(data.chatBackground || '');
          setBirthDate(data.birthDate || '');
          setCity(data.city || '');
          setHobbies(data.hobbies || '');
        }
        setIsOtherProfileLoading(false);
      }).catch(err => {
        console.error("Error fetching profile:", err);
        if (err.code === 'resource-exhausted') setQuotaExceeded(true);
        setIsOtherProfileLoading(false);
      });
    } else if (profile) {
      setTargetProfile(profile);
      setDisplayName(profile.displayName || '');
      setUsername((profile as any).username || '');
      setStatus(profile.status || '');
      setPhotoURL(profile.photoURL || '');
      setNameColor(profile.nameColor || '#141414');
      setIsVerified(!!profile.isVerified);
      setChatBackground(profile.chatBackground || '');
      setBirthDate(profile.birthDate || '');
      setCity(profile.city || '');
      setHobbies(profile.hobbies || '');
    }
  }, [viewingProfileId, profile]);
  
  const currentProfile = targetProfile;
  const isMe = !viewingProfileId || viewingProfileId === profile?.uid;

  const [activeTab, setActiveTab] = useState('info');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [nameColor, setNameColor] = useState('#141414');
  const [isVerified, setIsVerified] = useState(false);
  const [chatBackground, setChatBackground] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [city, setCity] = useState('');
  const [hobbies, setHobbies] = useState('');
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
    '#eab308', '#f97316', '#d946ef', '#1d4ed8',
    '#2563eb', '#7c3aed', '#db2777', '#dc2626',
    '#ea580c', '#ca8a04', '#16a34a', '#0891b2',
    '#4f46e5', '#9333ea', '#c026d3', '#be123c',
    '#b91c1c', '#9a3412', '#4338ca', '#1e40af',
    '#000000', '#ff0000', '#008000', '#0000ff',
    '#ffa500', '#39ff14', '#800080'
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
    // Auto-save color change
    if (profile?.uid) {
      if (quotaExceeded) return;
      updateDoc(doc(db, 'users', profile.uid), { nameColor: color })
        .then(() => propagateProfileUpdate({ nameColor: color }))
        .catch(err => {
          if (err.code === 'resource-exhausted') setQuotaExceeded(true);
          console.error("Auto-save color error:", err);
        });
    }
  };

  const handleMagicColorClick = (color: string) => {
    // If the color is already the active one, or if they are already verified/unlocked, just set it
    // But the user wants it "locked with 900", so let's check unlock status
    if (isVerified || isMagicUnlocked || isMagic2Unlocked || isMagic3Unlocked || isMagic4Unlocked || isMagicIraqUnlocked) {
      setNameColor(color);
      // Auto-save magic color change too
      if (profile?.uid) {
        updateDoc(doc(db, 'users', profile.uid), { nameColor: color })
          .then(() => propagateProfileUpdate({ nameColor: color }))
          .catch(err => console.error("Auto-save color error:", err));
      }
      return;
    }
    // We only set the pending color, not the active nameColor yet
    setPendingMagicColor(color);
    setIsMagicDialogOpen(true);
  };

  const handleUnlockCode = async () => {
    const code = magicCode.trim().toUpperCase();
    if (code === '900') {
      try {
        setLoading(true);
        let newColor = pendingMagicColor || 'magic';

        await updateDoc(doc(db, 'users', profile.uid), {
          magicUnlockedAt: serverTimestamp(),
          magic2UnlockedAt: serverTimestamp(),
          magic3UnlockedAt: serverTimestamp(),
          magic4UnlockedAt: serverTimestamp(),
          magicIraqUnlockedAt: serverTimestamp(),
          nameColor: newColor,
          isVerified: true,
          verifiedAt: serverTimestamp()
        });
        await propagateProfileUpdate({ nameColor: newColor, isVerified: true });
        setIsMagicUnlocked(true);
        setIsMagic2Unlocked(true);
        setIsMagic3Unlocked(true);
        setIsMagic4Unlocked(true);
        setIsMagicIraqUnlocked(true);
        setIsVerified(true);
        setNameColor(newColor);
        setIsMagicDialogOpen(false);
        setSaved(true);
        setMagicCode('');
        setPendingMagicColor(null);
        alert('✨ تم تفعيل الميزات المميزة واللون السحري وتوثيق حسابك بنجاح!');
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
        if (pendingMagicColor) {
          await updateDoc(doc(db, 'users', profile.uid), {
            nameColor: pendingMagicColor,
            isVerified: true,
            verifiedAt: serverTimestamp()
          });
          setNameColor(pendingMagicColor);
          setIsVerified(true);
          await propagateProfileUpdate({ nameColor: pendingMagicColor, isVerified: true });
          alert('✨ تم تفعيل اللون المختار وتوثيق حسابك بنجاح! تم قفل اللون المختار.');
        } else {
          await updateDoc(doc(db, 'users', profile.uid), {
            isVerified: true,
            verifiedAt: serverTimestamp()
          });
          setIsVerified(true);
          await propagateProfileUpdate({ isVerified: true });
          alert('✔️ تم توثيق حسابك بنجاح! تظهر الآن علامة التوثيق الزرقاء بجانب اسمك.');
        }
        setIsMagicDialogOpen(false);
        setMagicCode('');
        setPendingMagicColor(null);
      } catch (err) {
        console.error(err);
        alert('فشل تفعيل الميزة.');
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
    if (quotaExceeded) {
      alert('تم الوصول للحد اليومي لخدمات البيانات. يرجى المحاولة غداً.');
      return;
    }
    setLoading(true);
    try {
      // Ensure we don't accidentally lose verification status
      const currentVerifiedStatus = isVerified || !!profile.isVerified;
      
      const updatedData = {
        displayName: displayName.trim() || profile.displayName || 'مستخدم تلي عراق',
        username: username.trim().toLowerCase(),
        status: status.trim() || profile.status || 'أنا أستخدم تلي عراق!',
        photoURL,
        nameColor,
        isVerified: currentVerifiedStatus,
        chatBackground,
        birthDate,
        city,
        hobbies
      };
      
      await updateDoc(doc(db, 'users', profile.uid), updatedData);
      setIsVerified(currentVerifiedStatus); // Sync local state
      await propagateProfileUpdate(updatedData);
      setSaved(true);
      alert('✅ تم حفظ التغييرات في ملفك الشخصي بنجاح!');
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'resource-exhausted') {
        setQuotaExceeded(true);
        alert('❌ تم الوصول للحد اليومي لخدمات البيانات. يرجى المحاولة غداً.');
      } else if (err.message?.includes('too large')) {
        alert('❌ حجم الصورة كبير جداً. يرجى اختيار صورة بحجم أقل من 1 ميجابايت.');
      } else {
        alert('❌ فشل في حفظ التغييرات. يرجى التأكد من اتصال الإنترنت.');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleFriend = async () => {
    if (!profile?.uid || !currentProfile?.uid) return;
    setIsUpdatingFriend(true);
    const isFriend = profile.friends?.includes(currentProfile.uid);
    
    try {
      const userRef = doc(db, 'users', profile.uid);
      if (isFriend) {
        await updateDoc(userRef, {
          friends: arrayRemove(currentProfile.uid),
          [`friendDetails.${currentProfile.uid}`]: deleteField()
        });
      } else {
        await updateDoc(userRef, {
          friends: arrayUnion(currentProfile.uid),
          [`friendDetails.${currentProfile.uid}`]: {
            displayName: currentProfile.displayName || 'مستخدم',
            photoURL: currentProfile.photoURL || '',
            nameColor: currentProfile.nameColor || '',
            isVerified: !!currentProfile.isVerified,
            phoneNumber: currentProfile.phoneNumber || ''
          }
        });
      }
    } catch (err: any) {
      console.error("Error toggling friend:", err);
      if (err.code === 'resource-exhausted') setQuotaExceeded(true);
    } finally {
      setIsUpdatingFriend(false);
      setConfirmingContact(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 950 * 1024) {
        alert('الملف كبير جداً. الحد الأقصى هو 1 ميجابايت.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoURL(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBackgroundSelect = async (bgValue: string) => {
    if (!profile?.uid) return;
    
    const previousBg = chatBackground;
    setChatBackground(bgValue);
    
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        chatBackground: bgValue
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error saving background:", err);
      setChatBackground(previousBg);
      alert(language === 'English' ? 'Failed to save background' : 'فشل حفظ الخلفية. يرجى المحاولة مرة أخرى.');
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 950 * 1024) {
        alert('خلفية المحادثة كبيرة جداً. الحد الأقصى هو 1 ميجابايت.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        handleBackgroundSelect(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const defaultBackgrounds = [
    { id: 'none', name: 'تلقائي', value: '' },
    { id: 'grad1', name: 'أرجواني', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { id: 'grad2', name: 'ذهبي', value: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)' },
    { id: 'grad3', name: 'زمردي', value: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)' },
    { id: 'grad4', name: 'ليلي', value: 'linear-gradient(135deg, #232526 0%, #414345 100%)' },
    { id: 'pattern1', name: 'نجوم', value: 'https://www.transparenttextures.com/patterns/stardust.png' },
    { id: 'pattern2', name: 'شبكة', value: 'https://www.transparenttextures.com/patterns/brushed-alum.png' },
    { id: 'pattern3', name: 'هندسي', value: 'https://www.transparenttextures.com/patterns/cubes.png' },
  ];

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto no-scrollbar" dir="rtl">
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
            <ArrowRight className={`h-6 w-6 ${language === 'English' ? 'rotate-180' : ''}`} />
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
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`rounded-full hover:bg-white/10 backdrop-blur-md ios-touch ${
                    profile?.friends?.includes(currentProfile.uid) ? 'bg-destructive/20 text-destructive' : 'bg-white/20 text-white'
                  }`}
                  onClick={() => {
                    const isFriend = profile?.friends?.includes(currentProfile.uid);
                    setConfirmingContact({ type: isFriend ? 'remove' : 'add' });
                  }}
                  disabled={isUpdatingFriend}
                >
                  {isUpdatingFriend ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    profile?.friends?.includes(currentProfile.uid) ? <UserMinus className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />
                  )}
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full hover:bg-white/10 bg-white/20 backdrop-blur-md text-white ios-touch"
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
                        participantProfiles: getParticipantProfiles([profile, currentProfile]),
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
              </div>
            )}
          </div>
        </div>

        <div className="absolute bottom-6 inset-x-6 flex flex-col items-center text-white text-center">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-1"
          >
            <h1 className={`text-3xl font-bold tracking-tight flex items-center gap-1.5 ${getNameColorClass(nameColor)}`} 
              style={{ color: isMagicColor(nameColor) ? undefined : (nameColor || 'white') }}
            >
              {displayName || 'مستخدم تلي عراق'}
              {isVerified ? (
                <BadgeCheck className="w-6 h-6 text-blue-500 fill-blue-500/10" />
              ) : isMe && (
                <BadgeCheck 
                  className="w-6 h-6 text-white/30 cursor-pointer hover:text-white/50 transition-colors" 
                  onClick={() => setIsMagicDialogOpen(true)}
                />
              )}
              {isMe && (
                <div className="flex items-center bg-white/10 px-2 py-0.5 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1.5" />
                  <span className="text-[10px] text-white/70 font-bold">نشط الآن</span>
                </div>
              )}
            </h1>
            <p className="text-white/60 text-sm font-medium" style={{ color: isMagicColor(nameColor) ? undefined : (nameColor || 'white'), opacity: 0.7 }}>{formatLastSeen(currentProfile)}</p>
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

      <div className="shrink-0 flex flex-col">
        {isMe ? (
          <Tabs defaultValue="info" className="flex flex-col">
            <div className="px-6 border-b border-border/40 sticky top-0 bg-background/80 backdrop-blur-md z-20">
              <TabsList className="w-full bg-transparent h-12 gap-0 overflow-x-auto no-scrollbar">
                <TabsTrigger 
                  value="info" 
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-full font-bold text-xs"
                >
                  المعلومات
                </TabsTrigger>
                <TabsTrigger 
                  value="appearance" 
                  className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent h-full font-bold text-xs"
                >
                  المظهر
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="pb-10">
              <TabsContent value="info" className="m-0">
                <section className="bg-card">
                  <div className="p-6 space-y-8 flex flex-col items-center text-center">
                    <div className="w-full max-w-sm space-y-6">
                      <div className="flex flex-col items-center gap-2 border-b border-border/40 pb-6 w-full">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                          {currentProfile.phoneNumber ? 'رقم الهاتف' : 'معرف الحساب'}
                        </span>
                        <span className="text-lg font-bold text-primary" style={{ color: isMagicColor(nameColor) ? undefined : nameColor }}>
                          {currentProfile.phoneNumber || currentProfile.email?.split('@')[0] || currentProfile.uid?.slice(0, 8)}
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider" style={{ color: isMagicColor(nameColor) ? undefined : nameColor }}>الاسم (اللقب)</label>
                        <div className="flex items-center gap-2 w-full justify-center">
                          <Input
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="أدخل اسمك..."
                            className={`h-12 bg-muted/20 border-border/40 rounded-2xl text-center font-bold text-lg flex-1 ${getNameColorClass(nameColor)}`}
                            style={{ color: isMagicColor(nameColor) ? undefined : nameColor }}
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
                      </div>

                      <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider" style={{ color: isMagicColor(nameColor) ? undefined : nameColor }}>اسم المستخدم (المعرف)</label>
                        <div className="relative w-full">
                          <Input
                            value={username}
                            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())}
                            placeholder="username"
                            className="h-12 bg-muted/20 border-border/40 rounded-2xl text-left pr-8 pl-12 font-mono"
                            style={{ color: isMagicColor(nameColor) ? undefined : nameColor }}
                          />
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">@</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground">يمكن للآخرين البحث عنك بواسطة هذا المعرف.</p>
                      </div>

                      <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider" style={{ color: isMagicColor(nameColor) ? undefined : nameColor }}>النبذة التعريفية</label>
                        <Input
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                          placeholder="اكتب شيئاً عنك..."
                          className="h-12 bg-muted/20 border-border/40 rounded-2xl text-center font-medium"
                          style={{ color: isMagicColor(nameColor) ? undefined : nameColor }}
                        />
                      </div>

                      <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">تاريخ الميلاد</label>
                        <Input
                          value={birthDate}
                          onChange={(e) => setBirthDate(e.target.value)}
                          placeholder="مثال: 1995/05/20"
                          className="h-12 bg-muted/20 border-border/40 rounded-2xl text-center font-medium"
                        />
                      </div>

                      <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">المدينة</label>
                        <Input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="اين تسكن؟"
                          className="h-12 bg-muted/20 border-border/40 rounded-2xl text-center font-medium"
                        />
                      </div>

                      <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                        <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">الهوايات</label>
                        <Input
                          value={hobbies}
                          onChange={(e) => setHobbies(e.target.value)}
                          placeholder="ماذا تحب ان تفعل؟"
                          className="h-12 bg-muted/20 border-border/40 rounded-2xl text-center font-medium"
                        />
                      </div>
                    </div>
                  </div>
                </section>
              </TabsContent>

              <TabsContent value="appearance" className="m-0 p-6 space-y-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-primary text-center">خلفية المحادثة</h3>
                  <p className="text-xs text-muted-foreground text-center">اختر خلفية مريحة لعينيك أثناء الدردشة</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {defaultBackgrounds.map(bg => (
                      <button
                        key={bg.id}
                        onClick={() => handleBackgroundSelect(bg.value)}
                        className={`group relative h-24 rounded-2xl overflow-hidden transition-all border-2 ${chatBackground === bg.value ? 'border-primary ring-4 ring-primary/20' : 'border-transparent'}`}
                      >
                        <div 
                          className="absolute inset-0 transition-transform group-hover:scale-110"
                          style={{ 
                            background: bg.value.startsWith('linear-gradient') ? bg.value : undefined,
                            backgroundImage: !bg.value.startsWith('linear-gradient') && bg.value ? `url(${bg.value})` : undefined,
                            backgroundColor: bg.value ? undefined : '#f4f4f7',
                            backgroundSize: 'cover'
                          }}
                        />
                        {!bg.value && (
                          <div className="absolute inset-0 flex items-center justify-center telegram-bg opacity-50" />
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-black/40 backdrop-blur-md py-1">
                          <span className="text-[10px] font-bold text-white tracking-wider">{bg.name}</span>
                        </div>
                      </button>
                    ))}
                    
                    <button
                      onClick={() => document.getElementById('bg-upload')?.click()}
                      className="h-24 rounded-2xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-2 hover:bg-muted/30 transition-all"
                    >
                      <Plus className="w-6 h-6 text-muted-foreground" />
                      <span className="text-[10px] font-bold text-muted-foreground">رفع صورة خاصة</span>
                    </button>
                  </div>
                  
                  <input 
                    id="bg-upload"
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleBackgroundUpload} 
                  />

                  {chatBackground && !defaultBackgrounds.find(b => b.value === chatBackground) && (
                    <div className="mt-4 p-4 rounded-3xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-12 h-12 rounded-xl shadow-inner border border-primary/20"
                          style={{ backgroundImage: `url(${chatBackground})`, backgroundSize: 'cover' }}
                        />
                        <span className="text-sm font-bold text-primary">خلفيتك المختارة</span>
                      </div>
                      <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10" onClick={() => handleBackgroundSelect('')}>
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-4 pt-4 border-t border-border/40">
                  <h3 className="text-base font-black text-primary text-center">معاينة الخلفية</h3>
                  <div 
                    className="w-full h-40 rounded-3xl overflow-hidden shadow-2xl relative border border-border/20"
                    style={typeof chatBackground === 'string' && chatBackground ? {
                      background: (chatBackground.startsWith('linear-gradient') || chatBackground.startsWith('radial-gradient'))
                        ? chatBackground
                        : undefined,
                      backgroundImage: (!chatBackground.startsWith('linear-gradient') && !chatBackground.startsWith('radial-gradient'))
                        ? `url(${chatBackground})`
                        : undefined,
                      backgroundColor: '#f4f4f7',
                      backgroundSize: 'cover'
                    } : undefined}
                  >
                    {!chatBackground && <div className="absolute inset-0 telegram-bg opacity-30" />}
                    <div className="absolute inset-0 p-4 flex flex-col justify-end gap-2">
                      <div className="bg-card w-2/3 p-2 rounded-2xl rounded-bl-none shadow-sm text-[10px]">مرحباً! كيف حالك اليوم؟</div>
                      <div className="bg-primary text-white w-2/3 p-2 rounded-2xl rounded-br-none shadow-sm self-end text-[10px]">أنا بخير، شكراً لك! هذه الخلفية رائعة جداً 😍</div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        ) : (
          <div className="pb-24">
            <section className="bg-card">
              <div className="p-6 space-y-8 flex flex-col items-center text-center">
                <div className="w-full max-w-sm space-y-6">
                  <div className="flex flex-col items-center gap-2 border-b border-border/40 pb-6 w-full">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                      {currentProfile.phoneNumber ? 'رقم الهاتف' : 'معرف الحساب'}
                    </span>
                    <span className="text-lg font-bold text-primary">
                      {currentProfile.phoneNumber || currentProfile.email?.split('@')[0] || currentProfile.uid?.slice(0, 8)}
                    </span>
                  </div>

                  <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                    <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">الاسم المستعار</label>
                    <div className="flex items-center justify-center gap-1.5">
                      <p className={`text-xl font-bold ${getNameColorClass(currentProfile.nameColor)}`} style={{ color: isMagicColor(currentProfile.nameColor) ? undefined : (currentProfile.nameColor || 'inherit') }}>
                        {currentProfile.displayName}
                      </p>
                      {currentProfile.isVerified && <BadgeCheck className="w-5 h-5 text-blue-500" />}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                    <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">النبذة التعريفية</label>
                    <p className="font-medium text-muted-foreground text-center text-sm px-4">{currentProfile.status}</p>
                  </div>

                  {currentProfile.birthDate && (
                    <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                      <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">تاريخ الميلاد</label>
                      <p className="font-medium text-muted-foreground text-center text-sm px-4">{currentProfile.birthDate}</p>
                    </div>
                  )}

                  {currentProfile.city && (
                    <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                      <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">المدينة</label>
                      <p className="font-medium text-muted-foreground text-center text-sm px-4">{currentProfile.city}</p>
                    </div>
                  )}

                  {currentProfile.hobbies && (
                    <div className="flex flex-col items-center gap-3 border-b border-border/40 pb-6 w-full">
                      <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">الهوايات</label>
                      <p className="font-medium text-muted-foreground text-center text-sm px-4">{currentProfile.hobbies}</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
        
        <div className="p-6 flex flex-col gap-6 max-w-sm mx-auto">
          {isMe ? (
            <>
              <div className="space-y-4">
                <Button 
                  variant="outline"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="w-full h-14 rounded-2xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 flex items-center justify-between px-6 transition-all active:scale-[0.98] group"
                >
                  <div className="flex items-center gap-3">
                    <Palette className="w-6 h-6 text-primary" />
                    <span className="font-black text-primary text-base">تغيير لون الاسم المميز</span>
                  </div>
                  <motion.div animate={{ rotate: showColorPicker ? 180 : 0 }}>
                    <ArrowRight className="h-5 w-5 text-primary rotate-90" />
                  </motion.div>
                </Button>

                <AnimatePresence>
                  {showColorPicker && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0, scale: 0.95 }}
                      animate={{ height: 'auto', opacity: 1, scale: 1 }}
                      exit={{ height: 0, opacity: 0, scale: 0.95 }}
                      className="overflow-hidden space-y-6 pt-2"
                    >
                      {/* Current Color Preview */}
                      <div className="bg-muted/20 p-4 rounded-2xl border border-border/40 flex items-center justify-center gap-4">
                        <div 
                          className={`w-10 h-10 rounded-full border-4 border-white/20 shadow-xl ${
                            nameColor === 'magic' ? 'magic-color-bg' : 
                            nameColor === 'magic_neon' ? 'magic-neon-orange-bg' : 
                            nameColor === 'magic_rb' ? 'magic-red-blue-bg' : 
                            nameColor === 'magic_pb' ? 'magic-pink-black-bg' : 
                            nameColor === 'magic_iraq' ? 'magic-iraq-bg' : 
                            nameColor === 'magic_iraq_phosphor' ? 'magic-iraq-phosphor-bg' :
                            nameColor === 'magic_neon_orange_moving' ? 'magic-neon-orange-moving-bg' :
                            nameColor === 'magic_neon_green_moving' ? 'magic-neon-green-moving-bg' :
                            nameColor === 'magic_red_yellow_moving' ? 'magic-red-yellow-moving-bg' :
                            nameColor === 'magic_phosphor_moving' ? 'magic-phosphor-moving-bg' :
                            nameColor === 'animated-green' ? 'animated-green-bg' :
                            nameColor === 'animated-red' ? 'animated-red-bg' :
                            nameColor === 'animated-blue' ? 'animated-blue-bg' :
                            nameColor === 'animated-purple' ? 'animated-purple-bg' :
                            nameColor === 'animated-gold' ? 'animated-gold-bg' :
                            nameColor === 'animated-silver' ? 'animated-silver-bg' :
                            nameColor === 'animated-rainbow' ? 'animated-rainbow-bg' : ''
                          }`} 
                          style={{ backgroundColor: (nameColor && (nameColor.startsWith('magic') || nameColor.startsWith('animated-'))) ? undefined : nameColor }}
                        />
                        <div className="flex flex-col">
                          <span className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">اللون النشط</span>
                          <span className={`font-black text-lg ${
                            nameColor === 'magic' ? 'magic-color-text' : 
                            nameColor === 'magic_neon' ? 'magic-neon-orange-text' : 
                            nameColor === 'magic_rb' ? 'magic-red-blue-text' : 
                            nameColor === 'magic_pb' ? 'magic-pink-black-text' : 
                            nameColor === 'magic_iraq' ? 'magic-iraq-text' : 
                            nameColor === 'magic_iraq_phosphor' ? 'magic-iraq-phosphor-text' :
                            nameColor === 'magic_neon_orange_moving' ? 'magic-neon-orange-moving-text' :
                            nameColor === 'magic_neon_green_moving' ? 'magic-neon-green-moving-text' :
                            nameColor === 'magic_red_yellow_moving' ? 'magic-red-yellow-moving-text' :
                            nameColor === 'magic_phosphor_moving' ? 'magic-phosphor-moving-text' :
                            nameColor === 'animated-green' ? 'animated-green-text' :
                            nameColor === 'animated-red' ? 'animated-red-text' :
                            nameColor === 'animated-blue' ? 'animated-blue-text' :
                            nameColor === 'animated-purple' ? 'animated-purple-text' :
                            nameColor === 'animated-gold' ? 'animated-gold-text' :
                            nameColor === 'animated-silver' ? 'animated-silver-text' :
                            nameColor === 'animated-rainbow' ? 'animated-rainbow-text' : ''
                          }`} style={{ color: (nameColor && (nameColor.startsWith('magic') || nameColor.startsWith('animated-'))) ? undefined : nameColor === '#141414' ? 'white' : nameColor }}>
                            {nameColor === 'magic' ? 'سحري (RGB)' : 
                             nameColor === 'magic_neon' ? 'سحري (فسفوري)' : 
                             nameColor === 'magic_rb' ? 'سحري (أحمر وأزرق)' : 
                             nameColor === 'magic_pb' ? 'سحري (وردي وأسود)' : 
                             nameColor === 'magic_iraq' ? 'سحري (عـلم العراق)' : 
                             nameColor === 'magic_iraq_phosphor' ? 'فسفوري العلم العراقي (متحرك)' :
                             nameColor === 'magic_neon_orange_moving' ? 'فسفوري برتقالي (متحرك)' :
                             nameColor === 'magic_neon_green_moving' ? 'فسفوري أخضر (متحرك)' :
                             nameColor === 'magic_red_yellow_moving' ? 'أحمر وأصفر (متحرك)' :
                             nameColor === 'magic_phosphor_moving' ? 'فسفوري (متحرك)' :
                             nameColor === 'animated-green' ? 'أخضر متحرك' : 
                             nameColor === 'animated-red' ? 'أحمر متحرك' :
                             nameColor === 'animated-blue' ? 'أزرق متحرك' :
                             nameColor === 'animated-purple' ? 'أرجواني متحرك' :
                             nameColor === 'animated-gold' ? 'ذهبي ملكي (متحرك)' :
                             nameColor === 'animated-silver' ? 'فضي براق (متحرك)' :
                             nameColor === 'animated-rainbow' ? 'ألوان الطيف (متحرك)' : 'لون مخصص'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-muted-foreground px-1 uppercase tracking-[0.15em] flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                          الألوان الأساسية
                        </h4>
                        <div className="flex flex-wrap gap-2 justify-center px-2 py-3 bg-muted/20 rounded-2xl border border-border/50">
                          {colors.map(color => (
                            <button
                              key={color}
                              onClick={() => handleColorClick(color)}
                              className={`w-9 h-9 rounded-full border-2 transition-all hover:scale-110 active:scale-95 shadow-sm ${nameColor === color ? 'border-primary ring-2 ring-primary/20 shadow-md scale-110' : 'border-background'}`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                        
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-primary px-1 uppercase tracking-[0.15em] flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" />
                          الألوان السحرية المتحركة ✨
                        </h4>
                        <div className="flex flex-wrap gap-3 justify-center px-4 py-5 bg-primary/5 rounded-[2rem] border border-primary/10 relative overflow-hidden">
                          {[
                            { id: 'magic', className: 'magic-color-bg' },
                            { id: 'magic_neon', className: 'magic-neon-orange-bg' },
                            { id: 'magic_rb', className: 'magic-red-blue-bg' },
                            { id: 'magic_pb', className: 'magic-pink-black-bg' },
                            { id: 'magic_iraq', className: 'magic-iraq-bg' },
                            { id: 'magic_iraq_phosphor', className: 'magic-iraq-phosphor-bg' },
                            { id: 'magic_neon_orange_moving', className: 'magic-neon-orange-moving-bg' },
                            { id: 'magic_neon_green_moving', className: 'magic-neon-green-moving-bg' },
                            { id: 'magic_red_yellow_moving', className: 'magic-red-yellow-moving-bg' },
                            { id: 'magic_phosphor_moving', className: 'magic-phosphor-moving-bg' },
                            { id: 'animated-green', className: 'animated-green-bg' },
                            { id: 'animated-red', className: 'animated-red-bg' },
                            { id: 'animated-blue', className: 'animated-blue-bg' },
                            { id: 'animated-purple', className: 'animated-purple-bg' },
                            { id: 'animated-gold', className: 'animated-gold-bg' },
                            { id: 'animated-silver', className: 'animated-silver-bg' },
                            { id: 'animated-rainbow', className: 'animated-rainbow-bg' }
                          ].map((magic) => (
                            <button
                              key={magic.id}
                              onClick={() => handleMagicColorClick(magic.id)}
                              className={`w-11 h-11 rounded-full border-2 transition-all hover:scale-110 active:scale-95 shadow-md ${magic.className} group/btn relative overflow-hidden ${nameColor === magic.id ? 'border-primary ring-2 ring-primary/30 shadow-xl scale-110 z-10' : 'border-transparent opacity-90 hover:opacity-100'}`}
                            >
                              {(!isVerified || nameColor !== magic.id) && (
                                <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center transition-all group-hover/btn:bg-black/20">
                                  <Lock className="w-3.5 h-3.5 text-white/90" />
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                        <p className="text-[9px] text-muted-foreground text-center animate-pulse">تحتاج هذه الألوان إلى كود تفعيل لتثبيتها على اسمك ✨</p>
                      </div>

                      {nameColor && (nameColor.startsWith('magic') || nameColor.startsWith('animated')) && (
                        <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 text-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <p className="text-sm font-bold text-primary mb-1">اللون السحري نشط ✨</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <Button 
                onClick={handleSave} 
                className={`w-full h-16 text-xl font-black rounded-2xl transition-all shadow-2xl active:scale-[0.95] ${saved ? 'bg-green-500 hover:bg-green-600' : 'purple-gradient'}`}
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin ml-2 h-6 w-6" /> : saved ? <Check className="ml-2 h-6 w-6" /> : null}
                {saved ? 'تم الحفظ بنجاح' : 'حفظ المعلومات كاملة'}
              </Button>

              <Button 
                variant="outline"
                onClick={() => setShowLogoutDialog(true)} 
                className="w-full h-14 text-base font-bold rounded-2xl transition-all border-destructive/20 text-destructive hover:bg-destructive/10 hover:border-destructive/30 active:scale-[0.95] flex items-center justify-center gap-2"
              >
                <LogOut className="h-5 w-5" />
                تسجيل الخروج من الحساب
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

      {/* Magic Dialog */}
      <Dialog open={isMagicDialogOpen} onOpenChange={setIsMagicDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader className="text-center p-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-black">تفعيل الألوان المتحركة 🌈✨</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4 text-center">
            <p className="text-sm text-foreground font-bold leading-relaxed bg-primary/10 p-4 rounded-xl border border-primary/20">
              أدخل كود التفعيل <span className="text-primary text-xl font-black">900</span> لفتح اللون المختار وتثبيته على اسمك وتوثيق حسابك.
            </p>
            <div className="bg-muted/30 p-4 rounded-2xl border border-border/40">
              <Input 
                placeholder="---" 
                value={magicCode}
                onChange={(e) => setMagicCode(e.target.value.slice(0, 4))}
                className="text-center font-mono tracking-[1em] h-14 text-2xl focus-visible:ring-primary bg-background border-2"
                type="text"
                inputMode="numeric"
              />
            </div>
            <p className="text-xs text-muted-foreground italic font-medium">بواسطة المطور: أبو وطن</p>
          </div>
          <DialogFooter className="flex flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setIsMagicDialogOpen(false)} className="flex-1 sm:flex-none h-12 rounded-xl">إلغاء</Button>
            <Button onClick={handleUnlockCode} className="flex-1 sm:flex-none h-12 rounded-xl purple-gradient">تأكيد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmingContact} onOpenChange={(open) => !open && setConfirmingContact(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl" dir="rtl">
          <div className="p-8 text-center space-y-6">
            <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center transition-all ${
              confirmingContact?.type === 'remove' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
            }`}>
              {confirmingContact?.type === 'remove' ? <UserMinus className="w-10 h-10" /> : <UserPlus className="w-10 h-10" />}
            </div>
            
            <div className="space-y-2">
              <DialogTitle className="text-2xl font-black">
                {confirmingContact?.type === 'remove' ? 'حذف جهة اتصال' : 'إضافة جهة اتصال'}
              </DialogTitle>
              <p className="text-muted-foreground leading-relaxed">
                {confirmingContact?.type === 'remove' 
                  ? `هل أنت متأكد من حذف ${currentProfile.displayName} من قائمة أصدقائك؟`
                  : `هل تود إضافة ${currentProfile.displayName} إلى قائمة جهات اتصالك؟`
                }
              </p>
            </div>

            <div className="flex gap-4 pt-4">
              <Button 
                variant="ghost" 
                className="flex-1 h-12 rounded-2xl font-bold"
                onClick={() => setConfirmingContact(null)}
              >
                إلغاء
              </Button>
              <Button 
                variant={confirmingContact?.type === 'remove' ? "destructive" : "default"}
                className={`flex-1 h-12 rounded-2xl font-bold ${confirmingContact?.type === 'add' ? 'purple-gradient shadow-lg shadow-purple-500/20' : ''}`}
                onClick={toggleFriend}
                disabled={isUpdatingFriend}
              >
                {isUpdatingFriend ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  confirmingContact?.type === 'remove' ? 'نعم، حذف' : 'تأكيد الإضافة'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl p-0 overflow-hidden border-none shadow-2xl" dir="rtl">
          <div className="p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-full mx-auto bg-destructive/10 flex items-center justify-center text-destructive">
              <LogOut className="w-10 h-10" />
            </div>
            
            <div className="space-y-2">
              <DialogTitle className="text-2xl font-black">تسجيل الخروج</DialogTitle>
              <p className="text-muted-foreground leading-relaxed">
                هل أنت متأكد من رغبتك في تسجيل الخروج؟ ستحتاج إلى إدخال بياناتك مرة أخرى للدخول.
              </p>
            </div>
            
            <div className="flex gap-4 pt-4">
              <Button 
                variant="ghost" 
                className="flex-1 h-12 rounded-2xl font-bold"
                onClick={() => setShowLogoutDialog(false)}
              >
                إلغاء
              </Button>
              <Button 
                variant="destructive"
                className="flex-1 h-12 rounded-2xl font-bold shadow-lg shadow-destructive/20"
                onClick={() => signOut(auth)}
              >
                تأكيد الخروج
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
