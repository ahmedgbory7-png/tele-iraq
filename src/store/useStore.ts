import { create } from 'zustand';
import { User } from 'firebase/auth';
import { UserProfile } from '@/types';
import { Language } from '@/lib/i18n';

interface AppState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  activeChatId: string | null;
  lastChatId: string | null;
  showProfile: boolean;
  showSettings: boolean;
  language: Language;
  configError: string | null;
  globalCall: { chatId: string; callerName: string; type: 'voice' | 'video' } | null;
  notification: { chatId: string; senderName: string; text: string } | null;
  currentTab: 'chats' | 'contacts' | 'settings' | 'profile';
  viewingProfileId: string | null;

  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setActiveChatId: (id: string | null) => void;
  setShowProfile: (show: boolean) => void;
  setShowSettings: (show: boolean) => void;
  setLanguage: (lang: Language) => void;
  setConfigError: (error: string | null) => void;
  setGlobalCall: (call: { chatId: string; callerName: string; type: 'voice' | 'video' } | null) => void;
  setNotification: (notif: { chatId: string; senderName: string; text: string } | null) => void;
  setCurrentTab: (tab: 'chats' | 'contacts' | 'settings' | 'profile') => void;
  setViewingProfileId: (id: string | null) => void;
  
  resetApp: () => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  profile: null,
  loading: true,
  activeChatId: null,
  lastChatId: null,
  showProfile: false,
  showSettings: false,
  language: (localStorage.getItem('app-language') as Language) || 'العربية',
  configError: null,
  globalCall: null,
  notification: null,
  currentTab: 'chats',
  viewingProfileId: null,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setActiveChatId: (activeChatId) => set((state) => ({ 
    activeChatId, 
    lastChatId: activeChatId || state.lastChatId 
  })),
  setShowProfile: (showProfile) => set({ showProfile }),
  setShowSettings: (showSettings) => set({ showSettings }),
  setLanguage: (language) => {
    localStorage.setItem('app-language', language);
    set({ language });
  },
  setConfigError: (configError) => set({ configError }),
  setGlobalCall: (globalCall) => set({ globalCall }),
  setNotification: (notification) => set({ notification }),
  setCurrentTab: (currentTab) => set({ currentTab }),
  setViewingProfileId: (viewingProfileId) => set({ viewingProfileId }),
  
  resetApp: () => set({
    profile: null,
    activeChatId: null,
    showProfile: false,
    showSettings: false,
    loading: false,
    notification: null,
    currentTab: 'chats',
    viewingProfileId: null,
  }),
}));
