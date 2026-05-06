import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, limit, getDocs, doc, getDoc, updateDoc, setDoc, orderBy, where, serverTimestamp, Timestamp, writeBatch, increment, getCountFromServer, addDoc } from 'firebase/firestore';
import { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Users, 
  ShieldAlert, 
  ShieldCheck, 
  LogOut, 
  Star, 
  Search, 
  Loader2, 
  X,
  UserCheck,
  Palette,
  Ban,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  LayoutDashboard,
  ArrowRight,
  UserPlus,
  RefreshCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getNameColorClass, isMagicColor } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStore } from '@/store/useStore';

interface UserManagementDashboardProps {
  onClose: () => void;
}

const MAGIC_COLORS = [
  { name: 'إزالة كافة الألوان ❌', value: 'none' },
  { name: 'لون كربوني 🖤', value: 'animated-carbon' },
  { name: 'بنفسجي سحري 🔮', value: 'animated-purple' },
  { name: 'قوس قزح 🌈', value: 'animated-rainbow' },
  { name: 'ناري 🔥', value: 'animated-fire' },
  { name: 'اصفر فسفوري متحرك ⚡', value: 'animated-neon-yellow' },
  { name: 'احمر متحرك فسفوري 🍓', value: 'animated-neon-red' },
  { name: 'الذهبي الملكي 👑', value: 'animated-gold' },
  { name: 'الفضي اللامع 🥈', value: 'animated-silver' },
  { name: 'الأزرق المتحرك 💎', value: 'animated-blue' },
  { name: 'الأخضر المتحرك 🐍', value: 'animated-green' },
  { name: 'الأحمر المتحرك 🍎', value: 'animated-red' },
  { name: 'اللون السحري ✨', value: 'magic' },
  { name: 'نيون برتقالي 🍊', value: 'magic_neon' },
  { name: 'أحمر أزرق 🔴🔵', value: 'magic_rb' },
  { name: 'وردي أسود 💗🖤', value: 'magic_pb' },
  { name: 'العراقي الأصيل 🇮🇶', value: 'magic_iraq' },
  { name: 'العراقي الفسفوري 🇮🇶⚡', value: 'magic_iraq_phosphor' },
  { name: 'نيون متحرك برتقالي 🟠', value: 'magic_neon_orange_moving' },
  { name: 'نيون متحرك أخضر 🟢', value: 'magic_neon_green_moving' },
  { name: 'أحمر أصفر متحرك 🔴🟡', value: 'magic_red_yellow_moving' },
  { name: 'فسفوري متحرك 🕯️', value: 'magic_phosphor_moving' }
];

