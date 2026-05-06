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
  UserX,
  Palette,
  Ban,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  RefreshCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getNameColorClass, isMagicColor } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStore } from '@/store/useStore';

interface DeveloperPanelProps {
  onClose: () => void;
}

const MAGIC_COLORS = [
  { name: 'إزالة كافة الألوان ❌', value: 'none' },
  { name: 'الذهبي الملكي 👑', value: 'animated-gold' },
  { name: 'زمردي براق ✨', value: 'animated-green' },
  { name: 'ياقوتي مشع 🔥', value: 'animated-red' },
  { name: 'كربوني فضائي 🌑', value: 'magic_pb' },
  { name: 'بنفسجي سحري 🔮', value: 'animated-purple' },
  { name: 'أزرق سماوي 🌊', value: 'animated-blue' },
  { name: 'قوس قزح 🌈', value: 'animated-rainbow' },
  { name: 'فضي ملكي 🥈', value: 'animated-silver' },
  { name: 'فسفوري مشع 💡', value: 'magic_iraq_phosphor' },
  { name: 'أحمر وأزرق 💎', value: 'magic_rb' },
  { name: 'وردي لطيف 🌸', value: 'magic' },
  { name: 'برتقالي شمسي ☀️', value: 'magic_neon' },
  { name: 'تلي عراق المميز 🇮🇶', value: 'magic_iraq' },
  { name: 'برتقالي متحرك 🌀', value: 'magic_neon_orange_moving' },
  { name: 'أخضر متحرك 🧬', value: 'magic_neon_green_moving' },
  { name: 'أحمر وأصفر متحرك ⚡', value: 'magic_red_yellow_moving' },
  { name: 'فسفوري متحرك 🕯️', value: 'magic_phosphor_moving' }
];

type UserTab = 'all' | 'banned' | 'kicked' | 'deleted';

