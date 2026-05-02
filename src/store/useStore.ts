import { create } from 'zustand';
import { User } from 'firebase/auth';
import { UserProfile, Chat } from '@/types';
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
  quotaExceeded: boolean;
  chats: Chat[];
  appAlert: { id: string; message: string; type: 'info' | 'warning' | 'error' } | null;
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  autoDownloadMedia: boolean;
  lowDataMode: boolean;
  privateChatSound: string;
  groupChatSound: string;
  chatSounds: Record<string, string>;

  dataUsageStats: {
    messagesSent: number;
    messagesReceived: number;
    mediaDownloaded: number;
    mediaUploaded: number;
  };

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
  setQuotaExceeded: (exceeded: boolean) => void;
  setChats: (chats: Chat[]) => void;
  setAppAlert: (alert: { id: string; message: string; type: 'info' | 'warning' | 'error' } | null) => void;
  setFontSize: (size: 'small' | 'medium' | 'large' | 'xlarge') => void;
  setAutoDownloadMedia: (enabled: boolean) => void;
  setLowDataMode: (enabled: boolean) => void;
  setPrivateChatSound: (sound: string) => void;
  setGroupChatSound: (sound: string) => void;
  setChatSound: (chatId: string, sound: string) => void;
  updateDataStats: (stats: Partial<{ messagesSent: number; messagesReceived: number; mediaDownloaded: number; mediaUploaded: number }>) => void;
  resetDataStats: () => void;
  
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
  quotaExceeded: false,
  chats: [],
  appAlert: null,
  fontSize: (localStorage.getItem('app-fontSize') as any) || 'medium',
  autoDownloadMedia: localStorage.getItem('app-autoDownload') !== 'false',
  lowDataMode: localStorage.getItem('app-lowDataMode') === 'true',
  privateChatSound: localStorage.getItem('app-privateChatSound') || 'default',
  groupChatSound: localStorage.getItem('app-groupChatSound') || 'default',
  chatSounds: JSON.parse(localStorage.getItem('app-chatSounds') || '{}'),

  dataUsageStats: JSON.parse(localStorage.getItem('app-data-stats') || '{"messagesSent": 0, "messagesReceived": 0, "mediaDownloaded": 0, "mediaUploaded": 0}'),

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
  setQuotaExceeded: (quotaExceeded) => set({ quotaExceeded }),
  setChats: (chats) => set({ chats }),
  setAppAlert: (appAlert) => set({ appAlert }),
  setFontSize: (fontSize) => {
    localStorage.setItem('app-fontSize', fontSize);
    set({ fontSize });
  },
  setAutoDownloadMedia: (autoDownloadMedia) => {
    localStorage.setItem('app-autoDownload', autoDownloadMedia.toString());
    set({ autoDownloadMedia });
  },
  setLowDataMode: (lowDataMode) => {
    localStorage.setItem('app-lowDataMode', lowDataMode.toString());
    set({ lowDataMode });
  },
  setPrivateChatSound: (privateChatSound) => {
    localStorage.setItem('app-privateChatSound', privateChatSound);
    set({ privateChatSound });
  },
  setGroupChatSound: (groupChatSound) => {
    localStorage.setItem('app-groupChatSound', groupChatSound);
    set({ groupChatSound });
  },
  setChatSound: (chatId, sound) => set((state) => {
    const newChatSounds = { ...state.chatSounds, [chatId]: sound };
    localStorage.setItem('app-chatSounds', JSON.stringify(newChatSounds));
    return { chatSounds: newChatSounds };
  }),
  updateDataStats: (newStats) => set((state) => {
    const updated = {
      messagesSent: state.dataUsageStats.messagesSent + (newStats.messagesSent || 0),
      messagesReceived: state.dataUsageStats.messagesReceived + (newStats.messagesReceived || 0),
      mediaDownloaded: state.dataUsageStats.mediaDownloaded + (newStats.mediaDownloaded || 0),
      mediaUploaded: state.dataUsageStats.mediaUploaded + (newStats.mediaUploaded || 0),
    };
    localStorage.setItem('app-data-stats', JSON.stringify(updated));
    return { dataUsageStats: updated };
  }),
  resetDataStats: () => set(() => {
    const empty = { messagesSent: 0, messagesReceived: 0, mediaDownloaded: 0, mediaUploaded: 0 };
    localStorage.setItem('app-data-stats', JSON.stringify(empty));
    return { dataUsageStats: empty };
  }),
  
  resetApp: () => set({
    profile: null,
    activeChatId: null,
    showProfile: false,
    showSettings: false,
    loading: false,
    notification: null,
    currentTab: 'chats',
    viewingProfileId: null,
    quotaExceeded: false,
    chats: [],
    appAlert: null,
  }),
}));