export function UserManagementDashboard({ onClose }: UserManagementDashboardProps) {
  const { quotaExceeded, setQuotaExceeded } = useStore();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'banned' | 'vip' | 'admins'>('all');
  const [stats, setStats] = useState({ total: 0, banned: 0, vip: 0 });
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expiryDialogOpen, setExpiryDialogOpen] = useState(false);
  const [selectedUserForColor, setSelectedUserForColor] = useState<{ uid: string, color: string } | null>(null);
  const [expiryDays, setExpiryDays] = useState('30');
  const [confirmResetColor, setConfirmResetColor] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchStats = async () => {
    if (quotaExceeded) return;
    
    // Cache check: only fetch if not fetched in the last 10 minutes
    const state = useStore.getState();
    if (state.cachedStats && (Date.now() - state.lastStatsFetch < 600000)) {
      setStats(state.cachedStats);
      return;
    }

    try {
      const coll = collection(db, 'users');
      
      const totalCount = await getCountFromServer(query(coll, limit(1000)));
      const bannedCount = await getCountFromServer(query(coll, where('isBanned', '==', true), limit(1000)));
      const vipCount = await getCountFromServer(query(coll, where('specialColor', '!=', null), limit(1000)));

      const newStats = {
        total: totalCount.data().count,
        banned: bannedCount.data().count,
        vip: vipCount.data().count
      };
      
      setStats(newStats);
      (state as any).setCachedStats(newStats);
    } catch (e: any) {
      console.error("Fetch stats error:", e);
      if (e.code === 'resource-exhausted' || e.message?.includes('quota')) setQuotaExceeded(true);
    }
  };

  const fetchUsers = async () => {
    if (quotaExceeded) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(40));
      if (activeTab === 'banned') q = query(collection(db, 'users'), where('isBanned', '==', true), limit(40));
      if (activeTab === 'vip') q = query(collection(db, 'users'), where('specialColor', '!=', null), limit(40));
      if (activeTab === 'admins') q = query(collection(db, 'users'), where('isDeveloper', '==', true), limit(40));

      const snapshot = await getDocs(q);
      setUsers(snapshot.docs.map(d => ({ ...d.data(), uid: d.id } as UserProfile)));
    } catch (error: any) {
      console.error("Fetch users error:", error);
      if (error.code === 'resource-exhausted' || error.message?.includes('quota')) setQuotaExceeded(true);
      showToast('⚠️ خطأ في جلب البيانات (Quota?)');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (debouncedSearch.trim()) {
      handleSearch();
    } else {
      fetchUsers();
    }
  }, [debouncedSearch, activeTab]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleSearch = async () => {
    const term = debouncedSearch.trim();
    if (!term) return;
    if (quotaExceeded) {
      showToast('⚠️ الحصة اليومية مستنفدة (Quota)');
      return;
    }
    setLoading(true);
    try {
      const resultsMap = new Map<string, UserProfile>();
      
      // 1. Exact UID search (very efficient)
      if (term.length > 20) {
        try {
          const d = await getDoc(doc(db, 'users', term));
          if (d.exists()) resultsMap.set(d.id, { ...d.data(), uid: d.id } as UserProfile);
        } catch (e) {}
      }

      // 2. Name search (Prefix search)
      // Try original search
      const qName = query(
        collection(db, 'users'), 
        where('displayName', '>=', term), 
        where('displayName', '<=', term + '\uf8ff'), 
        limit(50)
      );
      const sName = await getDocs(qName);
      sName.forEach(d => resultsMap.set(d.id, { ...d.data(), uid: d.id } as UserProfile));

      // 3. Phone search - clean it up
      const cleanPhone = term.replace(/\D/g, '');
      if (cleanPhone.length >= 3) {
        const qPhone = query(
          collection(db, 'users'), 
          where('phoneNumber', '>=', cleanPhone), 
          where('phoneNumber', '<=', cleanPhone + '\uf8ff'), 
          limit(20)
        );
        const sPhone = await getDocs(qPhone);
        sPhone.forEach(d => resultsMap.set(d.id, { ...d.data(), uid: d.id } as UserProfile));
      }

      setUsers(Array.from(resultsMap.values()).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
      if (resultsMap.size === 0 && term.length > 2) showToast('🔍 لم يتم العثور على نتائج');
    } catch (e: any) {
       console.error("Search error:", e);
       if (e.code === 'resource-exhausted' || e.message?.includes('quota')) {
         setQuotaExceeded(true);
         showToast('⚠️ الحصة اليومية مستنفدة (Quota)');
       }
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (uid: string, data: Partial<UserProfile>) => {
    setActionLoading(uid);
    try {
      await updateDoc(doc(db, 'users', uid), data);

      // Support basic propagation for significant profile changes
      const significantFields = ['displayName', 'photoURL', 'nameColor', 'isVerified'];
      const hasSignificantChange = Object.keys(data).some(k => significantFields.includes(k));
      
      if (hasSignificantChange) {
        try {
          const chatsQ = query(
            collection(db, 'chats'), 
            where('participants', 'array-contains', uid),
            orderBy('updatedAt', 'desc'),
            limit(10)
          );
          const chatsSnap = await getDocs(chatsQ);
          const batch = writeBatch(db);
          
          chatsSnap.docs.forEach(d => {
            const updates: any = {};
            if (data.displayName) updates[`participantProfiles.${uid}.displayName`] = data.displayName;
            if (data.photoURL) updates[`participantProfiles.${uid}.photoURL`] = data.photoURL;
            if (data.nameColor) updates[`participantProfiles.${uid}.nameColor`] = data.nameColor;
            if (data.isVerified !== undefined) updates[`participantProfiles.${uid}.isVerified`] = data.isVerified;
            
            batch.update(d.ref, updates);
          });
          if (chatsSnap.size > 0) await batch.commit();
        } catch (propErr: any) {
          console.error("Propagation error:", propErr);
        }
      }

      setUsers(prev => prev.map(u => u.uid === uid ? { ...u, ...data } : u));
      if (selectedUser?.uid === uid) setSelectedUser(prev => prev ? { ...prev, ...data } : null);
      showToast('✅ تم التحديث بنجاح');
    } catch (e: any) {
      console.error("Action error:", e);
      if (e.code === 'resource-exhausted') setQuotaExceeded(true);
      showToast('❌ فشل الإجراء (Quota?)');
    } finally {
      setActionLoading(null);
    }
  };

  const handleColorAction = (uid: string, color: string) => {
    if (!color) {
      setConfirmResetColor(uid);
      return;
    }
    setSelectedUserForColor({ uid, color });
    setExpiryDialogOpen(true);
  };

  const performColorUpdate = async (userId: string, color: string, days: number) => {
    if (!userId || typeof userId !== 'string') {
      console.error("performColorUpdate error: valid userId is required", userId);
      showToast('❌ خطأ: معرف المستخدم غير صالح');
      return;
    }

    const colorName = color === 'none' ? 'إزالة اللون' : (MAGIC_COLORS.find(c => c.value === color)?.name || 'لون مخصص');
    const isRemoval = color === 'none' || color === '';

    setActionLoading(userId);
    try {
      console.log(`Starting color update for user ${userId} to color ${color || 'reset'} for ${days} days`);
      
      const expiryDate = days > 0 ? Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000) : null;
      
      const updateData: any = {
        specialColor: isRemoval ? null : color,
        nameColor: isRemoval ? '#8b5cf6' : color,
        specialColorExpiry: isRemoval ? null : expiryDate,
        isVerified: !isRemoval,
        verifiedAt: !isRemoval ? serverTimestamp() : null
      };
      
      console.log("Updating user document...");
      await updateDoc(doc(db, 'users', userId), updateData);
      
      // Send support message if granted a color
      if (!isRemoval) {
        await sendSupportMessage(userId, `تم منحك اللون السحري (${colorName}) لمدة ${days === 9999 ? 'أبدية' : days + ' يوم'} بنجاح! شكراً لاستخدامك تلي عراق ✨`);
      }

      try {
        console.log("Starting propagation to chats...");
        const chatsQ = query(
          collection(db, 'chats'), 
          where('participants', 'array-contains', userId),
          limit(20)
        );
        const chatsSnap = await getDocs(chatsQ);
        const batch = writeBatch(db);
        
        console.log(`Found ${chatsSnap.size} chats to update`);
        chatsSnap.docs.forEach(d => {
          const updates: any = {};
          updates[`participantProfiles.${userId}.nameColor`] = isRemoval ? '#8b5cf6' : color;
          updates[`participantProfiles.${userId}.specialColor`] = isRemoval ? null : color;
          updates[`participantProfiles.${userId}.isVerified`] = !isRemoval;
          updates[`participantProfiles.${userId}.specialColorExpiry`] = isRemoval ? null : expiryDate;
          
          batch.update(d.ref, updates);
        });
        
        if (chatsSnap.size > 0) {
          await batch.commit();
          console.log("Batch commit successful");
        }
      } catch (propErr: any) {
        console.error("Propagation error:", propErr);
      }
      
      setUsers(prev => prev.map(u => u.uid === userId ? { 
        ...u, 
        ...updateData,
        verifiedAt: !isRemoval ? new Date() : null 
      } : u));
      
      if (selectedUser?.uid === userId) {
        setSelectedUser(prev => prev ? { 
          ...prev, 
          ...updateData,
          verifiedAt: (color && color !== 'none') ? new Date() : undefined
        } : null);
      }
      
      showToast((color && color !== 'none') ? `✅ تم منح اللون لمدة ${days} يوم` : '✅ تم إعادة ضبط اللون');
      setExpiryDialogOpen(false);
      setSelectedUserForColor(null);
    } catch (e: any) {
      console.error("Full color update error object:", e);
      if (e.code === 'resource-exhausted') setQuotaExceeded(true);
      showToast('❌ فشل تحديث اللون');
    } finally {
      setActionLoading(null);
    }
  };

  const sendSupportMessage = async (targetUid: string, text: string) => {
    try {
      const supportUid = 'teleiraq-system';
      const participants = [supportUid, targetUid].sort();
      const chatId = participants.join('_');
      
      const chatRef = doc(db, 'chats', chatId);
      const chatSnap = await getDoc(chatRef);

      const messageData = {
        text,
        senderId: supportUid,
        createdAt: serverTimestamp(),
        type: 'text'
      };

      if (!chatSnap.exists()) {
        await setDoc(chatRef, {
          participants,
          isGroup: false,
          updatedAt: serverTimestamp(),
          lastMessage: messageData,
          unreadCount: { [targetUid]: 1, [supportUid]: 0 },
          participantProfiles: {
            [supportUid]: {
              displayName: 'تلي عراق - الدعم الفني',
              photoURL: '/logo.png', // or system logo
              nameColor: '#8b5cf6',
              isVerified: true,
              isSystem: true
            }
          }
        });
      } else {
        await updateDoc(chatRef, {
          updatedAt: serverTimestamp(),
          lastMessage: messageData,
          [`unreadCount.${targetUid}`]: increment(1)
        });
      }

      await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);
    } catch (err) {
      console.error("Error sending support message:", err);
    }
  };

  const handleConfirmExpiry = () => {
    if (!selectedUserForColor) return;
    const days = parseInt(expiryDays) || 30;
    performColorUpdate(selectedUserForColor.uid, selectedUserForColor.color, days);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950 flex flex-col font-sans overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-900/50 backdrop-blur-3xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shadow-2xl">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">صفحة إدارة المستخدمين</h2>
            <p className="text-[10px] text-primary font-black uppercase tracking-widest leading-none mt-1">اللوحة المركزية للمطور</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              fetchStats();
              fetchUsers();
              showToast('🔄 جاري تحديث البيانات...');
            }} 
            className="rounded-full w-12 h-12 bg-white/5 hover:bg-white/10 text-primary transition-all mr-2"
          >
            <RefreshCcw className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full w-12 h-12 bg-white/5 hover:bg-white/10 text-white transition-all">
            <X className="w-6 h-6" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
        <div className="max-w-6xl mx-auto p-6 space-y-8">
          
          {/* Quota Notice */}
          {quotaExceeded && (
            <div className="p-6 rounded-[2rem] bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center gap-4 animate-in slide-in-from-top duration-500">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <div>
                <p className="font-black text-lg">⚠️ تحذير: تم استنفاد الحصة المجانية</p>
                <p className="text-xs font-bold opacity-80">تم الوصول للحد الأقصى لعمليات القراءة/الكتابة لهذا اليوم. سيتم إعادة ضبط الحصة تلقائياً غداً.</p>
              </div>
            </div>
          )}

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-in fade-in duration-700">
            {[
              { label: 'المستخدمين', count: stats.total, icon: Users, color: 'blue' },
              { label: 'المحظورين', count: stats.banned, icon: Ban, color: 'red' },
              { label: 'أعضاء VIP', count: stats.vip, icon: Star, color: 'amber' }
            ].map(s => (
              <div key={s.label} className="p-6 rounded-[2rem] bg-zinc-900/40 border border-white/5 flex items-center gap-5 hover:bg-zinc-900/60 transition-all group">
                <div className={`w-14 h-14 rounded-2xl bg-${s.color}-500/10 flex items-center justify-center text-${s.color}-500 group-hover:scale-110 transition-transform`}>
                  <s.icon className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-2xl font-black text-white">{s.count}</p>
                  <p className="text-xs text-muted-foreground font-bold">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Search & Tabs */}
          <div className="space-y-4">
            <div className="relative group">
              <Search className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                placeholder="ابحث بقوة المطور (UID, اسم, رقم)..."
                className="h-16 pr-14 rounded-[1.5rem] bg-zinc-900/80 border-white/10 focus:border-primary/50 text-lg font-bold text-white shadow-2xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button 
                onClick={handleSearch}
                className="absolute left-2 top-2 bottom-2 rounded-xl h-auto px-6 font-black"
              >
                بحث عميق
              </Button>
            </div>

            <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
              {[
                { id: 'all', label: 'الكل', icon: Users },
                { id: 'vip', label: 'المميزين (VIP)', icon: Star },
                { id: 'banned', label: 'المحظورين', icon: Ban },
                { id: 'admins', label: 'فريق العمل', icon: ShieldCheck }
              ].map(tab => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'outline'}
                  className={`h-11 rounded-2xl px-6 font-black shrink-0 transition-all ${activeTab === tab.id ? 'bg-primary border-none shadow-lg' : 'bg-transparent border-white/10 text-muted-foreground hover:text-white'}`}
                  onClick={() => setActiveTab(tab.id as any)}
                >
                  <tab.icon className="w-4 h-4 ml-2" />
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>

          {/* User List Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              <div className="col-span-full py-40 flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-muted-foreground font-black animate-pulse">جاري فحص قاعدة البيانات...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="col-span-full py-40 text-center bg-zinc-900/20 border border-dashed border-white/5 rounded-[3rem]">
                <ShieldAlert className="w-16 h-16 text-muted/20 mx-auto mb-4" />
                <p className="text-muted-foreground font-black italic">لا يوجد شيء هنا للمسح الضوئي</p>
              </div>
            ) : (
              users.map(u => (
                <motion.div 
                  layout
                  key={u.uid}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 rounded-[2.5rem] bg-zinc-900/60 border border-white/5 hover:border-primary/20 transition-all flex flex-col gap-5 relative overflow-hidden group shadow-xl"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-2 border-white/5 shadow-2xl">
                      <AvatarImage src={u.photoURL} />
                      <AvatarFallback style={{ backgroundColor: u.nameColor }} className="text-white text-xl font-black">
                        {u.displayName?.slice(0,2) || ''}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h3 className={`text-lg font-black truncate ${getNameColorClass(u.specialColor || u.nameColor, u.specialColorExpiry)}`}>
                        {u.displayName}
                      </h3>
                      <p className="text-[10px] text-muted-foreground font-mono opacity-50 truncate">{u.uid}</p>
                      <div className="flex gap-2 mt-1">
                        {u.isVerified && <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/20"><Star className="w-2.5 h-2.5 text-blue-500 fill-blue-500" /></div>}
                        {u.isBanned && <span className="text-[8px] font-black bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full border border-red-500/20">BANNED</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                     <p className="text-[10px] bg-white/5 text-muted-foreground px-3 py-1 rounded-full font-bold">{u.phoneNumber || 'لا يوجد رقم'}</p>
                     <p className="text-[10px] bg-primary/10 text-primary px-3 py-1 rounded-full font-bold">Role: {u.isDeveloper ? 'Admin' : 'User'}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Button 
                      variant="outline" 
                      className={`h-10 rounded-xl text-[10px] font-black border-white/10 bg-primary/20 text-primary hover:bg-primary/30 flex items-center justify-center gap-1.5 transition-all shadow-sm ${u.specialColor ? 'ring-2 ring-primary ring-offset-2 ring-offset-zinc-950' : ''}`}
                      onClick={() => {
                        setSelectedUserForColor({ uid: u.uid, color: '' });
                        setExpiryDialogOpen(true);
                      }}
                    >
                      <Palette className="w-3.5 h-3.5" />
                      {u.specialColor ? 'تعديل اللون ✨' : 'منح لون سحري ✨'}
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-10 rounded-xl text-[10px] font-black border-white/5 hover:bg-zinc-800 transition-all text-white"
                      onClick={() => setSelectedUser(u)}
                    >
                      إدارة الحساب
                    </Button>
                    <Button 
                      variant={u.isBanned ? 'destructive' : 'outline'} 
                      className={`h-10 rounded-xl text-[10px] font-black transition-all col-span-2 ${!u.isBanned ? 'border-red-500/10 text-red-500 bg-red-500/5 hover:bg-red-500/20' : ''}`}
                      onClick={() => handleAction(u.uid, { isBanned: !u.isBanned })}
                      disabled={u.isDeveloper}
                    >
                      {u.isBanned ? 'إلغاء الحظر' : 'حظر الحساب'}
                    </Button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Advanced Action Modal */}
      <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
        <DialogContent className="max-w-md w-[95%] rounded-[3rem] bg-zinc-950 border-white/10 text-right font-sans p-7 overflow-y-auto no-scrollbar max-h-[85vh]" dir="rtl">
          {selectedUser && (
            <div className="space-y-6">
              <div className="flex items-center gap-5 p-5 rounded-[2rem] bg-white/5 border border-white/5">
                <Avatar className="h-20 w-20 shadow-2xl">
                  <AvatarImage src={selectedUser.photoURL} />
                  <AvatarFallback style={{ backgroundColor: selectedUser.nameColor }}>{selectedUser.displayName?.slice(0,2) || ''}</AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="text-xl font-black text-white">{selectedUser.displayName}</h2>
                  <p className="text-xs text-muted-foreground font-bold mb-2">{selectedUser.phoneNumber || selectedUser.email || 'بدون تفاصيل اتصال'}</p>
                  <div className="flex gap-2">
                    <span className="text-[9px] bg-primary/20 text-primary px-3 py-1 rounded-full font-black uppercase tracking-tighter">
                      ID: {selectedUser.uid}
                    </span>
                    {selectedUser.specialColor && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-500 px-3 py-1 rounded-full font-black">
                        نشط حالياً: {MAGIC_COLORS.find(c => c.value === selectedUser.specialColor)?.name || 'لون مخصص'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-black text-white/50 pr-2 flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4" />
                   التحكم في الرتبة والتوثيق
                </h4>
                <div className="grid grid-cols-2 gap-3">
                   <Button 
                     variant="outline" 
                     className={`h-14 rounded-2xl font-black gap-2 transition-all ${selectedUser.isVerified ? 'border-primary text-primary bg-primary/5' : 'border-white/10 text-muted-foreground'}`}
                     onClick={() => handleAction(selectedUser.uid, { isVerified: !selectedUser.isVerified, verifiedAt: !selectedUser.isVerified ? serverTimestamp() : null })}
                   >
                     <ShieldCheck className="w-4 h-4" />
                     {selectedUser.isVerified ? 'موثق' : 'غير موثق'}
                   </Button>

                   <Button 
                     variant="outline" 
                     className={`h-14 rounded-2xl font-black gap-2 transition-all ${selectedUser.isDeveloper ? 'border-red-500 text-red-500 bg-red-500/5' : 'border-white/10 text-muted-foreground'}`}
                     onClick={() => handleAction(selectedUser.uid, { isDeveloper: !selectedUser.isDeveloper })}
                   >
                     <ShieldAlert className="w-4 h-4" />
                     {selectedUser.isDeveloper ? 'مسؤؤل' : 'عادي'}
                   </Button>
                </div>

                <div className="p-1 rounded-[2.5rem] bg-primary/5 border border-primary/20 overflow-hidden">
                  <Button 
                    variant="ghost" 
                    className="w-full h-16 rounded-[2rem] font-black gap-3 bg-primary text-white hover:bg-primary/90 shadow-xl"
                    onClick={() => {
                      setSelectedUserForColor({ uid: selectedUser.uid, color: '' });
                      setExpiryDialogOpen(true);
                      setSelectedUser(null);
                    }}
                  >
                    <Palette className="w-6 h-6" />
                    منح لون سحري (مدة محددة) ✨
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                 <Button 
                   variant="outline" 
                   className="h-14 rounded-2xl font-black gap-2 text-orange-500 border-orange-500/20"
                   onClick={() => handleAction(selectedUser.uid, { forceLogoutSignal: Date.now() })}
                 >
                   <LogOut className="w-4 h-4" />
                   طرد الجلسة
                 </Button>
                 <Button 
                   variant="destructive" 
                   className="h-14 rounded-2xl font-black gap-2 shadow-lg shadow-destructive/20"
                   onClick={() => {
                     if (confirm(`هل أنت متأكد من حذف ${selectedUser.displayName} نهائياً؟`)) {
                       handleAction(selectedUser.uid, { isDeleted: true });
                       setSelectedUser(null);
                     }
                   }}
                 >
                   <Trash2 className="w-4 h-4" />
                   إزالة النظام
                 </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-white px-10 py-4 rounded-3xl shadow-2xl font-black text-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={!!confirmResetColor} onOpenChange={() => setConfirmResetColor(null)}>
        <DialogContent className="rounded-[2.5rem] bg-zinc-950 border-white/10 text-right p-7" dir="rtl">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4">
            <RefreshCcw className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-center text-white mb-2">إعادة ضبط الألوان</h2>
          <p className="text-center text-muted-foreground font-bold mb-6">هل أنت متأكد من إزالة كافة الألوان والتوثيق من هذا المستخدم؟</p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black border border-white/10 text-white" onClick={() => setConfirmResetColor(null)}>إلغاء</Button>
            <Button variant="destructive" className="flex-1 h-14 rounded-2xl font-black" onClick={() => { 
                if (confirmResetColor) performColorUpdate(confirmResetColor, 'none', 0);
                setConfirmResetColor(null);
            }}>تأكيد المسح</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={expiryDialogOpen} onOpenChange={setExpiryDialogOpen}>
        <DialogContent className="max-w-2xl w-[95%] rounded-[3rem] bg-zinc-950 border-white/10 text-right font-sans p-0 overflow-hidden shadow-2xl" dir="rtl">
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shadow-inner">
                  <Palette className="w-7 h-7" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black text-white">منح اللون السحري ✨</DialogTitle>
                  <p className="text-xs text-muted-foreground font-bold tracking-tight">اختر اللون ثم حدد المدة الزمنية</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setExpiryDialogOpen(false)} className="rounded-full bg-white/5 hover:bg-white/10">
                <X className="w-5 h-5 text-white" />
              </Button>
            </div>

            {!selectedUserForColor?.color ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-2 h-[45vh] overflow-y-auto no-scrollbar mask-fade-bottom">
                  {MAGIC_COLORS.map(c => (
                    <Button
                      key={c.value}
                      variant="ghost"
                      className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-2 p-4 transition-all duration-300 border border-white/5 active:scale-95 hover:bg-white/5 ${selectedUserForColor?.color === c.value ? 'bg-primary ring-4 ring-primary/20 border-transparent text-white' : 'bg-zinc-900/40 text-muted-foreground hover:border-primary/30'}`}
                      onClick={() => {
                        if (c.value === 'none') {
                          if (selectedUserForColor) setConfirmResetColor(selectedUserForColor.uid);
                        } else {
                          setSelectedUserForColor(prev => prev ? { ...prev, color: c.value } : null);
                        }
                      }}
                    >
                      <div className={`w-8 h-8 rounded-full shadow-lg ${getNameColorClass(c.value)} bg-white/10`} />
                      <span className={`text-[10px] font-black truncate w-full text-center ${getNameColorClass(c.value)}`}>{c.name}</span>
                    </Button>
                  ))}
                  <Button 
                    variant="destructive" 
                    className="h-20 rounded-2xl flex flex-col items-center gap-2 font-black shadow-lg shadow-destructive/10"
                    onClick={() => {
                        if (selectedUserForColor) setConfirmResetColor(selectedUserForColor.uid);
                    }}
                  >
                    <RefreshCcw className="w-6 h-6" />
                    إعادة ضبط
                  </Button>
                </div>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8 py-4"
              >
                <div className="p-6 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full ${getNameColorClass(selectedUserForColor.color)} bg-white/10`} />
                    <div>
                      <p className="text-[10px] text-muted-foreground font-black uppercase pb-1">اللون المختار</p>
                      <p className={`text-xl font-black ${getNameColorClass(selectedUserForColor.color)}`}>
                        {MAGIC_COLORS.find(c => c.value === selectedUserForColor.color)?.name}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" className="text-primary font-black hover:bg-primary/10" onClick={() => setSelectedUserForColor(prev => prev ? { ...prev, color: '' } : null)}>
                    تغيير اللون
                  </Button>
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-black pr-2 text-white/50">حدد مدة التفعيل (بالأيام)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 7, 30, 90, 180, 365, 9999].map(d => (
                      <Button 
                        key={d} 
                        variant="ghost" 
                        className={`h-14 rounded-2xl font-black border transition-all ${expiryDays === d.toString() ? 'bg-primary border-primary text-white shadow-xl shadow-primary/20' : 'bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10'}`}
                        onClick={() => setExpiryDays(d.toString())}
                      >
                        {d === 9999 ? 'أبدي' : `${d} يوم`}
                      </Button>
                    ))}
                  </div>
                  <Input 
                    type="number" 
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    className="h-16 rounded-2xl bg-white/5 border-white/10 text-center text-2xl font-black text-white focus:border-primary/50 mt-4"
                    placeholder="أدخل عدد أيام مخصص..."
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <Button className="flex-1 h-16 rounded-2xl font-black text-lg bg-primary hover:bg-primary/90 text-white shadow-2xl shadow-primary/30" onClick={handleConfirmExpiry}>
                    تأكيد ومنح اللون للمستخدم
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