export function DeveloperPanel({ onClose }: DeveloperPanelProps) {
  const { quotaExceeded } = useStore();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<UserTab>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [expiryDialogOpen, setExpiryDialogOpen] = useState(false);
  const [selectedUserForColor, setSelectedUserForColor] = useState<{ id: string, color: string } | null>(null);
  const [expiryDays, setExpiryDays] = useState('30');
  const [selectedUserForActions, setSelectedUserForActions] = useState<UserProfile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserProfile | null>(null);
  const [confirmKick, setConfirmKick] = useState<UserProfile | null>(null);
  const [confirmBan, setConfirmBan] = useState<UserProfile | null>(null);
  const [confirmResetColor, setConfirmResetColor] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchUsers = async () => {
    if (quotaExceeded) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let q;
      if (activeTab === 'banned') q = query(collection(db, 'users'), where('isBanned', '==', true), limit(50));
      else if (activeTab === 'deleted') q = query(collection(db, 'users'), where('isDeleted', '==', true), limit(50));
      else if (activeTab === 'kicked') q = query(collection(db, 'users'), where('forceLogoutSignal', '>', 0), limit(50));
      else q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(50));
      
      const snapshot = await getDocs(q);
      setUsers(snapshot.docs.map(d => ({ ...(d.data() as any), uid: d.id } as UserProfile)));
    } catch (error: any) {
      console.error("Error fetching users:", error);
      if (error.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (term: string) => {
    if (quotaExceeded || !term) return;
    setLoading(true);
    try {
      const resultsMap = new Map<string, UserProfile>();
      const trimmedTerm = term.trim();
      
      // 1. Try UID Match
      if (trimmedTerm.length > 20) {
        try {
          const docRef = doc(db, 'users', trimmedTerm);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            resultsMap.set(docSnap.id, { ...(docSnap.data() as any), uid: docSnap.id } as UserProfile);
          }
        } catch (e) {}
      }

      // 2. Try Name Search (Prefix)
      const q = query(
        collection(db, 'users'), 
        where('displayName', '>=', trimmedTerm), 
        where('displayName', '<=', trimmedTerm + '\uf8ff'),
        limit(50)
      );
      const snap = await getDocs(q);
      snap.forEach(d => resultsMap.set(d.id, { ...(d.data() as any), uid: d.id } as UserProfile));
      
      // 3. Try Phone Search
      const cleanPhone = trimmedTerm.replace(/\D/g, '');
      if (cleanPhone.length >= 3) {
        const qp = query(collection(db, 'users'), where('phoneNumber', '>=', cleanPhone), where('phoneNumber', '<=', cleanPhone + '\uf8ff'), limit(20));
        const snapP = await getDocs(qp);
        snapP.forEach(d => resultsMap.set(d.id, { ...(d.data() as any), uid: d.id } as UserProfile));
      }

      setUsers(Array.from(resultsMap.values()).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
      if (resultsMap.size === 0 && trimmedTerm.length > 2) showToast('🔍 لا توجد نتائج');
    } catch (error: any) {
      console.error("Search error:", error);
      if (error.code === 'resource-exhausted') useStore.getState().setQuotaExceeded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!searchTerm) {
      fetchUsers();
    } else {
      const delayDebounceFn = setTimeout(() => {
        searchUsers(searchTerm);
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [activeTab, searchTerm]);

  const handleAction = async (userId: string, data: Partial<UserProfile>) => {
    if (quotaExceeded) return;
    setActionLoading(userId);
    try {
      await updateDoc(doc(db, 'users', userId), data);
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, ...data } : u));
      if (selectedUserForActions?.uid === userId) setSelectedUserForActions(prev => prev ? { ...prev, ...data } : null);
      showToast('✅ تم التحديث');
    } catch (error: any) {
      console.error("Action error:", error);
      showToast('❌ خطأ');
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
              photoURL: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png',
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

  const performColorUpdate = async (userId: string, color: string, days: number) => {
    if (quotaExceeded) return;
    setActionLoading(userId);
    try {
      const isRemoval = color === 'none' || !color;
      const expiryDate = !isRemoval && days > 0 ? Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000) : null;
      
      const updateData: any = {
        specialColor: isRemoval ? null : color,
        nameColor: isRemoval ? '#8b5cf6' : color,
        specialColorExpiry: isRemoval ? null : expiryDate,
        isVerified: !isRemoval,
        verifiedAt: !isRemoval ? serverTimestamp() : null
      };

      await updateDoc(doc(db, 'users', userId), updateData);
      
      // Update propagation to chats
      try {
        const chatsQ = query(
          collection(db, 'chats'),
          where('participants', 'array-contains', userId),
          limit(20)
        );
        const chatsSnap = await getDocs(chatsQ);
        const batch = writeBatch(db);
        
        chatsSnap.docs.forEach(chatDoc => {
          batch.update(chatDoc.ref, {
            [`participantProfiles.${userId}.specialColor`]: isRemoval ? null : color,
            [`participantProfiles.${userId}.nameColor`]: isRemoval ? '#8b5cf6' : color,
            [`participantProfiles.${userId}.specialColorExpiry`]: isRemoval ? null : expiryDate,
            [`participantProfiles.${userId}.isVerified`]: !isRemoval
          });
        });
        
        if (chatsSnap.size > 0) {
          await batch.commit();
        }
      } catch (propErr) {
        console.error("Propagation error:", propErr);
      }
      
      // Send notification if color was granted
      if (!isRemoval) {
        const colorName = MAGIC_COLORS.find(c => c.value === color)?.name || 'لون جديد';
        const msgText = `مبروك! لقد تم منحك "${colorName}" من قبل الإدارة لمدة ${days === 9999 ? 'دائم' : `${days} يوم`}. استمتع بتميزك! ✨🇮🇶`;
        sendSupportMessage(userId, msgText);
      }

      // Local updates
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, ...updateData } : u));
      if (selectedUserForActions?.uid === userId) setSelectedUserForActions(prev => prev ? { ...prev, ...updateData } : null);
      
      showToast(!isRemoval ? `✅ تم منح اللون لـ ${days} يوم` : '✅ تم إعادة الضبط');
      setExpiryDialogOpen(false);
      setSelectedUserForColor(null);
    } catch (e) {
      console.error("Color update error:", e);
      showToast('❌ فشل تلوين المستخدم');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmExpiry = () => {
    if (!selectedUserForColor) return;
    performColorUpdate(selectedUserForColor.id, selectedUserForColor.color, parseInt(expiryDays) || 30);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 h-screen font-sans" dir="rtl">
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-zinc-900/50 backdrop-blur-3xl shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white">إدارة السيرفر</h2>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest leading-none mt-1">اللوحة المركزية للمطور الرئيسي</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full w-12 h-12 bg-white/5 hover:bg-white/10 text-white transition-all">
          <X className="w-7 h-7" />
        </Button>
      </div>

      <div className="p-4 border-b border-white/5 space-y-4">
        <div className="relative group">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input 
            placeholder="ابحث بقوة المطور (UID, اسم, رقم)..."
            className="h-14 pr-12 rounded-2xl bg-zinc-900/80 border-white/10 text-lg font-bold text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'all', label: 'الكل', icon: Users },
            { id: 'banned', label: 'المحذورين', icon: Ban },
            { id: 'kicked', label: 'المطرودين', icon: LogOut },
            { id: 'deleted', label: 'المحذوفين', icon: UserX }
          ].map(tab => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'default' : 'outline'}
              className={`rounded-2xl h-10 px-6 font-black gap-2 shrink-0 transition-all ${activeTab === tab.id ? 'bg-primary border-none text-white' : 'bg-transparent border-white/10 text-muted-foreground'}`}
              onClick={() => setActiveTab(tab.id as UserTab)}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          {quotaExceeded && (
            <div className="p-6 rounded-[2rem] bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center gap-4 animate-in slide-in-from-top duration-500">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <div>
                <p className="font-black text-lg">⚠️ تحذير: تم استنفاد الحصة المجانية</p>
                <p className="text-xs font-bold opacity-80">تم الوصول للحد الأقصى لعمليات القراءة/الكتابة لهذا اليوم (Quota). سيتم إعادة ضبط الحصة تلقائياً غداً.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
          {loading ? (
            <div className="col-span-full py-40 flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="text-muted-foreground font-black">جاري الاستعلام...</p>
            </div>
          ) : (
            users.map(u => (
              <motion.div 
                layout
                key={u.uid}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 rounded-[2rem] bg-zinc-900/40 border border-white/5 flex items-center gap-4 hover:border-primary/30 transition-all relative group"
                onClick={() => setSelectedUserForActions(u)}
              >
                <Avatar className="h-12 w-12 border-2 border-white/5 shadow-xl">
                  <AvatarImage src={u.photoURL} />
                  <AvatarFallback style={{ backgroundColor: u.nameColor }}>{u.displayName?.slice(0,2)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-sm font-black truncate ${getNameColorClass(u.specialColor || u.nameColor, u.specialColorExpiry)}`}>
                    {u.displayName}
                  </h3>
                  <p className="text-[9px] text-muted-foreground font-mono opacity-50 truncate">{u.uid}</p>
                </div>
                <ChevronLeft className="w-4 h-4 text-white/20 group-hover:text-primary transition-colors" />
                
                {actionLoading === u.uid && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] rounded-[2rem] flex items-center justify-center z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* User Actions Modal */}
      <Dialog open={!!selectedUserForActions} onOpenChange={() => setSelectedUserForActions(null)}>
        <DialogContent className="rounded-[3rem] bg-zinc-950 border-white/10 text-right font-sans max-w-md w-[90%] p-7 max-h-[85vh] overflow-y-auto no-scrollbar" dir="rtl">
          {selectedUserForActions && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 rounded-[2rem] bg-white/5 border border-white/5">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedUserForActions.photoURL} />
                  <AvatarFallback style={{ backgroundColor: selectedUserForActions.nameColor }}>{selectedUserForActions.displayName?.slice(0,2)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-black text-white">{selectedUserForActions.displayName}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className="text-[9px] bg-primary/20 text-primary px-3 py-0.5 rounded-full font-black">ID: {selectedUserForActions.uid}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant="outline"
                  className="h-14 rounded-2xl font-black gap-2 border-primary/20 text-primary hover:bg-primary/5 col-span-2"
                  onClick={() => {
                    setSelectedUserForColor({ id: selectedUserForActions.uid, color: '' });
                    setExpiryDialogOpen(true);
                    setSelectedUserForActions(null);
                  }}
                >
                  <Palette className="w-5 h-5" />
                  منح لون سحري ✨
                </Button>

                <Button 
                  variant={selectedUserForActions.isBanned ? 'destructive' : 'outline'}
                  className={`h-14 rounded-2xl font-black gap-2 ${!selectedUserForActions.isBanned ? 'text-red-500 border-red-500/20' : ''}`}
                  onClick={() => {
                    if (selectedUserForActions.isBanned) handleAction(selectedUserForActions.uid, { isBanned: false });
                    else setConfirmBan(selectedUserForActions);
                    setSelectedUserForActions(null);
                  }}
                >
                  <Ban className="w-4 h-4" />
                  {selectedUserForActions.isBanned ? 'إيقاف الحظر' : 'حظر الحساب'}
                </Button>

                <Button 
                  variant="outline"
                  className="h-14 rounded-2xl font-black gap-2 text-orange-500 border-orange-500/20"
                  onClick={() => { setConfirmKick(selectedUserForActions); setSelectedUserForActions(null); }}
                >
                  <LogOut className="w-4 h-4" />
                  طرد الجلسة
                </Button>

                <Button 
                  variant="outline"
                  className="h-14 rounded-2xl font-black gap-2 text-indigo-500 border-indigo-500/20"
                  onClick={() => {
                    const v = !selectedUserForActions.isVerified;
                    handleAction(selectedUserForActions.uid, { isVerified: v, verifiedAt: v ? serverTimestamp() : null });
                    setSelectedUserForActions(null);
                  }}
                >
                  <Star className="w-4 h-4" />
                  {selectedUserForActions.isVerified ? 'إلغاء التوثيق' : 'توثيق الحساب'}
                </Button>

                <Button 
                  variant="destructive"
                  className="h-14 rounded-2xl font-black gap-2"
                  onClick={() => { setConfirmDelete(selectedUserForActions); setSelectedUserForActions(null); }}
                >
                  <Trash2 className="w-4 h-4" />
                  إزالة نهائية
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Magic Color Dialog (Grid -> Duration) */}
      <Dialog open={expiryDialogOpen} onOpenChange={setExpiryDialogOpen}>
        <DialogContent className="max-w-2xl w-[95%] rounded-[3rem] bg-zinc-950 border-white/10 text-right font-sans p-0 overflow-hidden shadow-2xl" dir="rtl">
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center text-primary">
                  <Palette className="w-7 h-7" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black text-white">منح اللون السحري</DialogTitle>
                  <p className="text-xs text-muted-foreground font-bold">للمستخدم المراد تلوينه</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setExpiryDialogOpen(false)} className="rounded-full bg-white/5 hover:bg-white/10">
                <X className="w-5 h-5 text-white" />
              </Button>
            </div>

            {!selectedUserForColor?.color ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-2 h-[45vh] overflow-y-auto no-scrollbar">
                {MAGIC_COLORS.map(c => (
                  <Button
                    key={c.value}
                    variant="ghost"
                    className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-2 p-4 transition-all border border-white/5 bg-zinc-900/40 text-muted-foreground hover:border-primary/50`}
                    onClick={() => {
                      if (selectedUserForColor) {
                        if (c.value === 'none') {
                          setConfirmResetColor(selectedUserForColor.id);
                        } else {
                          setSelectedUserForColor(prev => prev ? { ...prev, color: c.value } : null);
                        }
                      }
                    }}
                  >
                    <div className={`w-8 h-8 rounded-full shadow-lg ${getNameColorClass(c.value)} bg-white/10`} />
                    <span className={`text-[10px] font-black truncate w-full text-center ${getNameColorClass(c.value)}`}>{c.name}</span>
                  </Button>
                ))}
                <Button 
                  variant="destructive" 
                  className="h-20 rounded-2xl flex flex-col items-center gap-2 font-black"
                  onClick={() => {
                    if (selectedUserForColor) setConfirmResetColor(selectedUserForColor.id);
                  }}
                >
                  <RefreshCcw className="w-6 h-6" />
                  إعادة ضبط
                </Button>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6 py-4">
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full ${getNameColorClass(selectedUserForColor.color)} bg-white/10`} />
                    <div>
                      <p className={`text-lg font-black ${getNameColorClass(selectedUserForColor.color)}`}>
                        {MAGIC_COLORS.find(c => c.value === selectedUserForColor.color)?.name}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" className="text-primary font-black" onClick={() => setSelectedUserForColor(prev => prev ? { ...prev, color: '' } : null)}>تغيير</Button>
                </div>
                <div className="space-y-4">
                  <label className="text-xs font-black text-white/40 px-2">مدة التفعيل بالأيام</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[7, 30, 90, 365, 9999].map(d => (
                      <Button 
                        key={d} 
                        variant="outline" 
                        className={`h-12 rounded-xl transition-all ${expiryDays === d.toString() ? 'bg-primary border-primary text-white' : 'bg-transparent border-white/10 text-muted-foreground'}`}
                        onClick={() => setExpiryDays(d.toString())}
                      >
                        {d === 9999 ? 'دائم' : `${d} يوم`}
                      </Button>
                    ))}
                  </div>
                  <Input 
                    type="number" 
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    className="h-16 rounded-2xl bg-white/5 border-white/10 text-center text-2xl font-black text-white"
                  />
                </div>
                <Button className="w-full h-16 rounded-2xl font-black text-lg bg-primary hover:bg-primary/90 text-white shadow-xl" onClick={handleConfirmExpiry}>
                  تأكيد ومنح اللون
                </Button>
              </motion.div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modals (Ban/Kick/Delete) */}
      <Dialog open={!!confirmBan} onOpenChange={() => setConfirmBan(null)}>
        <DialogContent className="rounded-[2.5rem] bg-zinc-950 border-red-500/20 text-right p-7" dir="rtl">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mx-auto mb-4">
            <Ban className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-center text-white mb-2">تأكيد حظر الحساب</h2>
          <p className="text-center text-muted-foreground font-bold mb-6">هل أنت متأكد من حظر "{confirmBan?.displayName}"؟</p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black border border-white/10 text-white" onClick={() => setConfirmBan(null)}>تراجع</Button>
            <Button variant="destructive" className="flex-1 h-14 rounded-2xl font-black" onClick={() => { handleAction(confirmBan!.uid, { isBanned: true }); setConfirmBan(null); }}>حظر الآن</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmKick} onOpenChange={() => setConfirmKick(null)}>
        <DialogContent className="rounded-[2.5rem] bg-zinc-950 border-orange-500/20 text-right p-7" dir="rtl">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 mx-auto mb-4">
            <LogOut className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-center text-white mb-2">طرد المستخدم</h2>
          <p className="text-center text-muted-foreground font-bold mb-6">سيتم تسجيل خروج "{confirmKick?.displayName}" فوراً.</p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black border border-white/10 text-white" onClick={() => setConfirmKick(null)}>إلغاء</Button>
            <Button className="flex-1 h-14 rounded-2xl font-black bg-orange-500 hover:bg-orange-600 text-white" onClick={() => { handleAction(confirmKick!.uid, { forceLogoutSignal: Date.now() }); setConfirmKick(null); }}>طرد الآن</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="rounded-[2.5rem] bg-zinc-950 border-red-500/20 text-right p-7" dir="rtl">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 mx-auto mb-4">
            <Trash2 className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-center text-white mb-2">حذف نهائي</h2>
          <p className="text-center text-muted-foreground font-bold mb-6 italic">هذا الإجراء لا يمكن التراجع عنه!</p>
          <div className="flex gap-3">
            <Button variant="ghost" className="flex-1 h-14 rounded-2xl font-black border border-white/10 text-white" onClick={() => setConfirmDelete(null)}>تراجع</Button>
            <Button variant="destructive" className="flex-1 h-14 rounded-2xl font-black" onClick={() => { handleAction(confirmDelete!.uid, { isDeleted: true }); setConfirmDelete(null); }}>حذف نهائي</Button>
          </div>
        </DialogContent>
      </Dialog>
      
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
      
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.5 }} className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1000] bg-primary text-white px-8 py-3 rounded-2xl shadow-2xl font-black">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </div>
);
}
