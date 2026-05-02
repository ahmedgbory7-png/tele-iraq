import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile, CardGame21 as CardGameType } from '@/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Loader2, Coins, User as UserIcon, RotateCcw } from 'lucide-react';

interface CardGame21Props {
  gameId: string;
  currentUser: UserProfile | null;
  onClose: () => void;
}

const SUITS = ['H', 'D', 'C', 'S'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
  const deck: string[] = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push(`${suit}${value}`);
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

export function calculateScore(hand: string[]) {
  let score = 0;
  let aces = 0;
  for (const card of hand) {
    const val = card.slice(1);
    if (val === 'A') {
      aces += 1;
      score += 11;
    } else if (['J', 'Q', 'K'].includes(val)) {
      score += 10;
    } else {
      score += parseInt(val);
    }
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
}

export function CardGame21({ gameId, currentUser, onClose }: CardGame21Props) {
  const [game, setGame] = useState<CardGameType | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    if (!gameId) return;

    const unsubscribe = onSnapshot(doc(db, 'games', gameId), (snapshot) => {
      if (snapshot.exists()) {
        setGame({ id: snapshot.id, ...snapshot.data() } as CardGameType);
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

  const isMyTurn = game?.turn === currentUser?.uid && game?.status === 'playing';
  const otherPlayerId = game?.players.find((p: string) => p !== currentUser?.uid);

  const drawCard = async () => {
    if (!game || !currentUser || !isMyTurn) return;
    
    // Check if score is already 21 or more
    const currentScore = game.scores[currentUser.uid] || 0;
    if (currentScore >= 21) return;

    const newDeck = [...game.deck];
    const card = newDeck.pop();
    if (!card) return;

    const newHand = [...(game.hands[currentUser.uid] || []), card];
    const newScore = calculateScore(newHand);
    
    const updates: any = {
      deck: newDeck,
      [`hands.${currentUser.uid}`]: newHand,
      [`scores.${currentUser.uid}`]: newScore,
      updatedAt: serverTimestamp(),
      lastAction: 'سحب ورقة'
    };

    if (newScore > 21) {
      // Bust! Other player wins immediately
      updates.status = 'finished';
      updates.winner = otherPlayerId;
      updates.reason = 'تجاوزت 21 نقطة';
    } else if (newScore === 21) {
      // Auto stand on 21
      if (currentUser.uid === game.players[0]) {
        updates.turn = otherPlayerId;
      } else {
        // Second player hits 21, game ends
        updates.status = 'finished';
        const s1 = game.scores[game.players[0]] || 0;
        const s2 = 21;
        if (s1 > 21) updates.winner = game.players[1];
        else if (s1 < 21) updates.winner = game.players[1];
        else updates.winner = 'draw';
      }
    }

    try {
      await updateDoc(doc(db, 'games', gameId), updates);
    } catch (err) {
      console.error("Error drawing card:", err);
    }
  };

  const stand = async () => {
    if (!game || !currentUser || !isMyTurn) return;

    const updates: any = {
      updatedAt: serverTimestamp(),
      lastAction: 'اكتفاء'
    };

    if (currentUser.uid === game.players[0]) {
      // Player 1 stands, turn goes to Player 2
      updates.turn = otherPlayerId;
    } else {
      // Player 2 stands, game ends
      updates.status = 'finished';
      const s1 = game.scores[game.players[0]] || 0;
      const s2 = game.scores[game.players[1]] || 0;

      if (s1 > 21 && s2 > 21) updates.winner = 'draw';
      else if (s1 > 21) updates.winner = game.players[1];
      else if (s2 > 21) updates.winner = game.players[0];
      else if (s1 > s2) updates.winner = game.players[0];
      else if (s2 > s1) updates.winner = game.players[1];
      else updates.winner = 'draw';
    }

    try {
      await updateDoc(doc(db, 'games', gameId), updates);
    } catch (err) {
      console.error("Error standing:", err);
    }
  };

  const resetGame = async () => {
    if (!game || isResetting) return;
    setIsResetting(true);
    
    try {
      const newDeck = createDeck();
      const p1 = game.players[0];
      const p2 = game.players[1];
      
      // Deal 2 cards to each
      const h1 = [newDeck.pop()!, newDeck.pop()!];
      const h2 = [newDeck.pop()!, newDeck.pop()!];
      
      await updateDoc(doc(db, 'games', gameId), {
        deck: newDeck,
        hands: {
          [p1]: h1,
          [p2]: h2
        },
        scores: {
          [p1]: calculateScore(h1),
          [p2]: calculateScore(h2)
        },
        status: 'playing',
        turn: p1,
        winner: null,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error resetting game:", error);
    } finally {
      setIsResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-background/80 backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!game) return null;

  const myHand = game.hands[currentUser?.uid || ''] || [];
  const otherHand = game.hands[otherPlayerId || ''] || [];
  const myScore = game.scores[currentUser?.uid || ''] || 0;
  const otherScore = game.scores[otherPlayerId || ''] || 0;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white relative font-sans overflow-hidden" dir="rtl">
      {/* Header - Fixed at top */}
      <div className="p-4 flex justify-between items-center bg-slate-800/80 backdrop-blur-md border-b border-white/10 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Coins className="text-primary w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg leading-none">لعبة الورق 21</h2>
            <p className="text-[10px] text-white/50 uppercase tracking-widest mt-1">تحدي الذكاء</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10 rounded-full">
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Main Game Area - Scrollable */}
      <div className="flex-1 overflow-y-auto custom-scrollbar overscroll-contain flex flex-col">
        <div className="p-6 flex flex-col items-center gap-10 min-h-full pb-24">
          
          {/* Other Player Hand */}
          <div className="w-full flex flex-col items-center gap-4">
             <div className="flex items-center gap-3 bg-white/5 p-2 pr-4 rounded-full border border-white/10 opacity-80 shadow-inner">
                <div className="text-left">
                  <p className="text-[10px] font-bold text-white/40 uppercase">الخصم</p>
                  <p className="text-xs font-bold text-white/90">{otherScore > 21 ? 'خاسر (تجاوز 21)' : `النقاط: ${otherScore}`}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border border-white/10">
                  <UserIcon className="w-6 h-6 text-white/20" />
                </div>
             </div>
             
              <div className="flex gap-2 min-h-[112px] flex-wrap justify-center">
                {otherHand.map((card: string, i: number) => (
                  <div key={`other-${i}`} className="perspective-sm">
                    <Card code={game.status === 'playing' && i === 0 ? 'HIDDEN' : card} />
                  </div>
                ))}
              </div>
          </div>

          {/* Game Status Message */}
          <div className="text-center py-2 w-full max-w-sm">
             {game.status === 'finished' ? (
               <motion.div 
                 initial={{ scale: 0.8, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 className="flex flex-col items-center gap-3 p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm shadow-2xl"
               >
                 <Trophy className={`w-14 h-14 ${game.winner === currentUser?.uid ? 'text-yellow-400' : 'text-slate-400'}`} />
                 <h3 className="text-2xl font-black">
                   {game.winner === 'draw' ? 'تعادل الرهان!' : (game.winner === currentUser?.uid ? 'مبروك! فزت بالمباراة' : 'حظ أوفر، لقد خسرت')}
                 </h3>
                 {game.reason && <p className="text-xs text-white/60 mb-2">{game.reason}</p>}
                 <div className="flex flex-col gap-1 text-[10px] text-white/40 uppercase tracking-widest font-bold mb-4">
                    <span>نقاطك: {myScore}</span>
                    <span>نقاط الخصم: {otherScore}</span>
                 </div>
                 <Button 
                   onClick={resetGame} 
                   disabled={isResetting}
                   className="w-full h-14 rounded-2xl font-black bg-yellow-400 hover:bg-yellow-500 text-slate-900 gap-2 shadow-xl shadow-yellow-500/30 text-lg transition-all hover:scale-105 active:scale-95"
                 >
                   {isResetting ? <Loader2 className="animate-spin h-6 w-6" /> : (
                     <>
                       <RotateCcw className="w-6 h-6" />
                       لعبة جديدة
                     </>
                   )}
                 </Button>
               </motion.div>
             ) : (
               <div className="px-6 py-3 rounded-full bg-white/5 border border-white/10 shadow-lg flex flex-col items-center gap-1">
                 <p className="text-sm font-bold text-white/90">
                   {isMyTurn ? 'دورك الآن: اسحب ورقة أو اكتفي بنقاطك' : `انتظر دور الخصم... (${game.lastAction || 'بدء اللعب'})`}
                 </p>
                 <div className="h-1 w-24 bg-primary/20 rounded-full overflow-hidden">
                   {isMyTurn && <motion.div className="h-full bg-primary" animate={{ scaleX: [0, 1] }} transition={{ duration: 2, repeat: Infinity }} style={{ originX: 0 }} />}
                 </div>
               </div>
             )}
          </div>

          {/* My Hand */}
          <div className="w-full flex flex-col items-center gap-4">
             <div className="flex gap-2 min-h-[112px] flex-wrap justify-center">
               {myHand.map((card: string, i: number) => (
                 <div key={`my-${i}`} className="perspective-sm">
                   <Card code={card} />
                 </div>
               ))}
             </div>

             <div className="flex items-center gap-3 bg-primary/10 p-2 pl-4 rounded-full border border-primary/30 shadow-lg shadow-primary/5">
                <Avatar className="w-10 h-10 ring-2 ring-primary ring-offset-2 ring-offset-slate-900">
                  <AvatarImage src={currentUser?.photoURL || undefined} />
                  <AvatarFallback className="bg-primary text-white font-bold">{currentUser?.displayName?.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-xs font-bold text-primary">أنت</p>
                  <p className="text-sm font-bold text-white leading-none mt-1">{myScore > 21 ? 'خسرت (تجاوزت 21)' : `نقاطك: ${myScore}`}</p>
                </div>
             </div>

             {isMyTurn && (
               <div className="flex gap-4 w-full max-w-sm mt-4 px-2">
                 <Button 
                  onClick={drawCard} 
                  disabled={myScore >= 21}
                  className="flex-1 h-16 rounded-2xl bg-primary hover:bg-primary/90 text-lg font-black shadow-xl shadow-primary/30 transition-all active:scale-95"
                 >
                   سحب ورقة
                 </Button>
                 <Button 
                  onClick={stand}
                  variant="outline"
                  className="flex-1 h-16 rounded-2xl border-white/20 hover:bg-white/10 text-lg font-black bg-white/5 transition-all active:scale-95"
                 >
                   اكتفاء
                 </Button>
               </div>
             )}
          </div>

        </div>
      </div>

      {/* Footer Branding - Fixed at bottom */}
      <div className="p-3 text-center bg-black/40 text-[9px] opacity-60 uppercase tracking-[0.2em] font-black border-t border-white/5 mt-auto">
        لعبة الورق 21 - تلي عراق بريميوم
      </div>
    </div>

  );
}

const Card = ({ code }: { code: string }) => {
  if (code === 'HIDDEN') {
    return (
      <motion.div 
        initial={{ rotateY: 180 }}
        animate={{ rotateY: 0 }}
        className="w-20 h-28 bg-primary rounded-lg border-2 border-white shadow-xl flex items-center justify-center"
      >
        <div className="w-12 h-20 rounded border border-white/20 flex items-center justify-center text-white/20">
          <Coins className="w-8 h-8" />
        </div>
      </motion.div>
    );
  }

  const suit = code[0];
  const value = code.slice(1);
  const isRed = suit === 'H' || suit === 'D';

  const getSuitIcon = () => {
    switch (suit) {
      case 'H': return '❤️';
      case 'D': return '♦️';
      case 'C': return '♣️';
      case 'S': return '♠️';
      default: return '';
    }
  };

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0, scale: 0.8 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      whileHover={{ y: -5, scale: 1.05 }}
      className={`w-16 h-24 sm:w-20 sm:h-28 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl flex flex-col p-2 select-none border border-white/20 ${isRed ? 'text-red-500' : 'text-slate-900'}`}
    >
      <div className="flex justify-between items-start">
        <span className="font-bold text-base sm:text-lg leading-none">{value}</span>
        <span className="text-[10px] sm:text-xs leading-none">{getSuitIcon()}</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-2xl sm:text-3xl drop-shadow-sm">
        {getSuitIcon()}
      </div>
      <div className="flex justify-between items-end rotate-180">
        <span className="font-bold text-base sm:text-lg leading-none">{value}</span>
        <span className="text-[10px] sm:text-xs leading-none">{getSuitIcon()}</span>
      </div>
    </motion.div>
  );
}

export { createDeck };
