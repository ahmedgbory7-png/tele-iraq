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
  Eye,
  Smartphone,
  Key,
  Check,
  Moon,
  Sun,
  Type,
  Image as ImageIcon,
  Plus,
  Volume2
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { doc, updateDoc } from 'firebase/firestore';
import { Language, translations } from '@/lib/i18n';
import { useStore } from '@/store/useStore';
import { NOTIFICATION_SOUNDS, CHAT_BACKGROUND_PATTERNS } from '@/constants';
import { requestNotificationPermission, showSystemNotification } from '@/lib/notifications';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { motion } from 'motion/react';

type SettingsView = 'main' | 'privacy' | 'chats' | 'security' | 'notifications' | 'language' | 'data';

export function Settings() {
  const { 
    profile, 
    setShowSettings, 
    setShowProfile, 
    language, 
    setLanguage: onLanguageChange,
    setCurrentTab
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
  const [view, setView] = useState<SettingsView>('main');
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('app-font-size') || '16px');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [notifications, setNotifications] = useState(() => JSON.parse(localStorage.getItem('app-notifications') || '{"private":true,"groups":true,"calls":true,"privateSound":"default","groupSound":"default"}'));
  const [dataUsage, setDataUsage] = useState(() => JSON.parse(localStorage.getItem('app-data-usage') || '{"autoDownload":true,"lowDataMode":false}'));
  const [isTerminating, setIsTerminating] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(() => (typeof Notification !== 'undefined' ? Notification.permission : 'default'));
  
  const [privacySettings, setPrivacySettings] = useState({
    phoneNumber: profile.privacy?.phoneNumber || t.everyone,
    lastSeen: profile.privacy?.lastSeen || t.everyone,
    photo: profile.privacy?.photo || t.everyone
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-size', fontSize);
    localStorage.setItem('app-font-size', fontSize);
  }, [fontSize]);

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
    const key = type === 'private' ? 'privateSound' : 'groupSound';
    const newNotifs = { ...notifications, [key]: soundId };
    setNotifications(newNotifs);
    localStorage.setItem('app-notifications', JSON.stringify(newNotifs));
    
    // Play preview
    const sound = NOTIFICATION_SOUNDS.find(s => s.id === soundId);
    if (sound) {
      const audio = new Audio(sound.url);
      audio.play().catch(e => console.log("Audio play blocked", e));
    }
  };

  const toggleDataUsage = (key: string) => {
    const newData = { ...dataUsage, [key]: !dataUsage[key] };
    setDataUsage(newData);
    localStorage.setItem('app-data-usage', JSON.stringify(newData));
  };

  const updateChatBackground = async (url: string) => {
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        chatBackground: url
      });
    } catch (err) {
      console.error("Error updating chat background:", err);
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
      setView('main');
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

  const renderMain = () => (
    <div className="flex flex-col h-full bg-background" dir="rtl">
      <div className="glass-header p-4 flex items-center gap-4 safe-top shadow-sm">
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full ios-touch">
          <ArrowRight className={language === 'English' ? 'rotate-180' : ''} />
        </Button>
        <h2 className="text-xl font-bold">{t.settings}</h2>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar overscroll-contain">
        <div className="p-4 space-y-6">
          <motion.div 
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-4 p-4 rounded-3xl bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer ios-touch shadow-inner"
            onClick={onOpenProfile}
          >
            <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-md">
              <AvatarImage src={profile.photoURL} />
              <AvatarFallback className="text-xl text-white font-bold" style={{ backgroundColor: profile.nameColor }}>
                {profile.displayName?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="font-bold text-lg">{profile.displayName}</h3>
              <p className="text-sm text-muted-foreground">{profile.phoneNumber}</p>
            </div>
            <User className="text-primary h-5 w-5" />
          </motion.div>

          <div className="space-y-1">
            <SettingsItem 
              icon={<Eye className="text-blue-500" />} 
              title={t.privacy} 
              description={t.privacy}
              onClick={() => setView('privacy')}
            />
            <SettingsItem 
              icon={<MessageCircle className="text-green-500" />} 
              title={t.chats} 
              description={t.chats}
              onClick={() => setView('chats')}
            />
            <SettingsItem 
              icon={<Bell className="text-red-500" />} 
              title={t.notifications} 
              description={t.notifications}
              onClick={() => setView('notifications')}
            />
            <SettingsItem 
              icon={<Database className="text-orange-500" />} 
              title={t.data} 
              description={t.data}
              onClick={() => setView('data')}
            />
            <SettingsItem 
              icon={<Smartphone className="text-cyan-500" />} 
              title={t.devices} 
              description={t.devices}
              onClick={() => setView('security')}
            />
            <SettingsItem 
              icon={<Globe className="text-purple-500" />} 
              title={t.language} 
              description={language}
              onClick={() => setView('language')}
            />
            <SettingsItem 
              icon={<LogOut className="text-destructive" />} 
              title={t.logout} 
              description={t.logoutConfirm}
              onClick={() => setShowLogoutDialog(true)}
            />
          </div>

          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground">تليعراق للأندرويد v1.0.0</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">صنع بكل حب في العراق 🇮🇶</p>
          </div>
        </div>
      </div>

      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.logout}</DialogTitle>
            <DialogDescription>
              {t.logoutConfirm}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowLogoutDialog(false)}>
              {t.cancel}
            </Button>
            <Button variant="destructive" onClick={() => auth.signOut()}>
              {t.logout}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderPrivacy = () => (
    <SubSettingsView title={t.privacy} onBack={() => setView('main')} language={language}>
      <div className="space-y-6">
        <div className="bg-card rounded-2xl border overflow-hidden">
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
            title={t.photoURL || 'صورة الملف الشخصي'} 
            value={privacySettings.photo} 
            options={[t.everyone, t.myContacts, t.nobody]}
            onChange={(val) => updatePrivacy('photo', val)}
          />
        </div>
      </div>
    </SubSettingsView>
  );

  const renderSecurity = () => (
    <SubSettingsView title={t.devices} onBack={() => setView('main')} language={language}>
      <div className="space-y-6">
        <div className="bg-card rounded-2xl border overflow-hidden p-4">
          <h3 className="font-bold text-primary mb-4">{t.thisDevice}</h3>
          <div className="flex items-center gap-4">
            <Smartphone className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-bold text-sm">جهاز أندرويد (نشط الآن)</p>
              <p className="text-xs text-muted-foreground">بغداد، العراق • تليعراق v1.0.0</p>
            </div>
          </div>
        </div>
        <Button 
          variant="outline" 
          className="w-full rounded-xl h-12 text-destructive border-destructive/20 hover:bg-destructive/10"
          onClick={handleTerminateSessions}
          disabled={isTerminating}
        >
          {isTerminating ? 'جاري الإنهاء...' : t.terminateSessions}
        </Button>
      </div>
    </SubSettingsView>
  );

  const renderLanguage = () => (
    <SubSettingsView title={t.language} onBack={() => setView('main')} language={language}>
      <div className="bg-card rounded-2xl border overflow-hidden">
        {['العربية', 'English', 'Kurdî'].map((lang) => (
          <button
            key={lang}
            onClick={() => onLanguageChange(lang as Language)}
            className="w-full flex items-center justify-between p-4 hover:bg-accent transition-colors border-b last:border-0"
          >
            <span className="font-bold text-sm">{lang}</span>
            {language === lang && <Check className="h-5 w-5 text-primary" />}
          </button>
        ))}
      </div>
    </SubSettingsView>
  );

  const renderNotifications = () => (
    <SubSettingsView title={t.notifications} onBack={() => setView('main')} language={language}>
      <div className="space-y-6">
        <div className="bg-card rounded-2xl border overflow-hidden p-4 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Bell className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">إشعارات النظام</p>
              <p className="text-xs text-muted-foreground">تلقي الإشعارات حتى عندما يكون التطبيق في الخلفية</p>
            </div>
          </div>
          
          <Button 
            variant="ghost"
            className={`w-full rounded-xl h-12 shadow-lg transition-all text-white border-0 ${permissionStatus === 'granted' ? 'green-gradient' : 'purple-gradient'}`}
            onClick={async () => {
              const granted = await requestNotificationPermission();
              setPermissionStatus(granted ? 'granted' : 'denied');
              if (granted) {
                alert('تم تفعيل إشعارات النظام بنجاح! 🔔');
                // Auto-test
                setTimeout(() => {
                  showSystemNotification('تليعراق', { body: 'هذا إشعار تجريبي للتأكد من عمل النظام ✅' });
                }, 2000);
              }
              else alert('يرجى تفعيل الإشعارات من إعدادات المتصفح.');
            }}
          >
            {permissionStatus === 'granted' ? 'الإشعارات مفعلة ✅' : 'تفعيل إشعارات النظام'}
          </Button>

          {permissionStatus === 'granted' && (
            <Button
              variant="outline"
              size="sm"
              className="w-full rounded-xl text-xs"
              onClick={() => {
                showSystemNotification('تجربة الإشعارات', { 
                  body: 'إذا رأيت هذا، فهذا يعني أن الإشعارات تعمل بشكل صحيح! ✨',
                  icon: '/pwa-192x192.png'
                });
                alert('سيتلقى جهازك إشعاراً الآن إذا كان التطبيق في الخلفية.');
              }}
            >
              إرسال إشعار تجريبي
            </Button>
          )}
          <p className="text-[10px] text-center text-muted-foreground px-4">
            هذا الخيار يسمح لك بتلقي تنبيهات من نظام تشغيل جهازك فور وصول رسالة جديدة.
          </p>
        </div>

        <div className="bg-card rounded-2xl border overflow-hidden">
          <div className="p-4 bg-muted/30 border-b">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">إشعارات الرسائل</h3>
          </div>
          
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex-1">
              <p className="font-bold text-sm">المحادثات الخاصة</p>
              <p className="text-xs text-muted-foreground">تنبيهات الرسائل من الأفراد</p>
            </div>
            <Button 
              variant={notifications.private ? "default" : "outline"} 
              size="sm" 
              onClick={() => toggleNotification('private')}
              className="rounded-full min-w-16"
            >
              {notifications.private ? 'مفعل' : 'معطل'}
            </Button>
          </div>

          {notifications.private && (
            <div className="p-4 border-b bg-primary/5 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold">صوت التنبيه (خاص)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_SOUNDS.map(sound => (
                  <Button
                    key={sound.id}
                    variant={notifications.privateSound === sound.id ? "default" : "outline"}
                    size="sm"
                    className="justify-start text-[10px] h-9 gap-2 rounded-xl"
                    onClick={() => updateNotificationSound('private', sound.id)}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${notifications.privateSound === sound.id ? 'bg-white' : 'bg-primary'}`} />
                    {sound.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex-1">
              <p className="font-bold text-sm">المجموعات</p>
              <p className="text-xs text-muted-foreground">تنبيهات الرسائل من المجموعات</p>
            </div>
            <Button 
              variant={notifications.groups ? "default" : "outline"} 
              size="sm" 
              onClick={() => toggleNotification('groups')}
              className="rounded-full min-w-16"
            >
              {notifications.groups ? 'مفعل' : 'معطل'}
            </Button>
          </div>

          {notifications.groups && (
            <div className="p-4 bg-primary/5 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold">صوت التنبيه (المجموعات)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {NOTIFICATION_SOUNDS.map(sound => (
                  <Button
                    key={sound.id}
                    variant={notifications.groupSound === sound.id ? "default" : "outline"}
                    size="sm"
                    className="justify-start text-[10px] h-9 gap-2 rounded-xl"
                    onClick={() => updateNotificationSound('group', sound.id)}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${notifications.groupSound === sound.id ? 'bg-white' : 'bg-primary'}`} />
                    {sound.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl border overflow-hidden">
          <div className="p-4 bg-muted/30 border-b">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">المكالمات</h3>
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex-1">
              <p className="font-bold text-sm">تنبيهات المكالمات</p>
              <p className="text-xs text-muted-foreground">تنبيه للمكالمات الواردة</p>
            </div>
            <Button 
              variant={notifications.calls ? "default" : "outline"} 
              size="sm" 
              onClick={() => toggleNotification('calls')}
              className="rounded-full min-w-16"
            >
              {notifications.calls ? 'مفعل' : 'معطل'}
            </Button>
          </div>
        </div>
      </div>
    </SubSettingsView>
  );

  const renderData = () => (
    <SubSettingsView title={t.data} onBack={() => setView('main')} language={language}>
      <div className="bg-card rounded-2xl border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <p className="font-bold text-sm">{t.autoDownload}</p>
            <p className="text-xs text-muted-foreground">تحميل الصور والفيديو تلقائياً</p>
          </div>
          <Button 
            variant={dataUsage.autoDownload ? "default" : "outline"} 
            size="sm" 
            onClick={() => toggleDataUsage('autoDownload')}
            className="rounded-full"
          >
            {dataUsage.autoDownload ? 'مفعل' : 'معطل'}
          </Button>
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="font-bold text-sm">{t.lowData}</p>
            <p className="text-xs text-muted-foreground">تقليل استهلاك الإنترنت</p>
          </div>
          <Button 
            variant={dataUsage.lowDataMode ? "default" : "outline"} 
            size="sm" 
            onClick={() => toggleDataUsage('lowDataMode')}
            className="rounded-full"
          >
            {dataUsage.lowDataMode ? 'مفعل' : 'معطل'}
          </Button>
        </div>
      </div>
    </SubSettingsView>
  );

  const renderChats = () => (
    <SubSettingsView title={t.chats} onBack={() => setView('main')} language={language}>
      <div className="space-y-6">
        <div className="bg-card rounded-2xl border overflow-hidden p-2">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              {isDarkMode ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
              <span className="font-bold text-sm">{t.darkMode}</span>
            </div>
            <Button 
              variant={isDarkMode ? "default" : "outline"} 
              size="sm" 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="rounded-full"
            >
              {isDarkMode ? 'مفعل' : 'معطل'}
            </Button>
          </div>
          
          <div className="border-t my-2"></div>

          <div className="p-3">
            <div className="flex items-center gap-3 mb-4">
              <Type className="h-5 w-5 text-primary" />
              <span className="font-bold text-sm">{t.fontSize}</span>
            </div>
            <div className="flex gap-2">
              {['14px', '16px', '18px', '20px'].map((size) => (
                <Button
                  key={size}
                  variant={fontSize === size ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFontSize(size)}
                  className="flex-1 rounded-xl"
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          <div className="border-t my-2"></div>

          <div className="p-3">
            <div className="flex items-center gap-3 mb-4">
              <ImageIcon className="h-5 w-5 text-primary" />
              <span className="font-bold text-sm">خلفية الدردشة</span>
            </div>
            
            <input 
              type="file" 
              id="bg-upload" 
              className="hidden" 
              accept="image/*"
              onChange={handleBackgroundUpload}
            />
            
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => document.getElementById('bg-upload')?.click()}
                className="aspect-square rounded-xl bg-muted border-2 border-dashed border-primary/20 flex flex-col items-center justify-center gap-1 hover:bg-primary/5 transition-all text-muted-foreground"
              >
                <Plus className="h-5 w-5" />
                <span className="text-[10px]">رفع صورة</span>
              </button>
              
              {CHAT_BACKGROUND_PATTERNS.map((pattern) => (
                <button
                  key={pattern}
                  onClick={() => updateChatBackground(pattern)}
                  className={`aspect-square rounded-xl border-2 transition-all overflow-hidden relative ${
                    profile.chatBackground === pattern ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'
                  }`}
                  style={{ 
                    backgroundColor: '#f4f4f7',
                    backgroundImage: `url(${pattern})`,
                    backgroundSize: 'auto'
                  }}
                >
                  {profile.chatBackground === pattern && (
                    <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                      <Check className="h-5 w-5 text-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 text-center">اختر نمطاً أو ارفع صورة خاصة لتغيير خلفية المحادثات</p>
          </div>
        </div>
      </div>
    </SubSettingsView>
  );

  return (
    <div className="h-full w-full bg-background animate-in slide-in-from-left duration-300">
      {view === 'main' && renderMain()}
      {view === 'privacy' && renderPrivacy()}
      {view === 'security' && renderSecurity()}
      {view === 'chats' && renderChats()}
      {view === 'language' && renderLanguage()}
      {view === 'notifications' && renderNotifications()}
      {view === 'data' && renderData()}
    </div>
  );
}

function SettingsItem({ icon, title, description, onClick }: { icon: React.ReactNode, title: string, description?: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 rounded-xl hover:bg-accent transition-colors text-right"
    >
      <div className="bg-muted p-2 rounded-lg">
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-bold text-sm">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
    </button>
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

function SubSettingsView({ title, onBack, children, language }: { title: string, onBack: () => void, children: React.ReactNode, language: Language }) {
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
