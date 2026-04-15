import React, { useState } from 'react';
import { db } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Camera, Check, Loader2 } from 'lucide-react';

interface ProfileProps {
  profile: UserProfile;
  onClose: () => void;
}

export function Profile({ profile, onClose }: ProfileProps) {
  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [status, setStatus] = useState(profile.status || '');
  const [photoURL, setPhotoURL] = useState(profile.photoURL || '');
  const [nameColor, setNameColor] = useState(profile.nameColor || '#8b5cf6');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const colors = [
    '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', 
    '#10b981', '#3b82f6', '#6366f1', '#141414'
  ];

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName,
        status,
        photoURL,
        nameColor
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoURL(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background" dir="rtl">
      {/* Header */}
      <div className="p-4 flex items-center gap-4 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <h2 className="text-xl font-bold">إعدادات الملف الشخصي</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-md mx-auto w-full">
        {/* Avatar Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group cursor-pointer" onClick={() => document.getElementById('avatar-upload')?.click()}>
            <Avatar className="h-32 w-32 border-4 border-primary/10 shadow-xl group-hover:opacity-80 transition-opacity">
              <AvatarImage src={photoURL} />
              <AvatarFallback className="text-4xl font-bold text-white" style={{ backgroundColor: nameColor }}>
                {displayName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 flex gap-1">
              <div className="bg-primary text-white p-2 rounded-full shadow-lg hover:scale-110 transition-transform">
                <Camera className="h-5 w-5" />
              </div>
            </div>
            <input 
              id="avatar-upload"
              type="file" 
              className="hidden" 
              accept="image/*" 
              onChange={handleFileChange} 
            />
          </div>
          <div className="text-center">
            <p className="text-xs text-primary font-bold mb-1 animate-pulse">اضغط على الصورة لتغييرها</p>
            <p className="text-lg font-bold">{profile.phoneNumber}</p>
            <p className="text-sm text-muted-foreground">معرفك الفريد في تليعراق</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-primary px-1">الاسم المستعار</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="اسمك"
              className="h-12 bg-muted/30 border-none rounded-xl focus-visible:ring-primary/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-primary px-1">الحالة</label>
            <Input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="ماذا يدور في ذهنك؟"
              className="h-12 bg-muted/30 border-none rounded-xl focus-visible:ring-primary/30"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-primary px-1">لون الاسم</label>
            <div className="flex flex-wrap gap-3 p-2">
              {colors.map(color => (
                <button
                  key={color}
                  onClick={() => setNameColor(color)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${nameColor === color ? 'border-primary scale-125 shadow-md' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <Button 
            onClick={handleSave} 
            className={`w-full h-12 text-lg font-bold rounded-xl transition-all ${saved ? 'bg-green-500' : 'purple-gradient'}`}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin mr-2" /> : saved ? <Check className="mr-2" /> : null}
            {saved ? 'تم الحفظ بنجاح' : 'حفظ التغييرات'}
          </Button>
        </div>
      </div>
    </div>
  );
}
