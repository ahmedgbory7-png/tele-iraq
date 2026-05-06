import React, { useState, useEffect } from 'react';
import { auth, db } from '@/firebase';
import { doc, updateDoc, getDoc, query, collection, where, getDocs, addDoc, serverTimestamp, orderBy, onSnapshot, deleteDoc, increment, writeBatch, arrayUnion, arrayRemove, deleteField, limit } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowRight, Camera, Check, Loader2, Lock, Plus, Trash2, Play, MessageSquare, User, BadgeCheck, UserPlus, UserMinus, Palette, LogOut, LayoutDashboard, CreditCard, Smartphone, ShoppingBag } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from 'motion/react';
import { format, isToday, isYesterday } from 'date-fns';
import { ar } from 'date-fns/locale';

import { useStore } from '@/store/useStore';
import { getNameColorClass, isMagicColor } from '@/lib/utils';

export function Profile() {
  const { profile, setProfile, setShowProfile, setShowSettings, setCurrentTab, viewingProfileId, setViewingProfileId, setActiveChatId, language, setQuotaExceeded, quotaExceeded, setShowUserDashboard } = useStore();
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [isOtherProfileLoading, setIsOtherProfileLoading] = useState(false);
  const [isUpdatingFriend, setIsUpdatingFriend] = useState(false);
  const [confirmingContact, setConfirmingContact] = useState<{ type: 'add' | 'remove' } | null>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false);
  const [purchaseMethod, setPurchaseMethod] = useState<'list' | 'zain' | 'qi'>('list');
  const [selectedColorToBuy, setSelectedColorToBuy] = useState<string | null>(null);
  const [purchaseScreenshot, setPurchaseScreenshot] = useState<string | null>(null);
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);

  const MAGIC_COLORS_FOR_PURCHASE = [
    { name: 'لون كربوني 🖤', value: 'animated-carbon', class: 'bg-zinc-800' },
    { name: 'بنفسجي سحري 🔮', value: 'animated-purple', class: 'bg-purple-600' },
    { name: 'قوس قزح 🌈', value: 'animated-rainbow', class: 'bg-gradient-to-r from-red-500 via-green-500 to-blue-500' },
    { name: 'اصفر فسفوري متحرك ⚡', value: 'animated-neon-yellow', class: 'bg-yellow-400 shadow-[0_0_15px_rgba(255,255,0,0.5)]' },
    { name: 'ناري 🔥', value: 'animated-fire', class: 'bg-orange-600' },
    { name: 'احمر متحرك فسفوري 🍓', value: 'animated-neon-red', class: 'bg-red-500 shadow-[0_0_15px_rgba(255,0,0,0.5)]' },
    { name: 'الذهبي الملكي 👑', value: 'animated-gold', class: 'bg-amber-500' },
    { name: 'الفضي اللامع 🥈', value: 'animated-silver', class: 'bg-zinc-400' },
    { name: 'الأزرق المتحرك 💎', value: 'animated-blue', class: 'bg-blue-500' },
    { name: 'الأخضر المتحرك 🐍', value: 'animated-green', class: 'bg-green-500' },
    { name: 'الأحمر المتحرك 🍎', value: 'animated-red', class: 'bg-red-500' },
    { name: 'اللون السحري ✨', value: 'magic', class: 'bg-gradient-to-br from-purple-500 to-pink-500' },
    { name: 'نيون برتقالي 🍊', value: 'magic_neon', class: 'bg-orange-500' },
    { name: 'أحمر أزرق 🔴🔵', value: 'magic_rb', class: 'bg-gradient-to-r from-red-500 to-blue-500' },
    { name: 'وردي أسود 💗🖤', value: 'magic_pb', class: 'bg-gradient-to-r from-pink-500 to-zinc-950' },
    { name: 'العراقي الأصيل 🇮🇶', value: 'magic_iraq', class: 'bg-red-600' },
    { name: 'العراقي الفسفوري 🇮🇶⚡', value: 'magic_iraq_phosphor', class: 'bg-red-500 shadow-[0_0_10px_rgba(255,0,0,0.4)]' },
    { name: 'نيون متحرك برتقالي 🟠', value: 'magic_neon_orange_moving', class: 'bg-orange-400' },
    { name: 'نيون متحرك أخضر 🟢', value: 'magic_neon_green_moving', class: 'bg-green-400' },
    { name: 'أحمر أصفر متحرك 🔴🟡', value: 'magic_red_yellow_moving', class: 'bg-gradient-to-r from-red-500 to-yellow-500' },
    { name: 'فسفوري متحرك 🕯️', value: 'magic_phosphor_moving', class: 'bg-zinc-200' },
  ];

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 950 * 1024) {
        alert('الصورة كبيرة جداً. الحد الأقصى هو 1 ميجابايت.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPurchaseScreenshot(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendPurchaseRequest = async () => {
    if (!purchaseScreenshot) {
      alert('يرجى إرفاق صورة الشاشة (سكرين شاشة) لتوثيق التحويل.');
      return;
    }

    if (!profile) return;

    setIsSubmittingPurchase(true);
    try {
      // 1. Find ISOFIQ's UID
      const usersRef = collection(db, 'users');
      const qUser = query(usersRef, where('email', '==', 'isofiq@teleiraq.app'), limit(1));
      const userSnap = await getDocs(qUser);
      
      if (userSnap.empty) {
        throw new Error("ISOFIQ account not found");
      }
      
      const isofiqUser = userSnap.docs[0];
      const isofiqUid = isofiqUser.id;
      const isofiqData = isofiqUser.data();
      
      // 2. Find or create chat with ISOFIQ
      const chatsRef = collection(db, 'chats');
      const qChat = query(
        chatsRef,
        where('participants', 'array-contains', profile.uid)
      );
      const chatSnap = await getDocs(qChat);
      const existingChat = chatSnap.docs.find(d => {
        const parts = d.data().participants as string[];
        return parts.includes(isofiqUid);
      });
      
      let chatId: string;
      
      if (!existingChat) {
        // Create new chat
        const participants = [profile.uid, isofiqUid];
        const participantProfiles = {
          [profile.uid]: {
            displayName: profile.displayName || 'مستخدم',
            photoURL: profile.photoURL || '',
            nameColor: profile.nameColor || '',
            isVerified: !!profile.isVerified,
            phoneNumber: profile.phoneNumber || ''
          },
          [isofiqUid]: {
            displayName: isofiqData.displayName || 'ISOFIQ',
            photoURL: isofiqData.photoURL || '',
            nameColor: isofiqData.nameColor || '',
            isVerified: true
          }
        };
        
        const docRef = await addDoc(chatsRef, {
          participants,
          participantProfiles,
          updatedAt: serverTimestamp(),
          lastMessage: {
            text: 'بدأت محادثة جديدة',
            senderId: profile.uid,
            createdAt: serverTimestamp()
          }
        });
        chatId = docRef.id;
      } else {
        chatId = existingChat.id;
      }
      
      // 3. Send the message with screenshot details
      const colorName = MAGIC_COLORS_FOR_PURCHASE.find(c => c.value === selectedColorToBuy)?.name || 'غير محدد';
      const methodName = purchaseMethod === 'zain' ? 'زين كاش' : 'الكي كارد';

      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId: chatId,
        text: `📦 طلب تفعيل لون سحري (${methodName})\nاللون المطلوب: ${colorName}\nالاسم: ${profile.displayName}\nالمعرف: @${(profile as any).username || 'N/A'}\nالرقم: ${profile.phoneNumber || 'N/A'}\nUID: ${profile.uid}`,
        type: 'purchase_notice',
        senderId: profile.uid,
        createdAt: serverTimestamp()
      });

      // Send the screenshot as a separate message (image message)
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        chatId: chatId,
        text: '📸 سكرين شاشة توثيق الشراء',
        fileUrl: purchaseScreenshot,
        senderId: profile.uid,
        createdAt: serverTimestamp(),
        type: 'image'
      });
      
      // Update chat last message
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: {
          text: '✅ تم إرسال طلب شراء الألوان',
          senderId: profile.uid,
          createdAt: serverTimestamp()
        },
        updatedAt: serverTimestamp()
      });

      alert('✅ تم إرسال طلبك بنجاح إلى ISOFIQ. سيتم التفعيل قريباً!');
      setShowPurchaseDialog(false);
      setPurchaseMethod('list');
      setPurchaseScreenshot(null);
      setSelectedColorToBuy(null);
    } catch (err) {
      console.error("Purchase submission error:", err);
      alert('❌ فشل إرسال الطلب. يرجى المحاولة مرة أخرى أو التواصل عبر الواتساب.');
    } finally {
      setIsSubmittingPurchase(false);
    }
  };

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
          setSpecialColorExpiry(data.specialColorExpiry || null);
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
      setSpecialColorExpiry(profile.specialColorExpiry || null);
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
  const [specialColorExpiry, setSpecialColorExpiry] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

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

  const propagateProfileUpdate = async (userData: Partial<UserProfile>) => {
    if (!profile?.uid) return;
    try {
      const chatsQ = query(
        collection(db, 'chats'), 
        where('participants', 'array-contains', profile.uid),
        orderBy('updatedAt', 'desc'),
        limit(20)
      );
      const chatsSnap = await getDocs(chatsQ);
      const batch = writeBatch(db);
      
      const isVerifiedStatus = userData.isVerified !== undefined ? userData.isVerified : (isVerified || false);

      chatsSnap.docs.forEach(d => {
        batch.update(d.ref, {
          [`participantProfiles.${profile.uid}`]: {
            displayName: userData.displayName || displayName || profile.displayName || 'مستخدم',
            photoURL: userData.photoURL || photoURL || profile.photoURL || '',
            nameColor: userData.nameColor || nameColor || profile.nameColor || '',
            isVerified: isVerifiedStatus,
            phoneNumber: profile.phoneNumber || '',
            specialColorExpiry: userData.specialColorExpiry || specialColorExpiry || null
          }
        });
      });

      if (chatsSnap.size > 0) await batch.commit();
    } catch (err) {
      console.error("Error propagating profile update:", err);
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
    <div className="flex flex-col h-full bg-background overflow-y-auto no-scrollbar scroll-smooth" dir="rtl">
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
            <h1 className={`text-3xl font-bold tracking-tight flex items-center gap-1.5 ${getNameColorClass(nameColor, specialColorExpiry)}`} 
              style={{ color: isMagicColor(nameColor, specialColorExpiry) ? undefined : (nameColor || 'white') }}
            >
              {displayName || 'مستخدم تلي عراق'}
              {isVerified ? (
                <BadgeCheck className="w-6 h-6 text-blue-500 fill-blue-500/10" />
              ) : null}
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
                          {isVerified && (
                            <BadgeCheck className="w-6 h-6 text-blue-500 fill-blue-500/20 shrink-0" />
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
                onClick={() => setShowPurchaseDialog(true)} 
                className="w-full h-14 text-base font-black rounded-2xl transition-all border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 active:scale-[0.95] flex items-center justify-center gap-2 mb-2"
              >
                <ShoppingBag className="h-6 w-6" />
                طريقة شراء الألوان السحرية
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
      
      {/* Purchase Options Dialog */}
      <Dialog open={showPurchaseDialog} onOpenChange={(open) => {
        setShowPurchaseDialog(open);
        if (!open) {
          setPurchaseMethod('list');
          setPurchaseScreenshot(null);
          setSelectedColorToBuy(null);
        }
      }}>
        <DialogContent className="sm:max-w-[450px] rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-zinc-950 flex flex-col max-h-[90vh] md:max-h-[85vh]" dir="rtl">
          <div className="p-8 space-y-6 overflow-y-auto no-scrollbar flex-1 touch-pan-y">
            <div className="relative shrink-0 flex flex-col items-center justify-center pt-2">
              <div className={`w-24 h-24 rounded-full bg-white/5 border-2 border-dashed border-white/10 flex flex-col items-center justify-center transition-all duration-500 ${selectedColorToBuy ? 'border-primary/50' : ''}`}>
                {selectedColorToBuy ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className={`text-2xl font-black ${getNameColorClass(selectedColorToBuy)}`}>
                       {profile?.displayName?.split(' ')[0] || 'اسمك'}
                    </span>
                    <BadgeCheck className={`w-5 h-5 ${getNameColorClass(selectedColorToBuy)}`} />
                  </div>
                ) : (
                  <ShoppingBag className="w-12 h-12 text-primary/50" />
                )}
              </div>

              {purchaseMethod !== 'list' && (
                <button 
                  onClick={() => {
                    setPurchaseMethod('list');
                    setPurchaseScreenshot(null);
                  }}
                  className="absolute top-0 right-0 bg-zinc-900 border border-white/10 rounded-full p-2 text-white hover:bg-white/10 transition-colors shadow-lg"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
              )}
              
              {selectedColorToBuy && (
                <div className="mt-4 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest">معاينة اللون المختار</span>
                </div>
              )}
            </div>
            
            {purchaseMethod === 'list' ? (
              <div className="space-y-6 pb-2">
                <div className="space-y-2 text-center">
                  <DialogTitle className="text-2xl font-black text-white">متجر الألوان السحرية</DialogTitle>
                  <p className="text-muted-foreground font-bold text-sm">
                    اختر اللون الذي يمثل هويتك وانطلق بتميز
                  </p>
                </div>

                {/* Step 1: Select Color */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-white pr-2 border-r-4 border-primary/50 h-5 flex items-center">1. اختر اللون السحري:</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {MAGIC_COLORS_FOR_PURCHASE.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setSelectedColorToBuy(c.value)}
                        className={`p-4 rounded-3xl border transition-all flex flex-col items-center gap-2 group relative overflow-hidden ${selectedColorToBuy === c.value ? 'bg-primary/20 border-primary shadow-[0_0_20px_rgba(139,92,246,0.2)]' : 'bg-white/5 border-white/10 hover:border-white/20'}`}
                      >
                        {selectedColorToBuy === c.value && (
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
                        )}
                        <div className={`w-10 h-10 rounded-full shrink-0 shadow-lg ${c.class} transition-transform duration-300 group-hover:scale-110`} />
                        <span className="text-[11px] font-black text-white truncate text-center">{c.name}</span>
                        {selectedColorToBuy === c.value && (
                          <div className="absolute top-2 right-2">
                            <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                               <Check className="w-2.5 h-2.5 text-white" />
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Step 2: Select Method */}
                <div className={`space-y-4 transition-all duration-500 transform ${!selectedColorToBuy ? 'opacity-30 pointer-events-none grayscale translate-y-4' : 'translate-y-0'}`}>
                  <h3 className="text-sm font-black text-white pr-2 border-r-4 border-primary/50 h-5 flex items-center">2. اختر وسيلة الدفع:</h3>
                  <div 
                    onClick={() => setPurchaseMethod('zain')}
                    className="p-4 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-4 group hover:bg-white/10 transition-all cursor-pointer hover:border-primary/50"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <div className="flex-1 shrink-0">
                      <h4 className="font-black text-white">زين كاش (Zain Cash)</h4>
                      <p className="text-[10px] text-muted-foreground font-bold">تحويل مباشر إلى محفظة التطبيق</p>
                    </div>
                    <div className="bg-primary/20 px-3 py-1 rounded-lg border border-primary/30">
                       <span className="text-xs font-black text-primary">متاح</span>
                    </div>
                  </div>

                  <div 
                    onClick={() => setPurchaseMethod('qi')}
                    className="p-4 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-4 group hover:bg-white/10 transition-all cursor-pointer hover:border-blue-500/50"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-500 shrink-0">
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div className="flex-1 shrink-0">
                      <h4 className="font-black text-white">كي كارد الرافدين (Qi Card)</h4>
                      <p className="text-[10px] text-muted-foreground font-bold">الدفع عبر بطاقات الكي كارد والماستر كارد</p>
                    </div>
                    <div className="bg-blue-500/20 px-3 py-1 rounded-lg border border-blue-500/30">
                       <span className="text-xs font-black text-blue-500">متاح</span>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/10 p-5 rounded-[2rem] border border-primary/20 space-y-3 text-center">
                  <p className="text-xs font-black text-primary leading-relaxed">
                    لإتمام عملية الشراء والحصول على الكود الخاص بك، يرجى التواصل مع الإدارة
                  </p>
                  <Button 
                    className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-black gap-2 shadow-lg"
                    onClick={() => window.open('https://wa.me/9647745121483', '_blank')}
                  >
                    تواصل عبر واتساب
                  </Button>
                </div>
              </div>
            ) : (purchaseMethod === 'zain' || purchaseMethod === 'qi') ? (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <h3 className="text-2xl font-black text-white">
                    {purchaseMethod === 'zain' ? 'التحويل عبر زين كاش' : 'التحويل عبر الكي كارد'}
                  </h3>
                  <p className="text-muted-foreground font-bold text-sm">
                    قم بالتحويل على هذا الرقم لطلب تفعيل اللون
                  </p>
                </div>

                <div className="bg-primary/10 p-6 rounded-[2rem] border-2 border-dashed border-primary/30 flex flex-col items-center gap-2">
                  <span className="text-3xl font-black text-primary tracking-widest">07745121483</span>
                  <p className="text-xs font-bold text-primary/70 italic text-center">باسم: أبو وطن</p>
                </div>

                <div className="space-y-4">
                  <label className="block text-sm font-black text-white text-right pr-2">إرفاق سكرين شاشة (توثيق الشراء):</label>
                  <div 
                    onClick={() => document.getElementById('screenshot-upload')?.click()}
                    className={`h-32 rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2 cursor-pointer overflow-hidden ${purchaseScreenshot ? 'border-primary bg-primary/5' : 'border-white/10 hover:border-primary/50 bg-white/5'}`}
                  >
                    {purchaseScreenshot ? (
                      <img src={purchaseScreenshot} className="w-full h-full object-cover" alt="Screenshot" />
                    ) : (
                      <>
                        <Plus className="w-8 h-8 text-muted-foreground" />
                        <span className="text-xs font-bold text-muted-foreground">اضغط هنا لإدراج الصورة</span>
                      </>
                    )}
                  </div>
                  <input 
                    id="screenshot-upload"
                    type="file" 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleScreenshotChange} 
                  />
                </div>

                <Button 
                  onClick={handleSendPurchaseRequest}
                  disabled={!purchaseScreenshot || isSubmittingPurchase}
                  className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black text-lg gap-2 shadow-xl shadow-primary/20 active:scale-[0.98] transition-all"
                >
                  {isSubmittingPurchase ? <Loader2 className="w-6 h-6 animate-spin" /> : <ShoppingBag className="w-6 h-6" />}
                  {purchaseMethod === 'qi' ? 'طباعة طلب التفعيل' : 'إرسال طلب التفعيل'}
                </Button>
              </div>
            ) : null}
            
            <Button 
              variant="ghost" 
              className="w-full h-12 rounded-2xl font-bold text-white/50 shrink-0"
              onClick={() => {
                if (purchaseMethod !== 'list') {
                  setPurchaseMethod('list');
                  setPurchaseScreenshot(null);
                } else {
                  setShowPurchaseDialog(false);
                }
              }}
            >
              إغلاق
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
