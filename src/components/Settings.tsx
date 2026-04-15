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
  Type
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { doc, updateDoc } from 'firebase/firestore';
import { Language, translations } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SettingsProps {
  profile: UserProfile;
  onClose: () => void;
  onOpenProfile: () => void;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

type SettingsView = 'main' | 'privacy' | 'chats' | 'security' | 'notifications' | 'language' | 'data';

export function Settings({ profile, onClose, onOpenProfile, language, onLanguageChange }: SettingsProps) {
  const t = translations[language];
  const [view, setView] = useState<SettingsView>('main');
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('app-font-size') || '16px');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [notifications, setNotifications] = useState(() => JSON.parse(localStorage.getItem('app-notifications') || '{"private":true,"groups":true,"calls":true}'));
  const [dataUsage, setDataUsage] = useState(() => JSON.parse(localStorage.getItem('app-data-usage') || '{"autoDownload":true,"lowDataMode":false}'));
  
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

  const toggleDataUsage = (key: string) => {
    const newData = { ...dataUsage, [key]: !dataUsage[key] };
    setDataUsage(newData);
    localStorage.setItem('app-data-usage', JSON.stringify(newData));
  };

  const renderMain = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 flex items-center gap-4 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
          <ArrowRight className={language === 'English' ? 'rotate-180' : ''} />
        </Button>
        <h2 className="text-xl font-bold">{t.settings}</h2>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div 
            className="flex items-center gap-4 p-4 rounded-2xl bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer"
            onClick={onOpenProfile}
          >
            <Avatar className="h-16 w-16 border-2 border-primary/20">
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
          </div>

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
      </ScrollArea>

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
        <Button variant="outline" className="w-full rounded-xl h-12 text-destructive border-destructive/20 hover:bg-destructive/10">
          {t.terminateSessions}
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
      <div className="bg-card rounded-2xl border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <p className="font-bold text-sm">المحادثات الخاصة</p>
            <p className="text-xs text-muted-foreground">تنبيهات الرسائل من الأفراد</p>
          </div>
          <Button 
            variant={notifications.private ? "default" : "outline"} 
            size="sm" 
            onClick={() => toggleNotification('private')}
            className="rounded-full"
          >
            {notifications.private ? 'مفعل' : 'معطل'}
          </Button>
        </div>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <p className="font-bold text-sm">المجموعات</p>
            <p className="text-xs text-muted-foreground">تنبيهات الرسائل من المجموعات</p>
          </div>
          <Button 
            variant={notifications.groups ? "default" : "outline"} 
            size="sm" 
            onClick={() => toggleNotification('groups')}
            className="rounded-full"
          >
            {notifications.groups ? 'مفعل' : 'معطل'}
          </Button>
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
      <ScrollArea className="flex-1">
        <div className="p-4">
          {children}
        </div>
      </ScrollArea>
    </div>
  );
}
