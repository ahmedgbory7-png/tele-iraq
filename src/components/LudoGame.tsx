import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { LudoGame as LudoGameType, UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Loader2, Dice5 } from 'lucide-react';

interface LudoGameProps {
  gameId: string;
  currentUser: UserProfile | null;
  onClose: () => void;
}

export function LudoGame({ gameId, currentUser, onClose }: LudoGameProps) {
  const [game, setGame] = useState<LudoGameType | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    const unsubscribe = onSnapshot(doc(db, 'games', gameId), (snapshot) => {
      if (snapshot.exists()) {
        setGame({ id: snapshot.id, ...snapshot.data() } as LudoGameType);
      } else {
        onClose();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [gameId, onClose]);

  const isMyTurn = game?.turn === currentUser?.uid;
  const playerIndex = game?.players.indexOf(currentUser?.uid || '') || 0;
  const playerColor = ['#ef4444', '#3b82f6'][playerIndex]; // Red, Blue
  
  const handleRollDice = async () => {
    if (!game || !isMyTurn || isRolling || game.diceValue !== 0) return;

    setIsRolling(true);
    setTimeout(async () => {
      const newValue = Math.floor(Math.random() * 6) + 1;
      
      const canMove = game.positions[currentUser!.uid].some(pos => {
        if (pos === 0) return newValue === 6;
        return pos + newValue <= 56;
      });

      const updates: any = {
        diceValue: newValue,
        updatedAt: serverTimestamp()
      };

      if (!canMove) {
        // Switch turn if no moves possible after a delay
        setTimeout(async () => {
          const otherPlayerId = game.players.find(p => p !== currentUser?.uid);
          await updateDoc(doc(db, 'games', gameId), {
            diceValue: 0,
            turn: otherPlayerId,
            updatedAt: serverTimestamp()
          });
        }, 1500);
      }

      await updateDoc(doc(db, 'games', gameId), updates);
      setIsRolling(false);
    }, 800);
  };

  const handleMovePiece = async (pieceIndex: number) => {
    if (!game || !isMyTurn || game.diceValue === 0) return;

    const currentPos = game.positions[currentUser!.uid][pieceIndex];
    const diceValue = game.diceValue;

    let newPos = currentPos;
    if (currentPos === 0) {
      if (diceValue === 6) newPos = 1;
      else return;
    } else {
      newPos += diceValue;
      if (newPos > 56) return;
    }

    const newPositions = { ...game.positions };
    newPositions[currentUser!.uid][pieceIndex] = newPos;

    // Capture logic (simplified)
    const otherUserId = game.players.find(id => id !== currentUser?.uid)!;
    const otherPositions = [...newPositions[otherUserId]];
    // In Ludo, board positions are complex. This is a simplified 1D board.
    
    // Check win condition
    const hasWon = newPositions[currentUser!.uid].every(p => p === 56);

    const updates: any = {
      positions: newPositions,
      diceValue: 0,
      updatedAt: serverTimestamp()
    };

    if (hasWon) {
      updates.status = 'finished';
      updates.winner = currentUser?.uid;
    } else if (diceValue !== 6) {
      updates.turn = otherUserId;
    }

    await updateDoc(doc(db, 'games', gameId), updates);
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
    <div className="flex flex-col h-full bg-[#1a1a1a] text-white overflow-hidden relative" dir="rtl">
      {/* Header */}
      <div className="p-4 flex justify-between items-center bg-black/20 border-b border-white/10">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-lg">لعبة اللودو</h2>
          {game.status === 'playing' && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isMyTurn ? 'bg-green-500 text-white' : 'bg-white/10 text-white/60'}`}>
              {isMyTurn ? 'دورك الآن' : 'انتظر الخصم'}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10">
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Board Visualization (Simplified Central Path) */}
      <div className="flex-1 p-4 flex flex-col items-center justify-center gap-8 overflow-y-auto">
        {/* Opponent's Home */}
        <div className="flex gap-2">
          {game.players.map((pid, pidx) => pid !== currentUser?.uid && (
            <div key={pid} className="flex flex-col items-center gap-2">
              <div className="flex gap-2">
                {game.positions[pid].map((pos, i) => (
                  <div 
                    key={i} 
                    className="w-8 h-8 rounded-full border-2 border-white/20 flex items-center justify-center shadow-lg"
                    style={{ backgroundColor: ['#ef4444', '#3b82f6'][pidx], opacity: pos === 56 ? 0.3 : 1 }}
                  >
                    {pos > 0 && pos < 56 && <div className="w-4 h-4 bg-white rounded-full shadow-inner animate-pulse" />}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-white/40">قطع الخصم</p>
            </div>
          ))}
        </div>

        {/* Global Progress Bar Style Board */}
        <div className="w-full max-w-sm h-12 bg-white/5 rounded-full relative overflow-hidden border border-white/10">
           {game.players.map((pid, pidx) => (
             game.positions[pid].map((pos, i) => pos > 0 && pos < 56 && (
               <motion.div
                 key={`${pid}-${i}`}
                 className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-white shadow-xl z-10"
                 style={{ 
                   backgroundColor: ['#ef4444', '#3b82f6'][pidx],
                   left: `${(pos / 56) * 100}%` 
                 }}
                 layoutId={`${pid}-${i}`}
               />
             ))
           ))}
           <div className="absolute inset-y-0 right-0 w-12 bg-yellow-500/20 flex items-center justify-center border-l border-yellow-500/30">
             <Trophy className="w-4 h-4 text-yellow-500" />
           </div>
        </div>

        {/* My Zone */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm font-bold text-white/60">قطعك</p>
          <div className="flex gap-4">
            {game.positions[currentUser?.uid || ''].map((pos, i) => (
              <motion.button
                key={i}
                whileTap={{ scale: 0.9 }}
                disabled={!isMyTurn || game.diceValue === 0 || (pos === 0 && game.diceValue !== 6) || (pos + game.diceValue > 56)}
                onClick={() => handleMovePiece(i)}
                className={`w-14 h-14 rounded-2xl border-4 flex items-center justify-center shadow-2xl relative group ${
                  pos === 56 ? 'opacity-20 grayscale' : 'opacity-100'
                }`}
                style={{ 
                  backgroundColor: playerColor, 
                  borderColor: (isMyTurn && game.diceValue > 0 && ((pos === 0 && game.diceValue === 6) || (pos > 0 && pos + game.diceValue <= 56))) ? 'white' : 'transparent'
                }}
              >
                {pos === 0 ? <Dice5 className="w-6 h-6 text-white/40" /> : <span className="font-bold">{pos}</span>}
                {isMyTurn && game.diceValue > 0 && ((pos === 0 && game.diceValue === 6) || (pos > 0 && pos + game.diceValue <= 56)) && (
                   <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-1 border-2 border-white animate-bounce">
                     <Dice5 className="w-3 h-3" />
                   </div>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Control Area */}
      <div className="p-8 bg-black/60 border-t border-white/10 flex flex-col items-center gap-6">
        <div className="flex items-center gap-8">
           <motion.div 
             animate={isRolling ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.2, 1] } : {}}
             transition={{ duration: 0.4, repeat: isRolling ? Infinity : 0 }}
             className={`w-20 h-20 rounded-2xl bg-white flex items-center justify-center shadow-[0_10px_40px_rgba(255,255,255,0.2)] text-black`}
           >
             {game.diceValue === 0 ? (
               <Dice5 className="w-10 h-10 opacity-20" />
             ) : (
               <span className="text-4xl font-black">{game.diceValue}</span>
             )}
           </motion.div>

           {isMyTurn && game.status === 'playing' && game.diceValue === 0 && (
             <Button 
               onClick={handleRollDice} 
               disabled={isRolling}
               className="h-16 px-8 rounded-2xl bg-white text-black hover:bg-white/90 font-black text-xl shadow-xl active:scale-95 transition-all"
             >
               رمي الزار
             </Button>
           )}
        </div>
        
        {isMyTurn && game.diceValue > 0 && (
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-primary font-bold animate-pulse">
            {game.diceValue === 6 ? 'ممتاز! يمكنك إخراج قطعة أو تحريك واحدة 6 خطوات' : `حرك قطعة ${game.diceValue} خطوات`}
          </motion.p>
        )}
      </div>

      {/* Winner Overlay */}
      <AnimatePresence>
        {game.status === 'finished' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-6"
          >
            <div className="text-center">
              <div className="relative inline-block">
                <Trophy className="h-24 w-24 text-yellow-500 mx-auto mb-6 drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]" />
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: 'linear' }} className="absolute inset-0 border-4 border-dashed border-yellow-500/20 rounded-full scale-150" />
              </div>
              <h2 className="text-4xl font-black mb-2 text-white">
                {game.winner === currentUser?.uid ? 'بطل اللعبة!' : 'خيرها في غيرها'}
              </h2>
              <p className="text-white/40 mb-10 text-lg">تهانينا للفائز بالمباراة الشيقة</p>
              <Button onClick={onClose} size="lg" className="w-full h-16 rounded-2xl bg-primary text-white hover:bg-primary/90 text-xl font-bold shadow-2xl">
                العودة للدردشة
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
