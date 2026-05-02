import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { collection, query, limit, getDocs, doc, updateDoc, orderBy, where } from 'firebase/firestore';
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
  Ban
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { motion, AnimatePresence } from 'motion/react';
import { getNameColorClass, isMagicColor } from '@/lib/utils';

interface DeveloperPanelProps {
  onClose: () => void;
}

const MAGIC_COLORS = [
  { name: 'الذهبي الملكي', value: 'animated-gold' },
  { name: 'زمردي براق', value: 'animated-green' },
  { name: 'ياقوتي مشع', value: 'animated-red' },
  { name: 'كربوني فضائي', value: 'magic_pb' },
  { name: 'بنفسجي سحري', value: 'animated-purple' },
  { name: 'أزرق سماوي', value: 'animated-blue' },
  { name: 'وردي لطيف', value: 'magic' },
  { name: 'برتقالي شمسي', value: 'magic_neon' },
  { name: 'تلي عراق المميز', value: 'magic_iraq' }
];

export function DeveloperPanel({ onClose }: DeveloperPanelProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), limit(50));
      const snapshot = await getDocs(q);
      const fetchedUsers = snapshot.docs.map(doc => ({ 
        ...doc.data(), 
        uid: doc.id // Ensure uid is always present for the key
      } as UserProfile));
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAction = async (userId: string, data: Partial<UserProfile>) => {
    setActionLoading(userId);
    try {
      await updateDoc(doc(db, 'users', userId), data);
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, ...data } : u));
    } catch (error) {
      console.error("Action error:", error);
      alert('حدث خطأ أثناء تنفيذ الإجراء. تأكد من صلاحيات المطور.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter(u => 
    (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.phoneNumber || '').includes(searchTerm)
  );

  return (
    <div className="flex flex-col h-full bg-background" dir="rtl">
      <div className="p-6 border-b flex items-center justify-between bg-card/50 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">إدارة مستخدمي النظام</h2>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">لوحة المطور - تلي عراق</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
          <X className="w-6 h-6" />
        </Button>
      </div>

      <div className="p-4 bg-muted/30">
        <div className="relative">
          <Search className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground" />
          <Input 
            placeholder="البحث عن مستخدم بالاسم أو الرقم..." 
            className="pr-10 h-10 rounded-xl bg-card border-none shadow-sm focus-visible:ring-primary/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3 pb-safe">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs font-bold text-muted-foreground">جاري جلب القائمة...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground font-bold">لا يوجد مستخدمين مطابقين</div>
          ) : (
            filteredUsers.map((u) => (
              <motion.div 
                layout
                key={u.uid}
                className={`p-4 rounded-3xl border bg-card shadow-sm space-y-4 hover:border-primary/20 transition-colors ${u.isBanned ? 'opacity-60 grayscale' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14 border-2 border-primary/10">
                    <AvatarImage src={u.photoURL} />
                    <AvatarFallback style={{ backgroundColor: u.nameColor }}>
                      {u.displayName?.slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-black truncate ${getNameColorClass(u.specialColor || u.nameColor)}`} style={{ color: isMagicColor(u.specialColor || u.nameColor) ? undefined : (u.specialColor || u.nameColor) }}>
                        {u.displayName}
                      </h3>
                      {u.isVerified && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                      {u.isDeveloper && <ShieldCheck className="w-3 h-3 text-red-500" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">{u.phoneNumber || u.email}</p>
                    <p className="text-[9px] text-primary/60 font-bold mt-1">UID: {u.uid}</p>
                  </div>
                  {actionLoading === u.uid && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={u.isBanned ? "default" : "outline"}
                    size="sm"
                    className={`h-10 rounded-2xl text-[11px] font-bold gap-2 ${u.isBanned ? 'bg-red-500 hover:bg-red-600' : 'text-red-500 border-red-500/20 hover:bg-red-500/10'}`}
                    onClick={() => handleAction(u.uid, { isBanned: !u.isBanned })}
                    disabled={u.isDeveloper}
                  >
                    <Ban className="w-4 h-4" />
                    {u.isBanned ? 'إلغاء الحظر' : 'حظر نهائي'}
                  </Button>

                  <Button 
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-2xl text-[11px] font-bold gap-2 text-orange-500 border-orange-500/20 hover:bg-orange-500/10"
                    onClick={() => handleAction(u.uid, { forceLogoutSignal: Date.now() })}
                  >
                    <LogOut className="w-4 h-4" />
                    تسجيل خروج
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-[9px] font-black text-muted-foreground uppercase flex items-center gap-2">
                    <Palette className="w-3 h-3" /> تعيين لون سحري مميز
                  </p>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className={`h-8 rounded-xl px-3 text-[10px] shrink-0 font-bold ${!u.specialColor ? 'bg-primary/10 border-primary/20' : ''}`}
                      onClick={() => handleAction(u.uid, { specialColor: '' })}
                    >
                      بدون لون
                    </Button>
                    {MAGIC_COLORS.map(color => (
                        <Button
                          key={color.value}
                          variant="outline"
                          size="sm"
                          className={`h-8 rounded-xl px-3 text-[10px] shrink-0 font-bold border-muted transition-all active:scale-95 ${u.specialColor === color.value ? 'ring-2 ring-primary ring-offset-1 z-10' : ''}`}
                          onClick={() => handleAction(u.uid, { specialColor: color.value })}
                        >
                          <span className={getNameColorClass(color.value)}>{color.name}</span>
                        </Button>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
