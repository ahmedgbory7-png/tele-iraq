import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Loader2, RotateCcw } from 'lucide-react';

interface TawlaGameProps {
  gameId: string;
  currentUser: UserProfile | null;
  onClose: () => void;
}

export function TawlaGame({ gameId, currentUser, onClose }: TawlaGameProps) {
  const [game, setGame] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [dice, setDice] = useState<[number, number] | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    const unsubscribe = onSnapshot(doc(db, 'games', gameId), (snapshot) => {
      if (snapshot.exists()) {
        setGame({ id: snapshot.id, ...snapshot.data() });
      } else {
        onClose();
      }
      setLoading(false);
    }, (error) => {
      console.error("Game snapshot error:", error);
      setLoading(false);
      if (error.code === 'permission-denied') {
        onClose();
      }
    });

    return () => unsubscribe();
  }, [gameId, onClose]);

  const isMyTurn = game?.turn === currentUser?.uid;
  const otherPlayerId = game?.players.find((p: string) => p !== currentUser?.uid);

  const rollDice = async () => {
    if (!isMyTurn || isRolling) return;
    
    setIsRolling(true);
    // Simulate dice roll animation
    const rollInterval = setInterval(() => {
      setDice([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
    }, 100);

    setTimeout(async () => {
      clearInterval(rollInterval);
      const finalDice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1] as [number, number];
      setDice(finalDice);
      setIsRolling(false);
      
      await updateDoc(doc(db, 'games', gameId), {
        diceValue: finalDice,
        updatedAt: serverTimestamp()
      });
    }, 1000);
  };

  const skipTurn = async () => {
    if (!isMyTurn) return;
    await updateDoc(doc(db, 'games', gameId), {
      turn: otherPlayerId,
      diceValue: null,
      updatedAt: serverTimestamp()
    });
    setDice(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background/80 backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!game) return null;

  return (
    <div className="flex flex-col h-full bg-[#2d1b0d] text-[#e6d2b5] overflow-hidden relative" dir="rtl">
      {/* Header */}
      <div className="p-4 flex justify-between items-center bg-black/40 border-b border-[#4a2e16]">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-lg">لعبة الطاولي (نرد)</h2>
          {game.status === 'playing' && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isMyTurn ? 'bg-orange-600 text-white' : 'bg-white/10 text-white/60'}`}>
              {isMyTurn ? 'دورك الآن' : 'انتظر الخصم'}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10">
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Main Board Area */}
      <div className="flex-1 relative p-4 flex flex-col items-center justify-center gap-8">
        {/* Opponent Info */}
        <div className="flex items-center gap-4 opacity-50">
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold">الخصم</span>
            <span className="text-[10px]">بانتظار الحركة...</span>
          </div>
          <div className="w-12 h-12 rounded-full border-2 border-[#4a2e16] overflow-hidden bg-[#3d2511]">
             <RotateCcw className="w-6 h-6 m-3 opacity-20" />
          </div>
        </div>

        {/* The Board - Stylistic representation */}
        <div className="w-full max-w-sm aspect-square bg-[#3d2511] rounded-xl border-8 border-[#4a2e16] shadow-2xl relative overflow-hidden flex">
          {/* Points/Triangles */}
          <div className="flex-1 border-l-4 border-[#2d1b0d] flex flex-col justify-between p-1">
             <div className="flex justify-around">
               {[1,2,3,4,5,6].map(i => <div key={i} className={`w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent ${i % 2 === 0 ? 'border-t-[60px] border-t-[#e6d2b5]/10' : 'border-t-[60px] border-t-[#8b5cf6]/20'}`} />)}
             </div>
             <div className="flex justify-around">
               {[1,2,3,4,5,6].map(i => <div key={i} className={`w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent ${i % 2 === 0 ? 'border-b-[60px] border-b-[#8b5cf6]/20' : 'border-b-[60px] border-b-[#e6d2b5]/10'}`} />)}
             </div>
          </div>
          <div className="flex-1 flex flex-col justify-between p-1">
             <div className="flex justify-around">
               {[1,2,3,4,5,6].map(i => <div key={i} className={`w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent ${i % 2 === 0 ? 'border-t-[60px] border-t-[#e6d2b5]/10' : 'border-t-[60px] border-t-[#8b5cf6]/20'}`} />)}
             </div>
             <div className="flex justify-around">
               {[1,2,3,4,5,6].map(i => <div key={i} className={`w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent ${i % 2 === 0 ? 'border-b-[60px] border-b-[#8b5cf6]/20' : 'border-b-[60px] border-b-[#e6d2b5]/10'}`} />)}
             </div>
          </div>
          
          {/* Dice Overlay */}
          <AnimatePresence>
            {(dice || game.diceValue) && (
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                className="absolute inset-0 flex items-center justify-center gap-4 bg-black/10 backdrop-blur-[1px]"
              >
                {(dice || game.diceValue).map((val: number, i: number) => (
                  <motion.div 
                    key={i}
                    animate={isRolling ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.1, 1] } : {}}
                    transition={{ repeat: isRolling ? Infinity : 0, duration: 0.2 }}
                    className="w-16 h-16 bg-white rounded-xl shadow-lg flex items-center justify-center"
                  >
                    <Dice dots={val} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* My Info & Roll Button */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full border-4 border-orange-600 overflow-hidden shadow-lg shadow-orange-900/20">
             <Avatar className="w-full h-full">
               <AvatarImage src={currentUser?.photoURL || undefined} />
               <AvatarFallback className="bg-orange-600 text-white font-bold">{currentUser?.displayName?.slice(0, 2)}</AvatarFallback>
             </Avatar>
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className="text-sm font-bold">{currentUser?.displayName}</span>
            {isMyTurn && (
              <div className="flex gap-2">
                <Button 
                  onClick={rollDice} 
                  disabled={isRolling}
                  className="bg-orange-600 hover:bg-orange-700 h-10 px-6 rounded-xl font-bold shadow-lg shadow-orange-900/40"
                >
                  {isRolling ? 'جاري الرمي...' : 'ارمِ الزار'}
                </Button>
                {dice && !isRolling && (
                   <Button onClick={skipTurn} variant="outline" className="h-10 rounded-xl border-[#4a2e16]">تخطي</Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-4 text-center bg-black/20 text-[10px] opacity-40 uppercase tracking-widest font-bold">
        لعبة الطاولي - نسخة المسابقات
      </div>
    </div>
  );
}

function Dice({ dots }: { dots: number }) {
  const Dot = () => <div className="w-2.5 h-2.5 bg-black rounded-full" />;
  const getLayout = () => {
    switch (dots) {
      case 1: return <div className="flex items-center justify-center w-full h-full"><Dot /></div>;
      case 2: return <div className="flex justify-between w-full h-full p-2"><div className="self-start"><Dot /></div><div className="self-end"><Dot /></div></div>;
      case 3: return <div className="flex justify-between w-full h-full p-2"><div className="self-start"><Dot /></div><div className="self-center"><Dot /></div><div className="self-end"><Dot /></div></div>;
      case 4: return <div className="grid grid-cols-2 gap-2 p-2"><Dot /><Dot /><Dot /><Dot /></div>;
      case 5: return <div className="relative w-full h-full p-2"><div className="grid grid-cols-2 gap-4"><Dot /><Dot /><Dot /><Dot /></div><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"><Dot /></div></div>;
      case 6: return <div className="grid grid-cols-2 gap-2 p-2"><Dot /><Dot /><Dot /><Dot /><Dot /><Dot /></div>;
      default: return null;
    }
  };
  return <div className="w-full h-full p-1">{getLayout()}</div>;
}
