import React, { useState, useEffect } from 'react';
import { auth, db } from '@/firebase';
import { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  ArrowRight, 
  Lock, 
  Shield, 
  MessageCircle, 
  Bell, 
  Database, 
  Globe, 
  LogOut, 
  ChevronLeft,
  User,
  Users,
  Eye,
  Smartphone,
  Key,
  Check,
  Moon,
  Sun,
  Type,
  Image as ImageIcon,
  Plus,
  Volume2,
  Trash2,
  Loader2,
  RotateCcw
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { doc, updateDoc, collection, getDocs, deleteDoc, writeBatch } from 'firebase/firestore';
import { Language, translations } from '@/lib/i18n';
import { useStore } from '@/store/useStore';
import { getNameColorClass, isMagicColor } from '@/lib/utils';
import { NOTIFICATION_SOUNDS, PRESET_GRADIENTS, PRESET_COLORS } from '@/constants';
import { requestNotificationPermission, showSystemNotification } from '@/lib/notifications';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from 'motion/react';

import { DeveloperPanel } from './DeveloperPanel';

type SettingsView = 'main' | 'privacy' | 'chats' | 'security' | 'notifications' | 'language' | 'data';

export function Settings() {
  const { 
    user,
    profile, 
    setShowSettings, 
    setShowProfile, 
    language, 
    setLanguage: onLanguageChange,
    setCurrentTab,
    fontSize,
    setFontSize,
    autoDownloadMedia,
    setAutoDownloadMedia,
    lowDataMode,
    setLowDataMode,
    privateChatSound,
    setPrivateChatSound,
    groupChatSound,
    setGroupChatSound,
    quotaExceeded,
    dataUsageStats
  } = useStore();

  if (!profile) return null;

  const onClose = () => {
    setShowSettings(false);
    setCurrentTab('chats');
  };
  const onOpenProfile = () => {
    setCurrentTab('profile');
  };
  const t = translations[language];
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [notifications, setNotifications] = useState(() => JSON.parse(localStorage.getItem('app-notifications') || '{"private":true,"groups":true,"calls":true,"privateSound":"default","groupSound":"default"}'));
  const [dataUsage, setDataUsage] = useState(() => JSON.parse(localStorage.getItem('app-data-usage') || '{"autoDownload":true,"lowDataMode":false}'));
  const [isTerminating, setIsTerminating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'));
  const [privacySettings, setPrivacySettings] = useState(() => profile.privacy || { phoneNumber: translations[language].everyone, lastSeen: translations[language].everyone, photo: translations[language].everyone });
  const [activeTab, setActiveTab] = useState('appearance');
  const [isClearingCache, setIsClearingCache] = useState(false);

  const isDeveloperUser = profile.isDeveloper || user?.email === 'isofiq@teleiraq.app';

  const handleClearCache = () => {
    if (!window.confirm((t as any).clearCache + '؟')) return;
    setIsClearingCache(true);
    setTimeout(() => {
      // Clear specific cache items
      const keysToKeep = [`session_${profile?.uid}`, 'app-language', 'firebase-auth-token'];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && !keysToKeep.some(k => key.includes(k))) {
          localStorage.removeItem(key);
        }
      }
      setIsClearingCache(false);
      alert('تم مسح التخزين المؤقت بنجاح ✅');
    }, 1000);
  };

  const resetSystem = async () => {
    if (!window.confirm('⚠️ تنبيه هام: هل أنت متأكد من تصفير النظام بالكامل؟ سيتم مسح جميع المستخدمين والمحادثات نهائياً!')) return;
    if (!window.confirm('تأكيد أخير: هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟')) return;

    setIsResetting(true);
    try {
      // Delete users
      const usersSnap = await getDocs(collection(db, 'users'));
      const batch = writeBatch(db);
      usersSnap.forEach((d) => batch.delete(d.ref));
      
      // Delete chats
      const chatsSnap = await getDocs(collection(db, 'chats'));
      for (const cd of chatsSnap.docs) {
        // Delete messages subcollection
        const msgsSnap = await getDocs(collection(db, 'chats', cd.id, 'messages'));
        const mBatch = writeBatch(db);
        msgsSnap.forEach(m => mBatch.delete(m.ref));
        await mBatch.commit();
        batch.delete(cd.ref);
      }

      // Delete Reels
      const reelsSnap = await getDocs(collection(db, 'reels'));
      reelsSnap.forEach(d => batch.delete(d.ref));

      // Delete Games
      const gamesSnap = await getDocs(collection(db, 'games'));
      gamesSnap.forEach(d => batch.delete(d.ref));
      
      await batch.commit();
      alert('تم تصفير النظام ومسح جميع البيانات بنجاح. سيتم تسجيل خروجك الآن.');
      auth.signOut();
    } catch (err) {
      console.error("Reset error:", err);
      alert('حدث خطأ أثناء تصفير النظام. ربما تجاوزت حدود الكوتا.');
    } finally {
      setIsResetting(false);
    }
  };

  const updatePrivacy = async (key: string, value: string) => {
    const newSettings = { ...privacySettings, [key]: value };
    setPrivacySettings(newSettings);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        privacy: newSettings
      });
    } catch (err) {
      console.error("Error updating privacy:", err);
    }
  };

  const toggleNotification = (key: string) => {
    const newNotifs = { ...notifications, [key]: !notifications[key] };
    setNotifications(newNotifs);
    localStorage.setItem('app-notifications', JSON.stringify(newNotifs));
  };

  const updateNotificationSound = (type: 'private' | 'group', soundId: string) => {
    if (type === 'private') {
      setPrivateChatSound(soundId);
    } else {
      setGroupChatSound(soundId);
    }
    
    // Play preview
    let sound = NOTIFICATION_SOUNDS.find(s => s.id === soundId);
    let url = sound?.url;
    
    if (!sound && soundId?.includes('data:audio')) {
      url = soundId;
    }

    if (url) {
      const audio = new Audio(url);
      audio.play().catch(e => console.log("Audio play blocked", e));
    }
  };

  const handleCustomSoundUpload = (type: 'private' | 'group', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) {
        alert('الملف كبير جداً. يرجى اختيار ملف أقل من 500 كيلو بايت.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        updateNotificationSound(type, reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleDataUsage = (key: string) => {
    const newData = { ...dataUsage, [key]: !dataUsage[key] };
    setDataUsage(newData);
    localStorage.setItem('app-data-usage', JSON.stringify(newData));
  };

  const updateChatBackground = async (url: string) => {
    try {
      // Optimistic update for better UX
      const newProfile = { ...profile, chatBackground: url };
      useStore.getState().setProfile(newProfile);

      await updateDoc(doc(db, 'users', profile.uid), {
        chatBackground: url
      });
    } catch (err) {
      console.error("Error updating chat background:", err);
      // Revert if failed
      useStore.getState().setProfile(profile);
      alert('فشل تحديث الخلفية. يرجى التأكد من اتصالك بالإنترنت.');
    }
  };

  const handleTerminateSessions = async () => {
    if (!profile) return;
    if (!window.confirm('هل تريد فعلاً إنهاء جميع الجلسات الأخرى؟ سيتم تسجيل الخروج من كل الأجهزة ما عدا هذا الجهاز.')) return;

    setIsTerminating(true);
    try {
      const newVersion = Date.now();
      // 1. Update Firestore
      await updateDoc(doc(db, 'users', profile.uid), {
        sessionVersion: newVersion
      });
      // 2. Update LocalStorage so THIS device stays logged in
      localStorage.setItem(`session_${profile.uid}`, newVersion.toString());
      
      alert('تم إنهاء جميع الجلسات الأخرى بنجاح.');
    } catch (err) {
      console.error("Error terminating sessions:", err);
      alert('حدث خطأ أثناء محاولة إنهاء الجلسات.');
    } finally {
      setIsTerminating(false);
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateChatBackground(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogout = () => {
    setShowLogoutDialog(true);
  };

  return (
    <div className="flex flex-col h-full bg-background" dir={language === 'English' ? 'ltr' : 'rtl'}>
      {/* Header */}
      <div className="glass-header p-4 flex items-center gap-4 safe-top shadow-sm shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full ios-touch">
          <ArrowRight className={language === 'العربية' ? '' : 'rotate-180'} />
        </Button>
        <h2 className="text-xl font-bold">{t.settings}</h2>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Profile Card Summary */}
        <div className="p-4 shrink-0">
          <motion.div 
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-4 p-4 rounded-3xl bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer ios-touch shadow-inner"
            onClick={onOpenProfile}
          >
            <Avatar className="h-14 w-14 border-2 border-primary/20 shadow-md">
              <AvatarImage src={profile.photoURL || undefined} />
              <AvatarFallback className="text-xl text-white font-bold" style={{ backgroundColor: profile.nameColor }}>
                {(profile.displayName?.slice(0, 2) || '').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className={`font-bold text-base ${getNameColorClass(profile.nameColor)}`} style={{ color: isMagicColor(profile.nameColor) ? undefined : (profile.nameColor || 'inherit') }}>
                {profile.displayName}
              </h3>
              <p className="text-xs text-muted-foreground">{profile.phoneNumber}</p>
            </div>
            <User className="text-primary h-5 w-5 opacity-40" />
          </motion.div>
        </div>

        {/* Tabs Organization */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 border-b">
            <TabsList className="w-full bg-transparent h-12 gap-1 overflow-x-auto no-scrollbar justify-start p-0">
              <TabsTrigger value="appearance" className="px-5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl h-9 text-xs font-bold gap-2">
                <Sun className="w-4 h-4" /> {(t as any).appearance}
              </TabsTrigger>
              <TabsTrigger value="privacy" className="px-5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl h-9 text-xs font-bold gap-2">
                <Shield className="w-4 h-4" /> {(t as any).privacyTab}
              </TabsTrigger>
              <TabsTrigger value="notifications" className="px-5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl h-9 text-xs font-bold gap-2">
                <Bell className="w-4 h-4" /> {(t as any).notificationsTab}
              </TabsTrigger>
              <TabsTrigger value="data" className="px-5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl h-9 text-xs font-bold gap-2">
                <Database className="w-4 h-4" /> {(t as any).dataUsage}
              </TabsTrigger>
              <TabsTrigger value="advanced" className="px-5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-xl h-9 text-xs font-bold gap-2">
                <Smartphone className="w-4 h-4" /> {(t as any).advanced}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar pb-24 overscroll-contain">
            <TabsContent value="appearance" className="m-0 p-4 space-y-6">
              <div className="bg-card rounded-2xl border p-4 space-y-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isDarkMode ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
                    <span className="font-bold text-sm">{t.darkMode}</span>
                  </div>
                  <Button 
                    variant={isDarkMode ? "default" : "outline"} 
                    size="sm" 
                    onClick={() => setIsDarkMode(!isDarkMode)}
                    className="rounded-full h-8"
                  >
                    {isDarkMode ? 'مفعل' : 'معطل'}
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Type className="h-5 w-5 text-primary" />
                    <span className="font-bold text-sm">{t.fontSize}</span>
                  </div>
                  <div className="flex gap-2">
                    {[
                      { id: 'small', label: 'صغير' },
                      { id: 'medium', label: 'عادي' },
                      { id: 'large', label: 'كبير' },
                      { id: 'xlarge', label: 'كبير جداً' }
                    ].map((size) => (
                      <Button
                        key={size.id}
                        variant={fontSize === size.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFontSize(size.id as any)}
                        className="flex-1 rounded-xl h-9 text-[11px]"
                      >
                        {size.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-3">
                    <ImageIcon className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <span className="font-bold text-sm">{(t as any).chatBackground}</span>
                      <p className="text-[10px] text-muted-foreground">{language === 'English' ? 'Choose pattern, gradient or photos' : 'اختر نمطاً، تدرجاً أو صوراً خاصة'}</p>
                    </div>
                    {(profile.chatBackground) && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-[10px] rounded-lg text-destructive hover:bg-destructive/10"
                        onClick={() => updateChatBackground('')}
                      >
                        إزالة الخلفية
                      </Button>
                    )}
                  </div>
                  
                  <input type="file" id="bg-upload-tabs" className="hidden" accept="image/*" onChange={handleBackgroundUpload} />
                  
                  <div className="space-y-4">
                    {/* Presets Grid */}
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={() => document.getElementById('bg-upload-tabs')?.click()}
                        className="aspect-square rounded-xl bg-muted border-2 border-dashed border-primary/20 flex flex-col items-center justify-center gap-1 hover:bg-primary/5 text-muted-foreground transition-all"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="text-[8px]">رفع صورة</span>
                      </button>
                    </div>

                    {/* Gradients */}
                    <div className="grid grid-cols-5 gap-2">
                      {PRESET_GRADIENTS.map((gradient, i) => (
                        <button
                          key={`gradient-${i}`}
                          onClick={() => updateChatBackground(gradient)}
                          className={`aspect-square rounded-xl transition-all relative shadow-sm ${profile.chatBackground === gradient ? 'ring-2 ring-primary ring-offset-2 scale-95' : 'hover:scale-105'}`}
                          style={{ background: gradient }}
                        >
                          {profile.chatBackground === gradient && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Check className="h-4 w-4 text-white drop-shadow-md" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Colors */}
                    <div className="grid grid-cols-5 gap-2">
                      {PRESET_COLORS.map((color, i) => (
                        <button
                          key={`color-${i}`}
                          onClick={() => updateChatBackground(color)}
                          className={`aspect-square rounded-xl transition-all relative border shadow-sm ${profile.chatBackground === color ? 'ring-2 ring-primary ring-offset-2 scale-95' : 'hover:scale-105'}`}
                          style={{ backgroundColor: color }}
                        >
                          {profile.chatBackground === color && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Check className={`h-4 w-4 drop-shadow-md ${['#f0f2f5', '#e3f2fd', '#f1f8e9', '#fff3e0', '#f3e5f5', '#e0f2f1', '#efebe9'].includes(color) ? 'text-primary' : 'text-white'}`} />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="privacy" className="m-0 p-4">
              <div className="bg-card rounded-2xl border shadow-sm divide-y">
                <ToggleItem 
                  title={t.phoneNumber} 
                  value={privacySettings.phoneNumber} 
                  options={[t.everyone, t.myContacts, t.nobody]}
                  onChange={(val) => updatePrivacy('phoneNumber', val)}
                />
                <ToggleItem 
                  title={t.lastSeen} 
                  value={privacySettings.lastSeen} 
                  options={[t.everyone, t.myContacts, t.nobody]}
                  onChange={(val) => updatePrivacy('lastSeen', val)}
                />
                <ToggleItem 
                  title={'صورة الملف الشخصي'} 
                  value={privacySettings.photo} 
                  options={[t.everyone, t.myContacts, t.nobody]}
                  onChange={(val) => updatePrivacy('photo', val)}
                />
              </div>
            </TabsContent>

            <TabsContent value="notifications" className="m-0 p-4 space-y-4">
              <div className="bg-card rounded-2xl border p-4 space-y-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-sm">إشعارات النظام</p>
                    <p className="text-[10px] text-muted-foreground">تنبيهات فورية على جهازك</p>
                  </div>
                  <Button 
                    variant={permissionStatus === 'granted' ? "outline" : "default"}
                    size="sm"
                    className="h-8 rounded-lg text-[10px]"
                    onClick={async () => {
                      const granted = await requestNotificationPermission();
                      setPermissionStatus(granted ? 'granted' : 'denied');
                      if (granted) alert('تم التفعيل ✅');
                    }}
                  >
                    {permissionStatus === 'granted' ? 'مفعلة' : 'تفعيل'}
                  </Button>
                </div>
              </div>

              <div className="bg-card rounded-2xl border shadow-sm divide-y">
                <div className="flex items-center justify-between p-4">
                  <p className="font-bold text-sm">المحادثات الخاصة</p>
                  <Button size="sm" variant={notifications.private ? "default" : "outline"} onClick={() => toggleNotification('private')} className="rounded-full h-8 px-4">
                    {notifications.private ? 'مفعل' : 'معطل'}
                  </Button>
                </div>
                <div className="flex items-center justify-between p-4">
                  <p className="font-bold text-sm">المجموعات</p>
                  <Button size="sm" variant={notifications.groups ? "default" : "outline"} onClick={() => toggleNotification('groups')} className="rounded-full h-8 px-4">
                    {notifications.groups ? 'مفعل' : 'معطل'}
                  </Button>
                </div>
                <div className="flex items-center justify-between p-4">
                  <p className="font-bold text-sm">المكالمات</p>
                  <Button size="sm" variant={notifications.calls ? "default" : "outline"} onClick={() => toggleNotification('calls')} className="rounded-full h-8 px-4">
                    {notifications.calls ? 'مفعل' : 'معطل'}
                  </Button>
                </div>

                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                      <Volume2 className="w-3 h-3" /> نغمة الرسائل الخاصة
                    </p>
                    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-2">
                      {NOTIFICATION_SOUNDS.map((s) => (
                        <Button
                          key={s.id}
                          variant={privateChatSound === s.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateNotificationSound('private', s.id)}
                          className="rounded-xl h-8 text-[10px] whitespace-nowrap shrink-0"
                        >
                          {s.name}
                        </Button>
                      ))}
                      <Button
                        variant={privateChatSound?.includes('data:audio') ? "default" : "outline"}
                        size="sm"
                        onClick={() => document.getElementById('custom-sound-private')?.click()}
                        className="rounded-xl h-8 text-[10px] whitespace-nowrap shrink-0 border-dashed"
                      >
                        {privateChatSound?.includes('data:audio') ? 'نغمة مخصصة' : '+ مخصص'}
                      </Button>
                      <input 
                        type="file" 
                        id="custom-sound-private" 
                        className="hidden" 
                        accept="audio/*" 
                        onChange={(e) => handleCustomSoundUpload('private', e)} 
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                      <Volume2 className="w-3 h-3" /> نغمة المجموعات
                    </p>
                    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-2">
                      {NOTIFICATION_SOUNDS.map((s) => (
                        <Button
                          key={s.id}
                          variant={groupChatSound === s.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => updateNotificationSound('group', s.id)}
                          className="rounded-xl h-8 text-[10px] whitespace-nowrap shrink-0"
                        >
                          {s.name}
                        </Button>
                      ))}
                      <Button
                        variant={groupChatSound?.includes('data:audio') ? "default" : "outline"}
                        size="sm"
                        onClick={() => document.getElementById('custom-sound-group')?.click()}
                        className="rounded-xl h-8 text-[10px] whitespace-nowrap shrink-0 border-dashed"
                      >
                        {groupChatSound?.includes('data:audio') ? 'نغمة مخصصة' : '+ مخصص'}
                      </Button>
                      <input 
                        type="file" 
                        id="custom-sound-group" 
                        className="hidden" 
                        accept="audio/*" 
                        onChange={(e) => handleCustomSoundUpload('group', e)} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="data" className="m-0 p-4 space-y-6">
              {/* Quota Status */}
              <div className={`p-4 rounded-2xl border flex items-center gap-4 ${quotaExceeded ? 'bg-destructive/10 border-destructive/20' : 'bg-green-500/10 border-green-500/20'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${quotaExceeded ? 'bg-destructive/20 text-destructive' : 'bg-green-500/20 text-green-500'}`}>
                  <Shield className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">{(t as any).quotaStatus}</p>
                  <p className={`text-[10px] font-medium ${quotaExceeded ? 'text-destructive' : 'text-green-600'}`}>
                    {quotaExceeded ? (t as any).quotaFull : (t as any).quotaOk}
                  </p>
                </div>
              </div>

              {/* Data Settings */}
              <div className="bg-card rounded-2xl border shadow-sm divide-y overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm">{(t as any).autoDownloadMedia}</p>
                    <p className="text-[10px] text-muted-foreground">تحميل الصور والمقاطع عند فتح المحادثة</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant={autoDownloadMedia ? "default" : "outline"} 
                    onClick={() => setAutoDownloadMedia(!autoDownloadMedia)} 
                    className="rounded-full h-8 px-4"
                  >
                    {autoDownloadMedia ? 'مفعل' : 'معطل'}
                  </Button>
                </div>
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-sm">{(t as any).lowData}</p>
                    <p className="text-[10px] text-muted-foreground">تقليل جودة الصور لتوفير البيانات</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant={lowDataMode ? "default" : "outline"} 
                    onClick={() => setLowDataMode(!lowDataMode)} 
                    className="rounded-full h-8 px-4"
                  >
                    {lowDataMode ? 'مفعل' : 'معطل'}
                  </Button>
                </div>
              </div>

              {/* Enhanced Data Management */}
              <div className="bg-card rounded-2xl border shadow-sm divide-y overflow-hidden">
                <div className="px-4 py-3 bg-muted/20 border-b flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider">إحصائيات استخدام البيانات</span>
                </div>
                
                <div className="p-4 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">الرسائل المرسلة</p>
                    <p className="text-lg font-black text-primary">{(dataUsageStats.messagesSent).toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">الرسائل المستلمة</p>
                    <p className="text-lg font-black text-primary">{(dataUsageStats.messagesReceived).toLocaleString()}</p>
                  </div>
                  <div className="space-y-1 border-t pt-2">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">بيانات الوسائط الواردة</p>
                    <p className="text-lg font-black text-primary">{Math.floor(dataUsageStats.mediaDownloaded / 1024)} MB</p>
                  </div>
                  <div className="space-y-1 border-t pt-2">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">بيانات الوسائط الصادرة</p>
                    <p className="text-lg font-black text-primary">{Math.floor(dataUsageStats.mediaUploaded / 1024)} MB</p>
                  </div>
                </div>

                <div className="p-4 flex flex-col gap-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    يتم تخزين هذه البيانات محلياً على جهازك. مسح التخزين المؤقت سيؤدي إلى تصفير الصور المصغرة المحفوظة فقط ولن يؤثر على سجل الرسائل في تلي عراق.
                  </p>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-[10px] text-muted-foreground hover:text-destructive self-end flex items-center gap-1"
                    onClick={() => {
                       if (confirm('هل أنت متأكد من إعادة تعيين جميع إحصائيات البيانات؟')) {
                         const { resetDataStats } = useStore.getState();
                         resetDataStats();
                       }
                    }}
                  >
                    <RotateCcw className="w-3 h-3" /> إعادة تعيين الإحصائيات
                  </Button>
                </div>
              </div>

              {/* Cache Management */}
              <div className="bg-card rounded-2xl border shadow-sm p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-bold text-sm">{(t as any).clearCache}</p>
                    <p className="text-[10px] text-muted-foreground">{(t as any).clearCacheDesc}</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full rounded-xl h-11 font-bold text-destructive hover:bg-destructive/10" 
                  onClick={handleClearCache}
                  disabled={isClearingCache}
                >
                  {isClearingCache ? <Loader2 className="animate-spin h-4 w-4" /> : 'مسح ذاكرة التخزين المؤقت'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="m-0 p-4 space-y-6">
              {/* Language Selection */}
              <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-muted/20 border-b flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider">{t.language}</span>
                </div>
                <div className="divide-y">
                  {['العربية', 'English', 'Kurdî'].map((lang) => (
                    <button key={lang} onClick={() => onLanguageChange(lang as Language)} className="w-full flex items-center justify-between p-4 hover:bg-accent transition-colors">
                      <span className="font-bold text-sm">{lang}</span>
                      {language === lang && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sessions */}
              <div className="bg-card rounded-2xl border shadow-sm divide-y overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Smartphone className="w-5 h-5 text-primary" />
                    <div>
                      <p className="font-bold text-sm">الجلسات والأجهزة</p>
                      <p className="text-[10px] text-muted-foreground">إدارة الأجهزة المتصلة بحسابك</p>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive h-8 px-4 font-bold" onClick={handleTerminateSessions} disabled={isTerminating}>
                    {isTerminating ? '...' : 'إنهاء الجلسات الأخرى'}
                  </Button>
                </div>
              </div>

              {/* Logout & Developer */}
              <div className="space-y-4 pt-4">
                {isDeveloperUser && (
                  <div className="p-4 border-2 border-dashed border-primary/30 rounded-3xl bg-primary/5 space-y-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
                         <Shield className="w-5 h-5 shadow-sm" />
                      </div>
                      <div>
                        <p className="text-sm font-black tracking-tight">إدارة النظام (المطور)</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">تلي عراق - تحكم كامل</p>
                      </div>
                    </div>
                    <Button 
                      onClick={() => setShowDevPanel(true)}
                      className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold gap-2 shadow-lg active:scale-95 transition-all"
                    >
                      <Users className="w-4 h-4" />
                      فتح لوحة إدارة المستخدمين
                    </Button>
                  </div>
                )}

                <Button variant="ghost" className="w-full h-12 rounded-2xl text-destructive hover:bg-destructive/10 gap-3 font-bold justify-start px-6" onClick={handleLogout}>
                  <LogOut className="h-5 w-5" />
                  تسجيل الخروج
                </Button>

                {(user?.email === 'ahmedgbory7@gmail.com' || user?.email === 'isofiq@teleiraq.app') && (
                  <div className="p-4 mt-4 border-2 border-dashed border-destructive/20 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-destructive" />
                      <span className="text-[10px] font-black uppercase text-destructive tracking-widest">إدارة النظام</span>
                    </div>
                    <Button variant="destructive" className="w-full h-11 rounded-xl gap-2 font-bold shadow-lg" onClick={resetSystem} disabled={isResetting}>
                      {isResetting ? <Loader2 className="animate-spin h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                      تصفير النظام بالكامل
                    </Button>
                  </div>
                )}
              </div>

              <div className="text-center py-6">
                <p className="text-[10px] text-muted-foreground">تلي عراق للأندرويد v1.0.0</p>
                <p className="text-[9px] text-muted-foreground/60 mt-1 uppercase tracking-[0.2em]">صنع في العراق 🇮🇶</p>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.logout}</DialogTitle>
            <DialogDescription>
              {t.logoutConfirm}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowLogoutDialog(false)} className="flex-1">
              {t.cancel}
            </Button>
            <Button variant="destructive" onClick={() => auth.signOut()} className="flex-1">
              {t.logout}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDevPanel} onOpenChange={setShowDevPanel}>
        <DialogContent className="max-w-2xl h-[90vh] p-0 overflow-hidden border-none shadow-2xl">
          <DeveloperPanel onClose={() => setShowDevPanel(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToggleItem({ title, value, options, onChange }: { title: string, value: string, options: string[], onChange: (val: string) => void }) {
  return (
    <div className="border-b last:border-0 p-4">
      <p className="font-bold text-sm mb-3">{title}</p>
      <div className="flex gap-2">
        {options.map((opt) => (
          <Button
            key={opt}
            variant={value === opt ? "default" : "ghost"}
            size="sm"
            onClick={() => onChange(opt)}
            className="flex-1 rounded-lg text-xs"
          >
            {opt}
            {value === opt && <Check className="mr-1 h-3 w-3" />}
          </Button>
        ))}
      </div>
    </div>
  );
}

function SubSettingsView({ title, onBack, children, language, isSubView }: { title: string, onBack: () => void, children: React.ReactNode, language: Language, isSubView?: boolean }) {
  return (
    <div className="flex flex-col h-full animate-in slide-in-from-left duration-200">
      <div className="p-4 flex items-center gap-4 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
          <ArrowRight className={language === 'English' ? 'rotate-180' : ''} />
        </Button>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
