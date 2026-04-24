import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile, CardGame21 as CardGameType } from '@/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Loader2, Coins, User as UserIcon } from 'lucide-react';

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

function calculateScore(hand: string[]) {
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
    
    const newDeck = [...game.deck];
    const card = newDeck.pop();
    if (!card) return;

    const newHand = [...(game.hands[currentUser.uid] || []), card];
    const newScore = calculateScore(newHand);
    
    const updates: any = {
      deck: newDeck,
      [`hands.${currentUser.uid}`]: newHand,
      [`scores.${currentUser.uid}`]: newScore,
      updatedAt: serverTimestamp()
    };

    if (newScore >= 21) {
      // Auto stand if 21 or bust
      updates.turn = otherPlayerId;
    }

    // If both players have played (usually we'd need a way to track if they stood)
    // For this 1v1 version:
    // Player 1 plays until they stand or bust.
    // Then Player 2 plays until they stand or bust.
    // Then compare.

    await updateDoc(doc(db, 'games', gameId), updates);
  };

  const stand = async () => {
    if (!game || !currentUser || !isMyTurn) return;

    const updates: any = {
      turn: otherPlayerId,
      updatedAt: serverTimestamp()
    };

    // If I'm the second player to stand, finish the game
    // How to know if I'm second? Let's check if the other player already has cards and it's not their turn anymore.
    // Actually, simpler: if other player has stood already (but we don't have a 'stood' state)
    // Let's add a 'stood' field or just check if other player moved.
    
    // Better logic: 
    // Player 1 (first in array) starts.
    // When Player 1 stands, turn goes to Player 2.
    // When Player 2 stands, game is finished and winner is calculated.
    
    if (currentUser.uid === game.players[1]) {
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

  const myHand = game.hands[currentUser?.uid || ''] || [];
  const otherHand = game.hands[otherPlayerId || ''] || [];
  const myScore = game.scores[currentUser?.uid || ''] || 0;
  const otherScore = game.scores[otherPlayerId || ''] || 0;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white overflow-hidden relative font-sans" dir="rtl">
      {/* Header */}
      <div className="p-4 flex justify-between items-center bg-slate-800/50 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Coins className="text-primary w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg">لعبة الورق 21</h2>
            <p className="text-[10px] text-white/50 uppercase tracking-widest">تحدي الذكاء</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/10 rounded-full">
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 p-6 flex flex-col items-center justify-between">
        
        {/* Other Player Hand */}
        <div className="w-full flex flex-col items-center gap-4">
           <div className="flex items-center gap-3 bg-white/5 p-2 pr-4 rounded-full border border-white/10 opacity-60">
              <div className="text-left">
                <p className="text-[10px] font-bold text-white/40 uppercase">الخصم</p>
                <p className="text-xs font-bold text-white/80">{otherScore > 21 ? 'خاسر (تجاوز 21)' : `النقاط: ${otherScore}`}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden">
                <UserIcon className="w-6 h-6 text-white/20" />
              </div>
           </div>
           
           <div className="flex gap-2 min-h-[120px]">
             {otherHand.map((card, i) => (
               <Card key={`other-${i}`} code={game.status === 'playing' && i === 0 ? 'HIDDEN' : card} />
             ))}
           </div>
        </div>

        {/* Game Status Message */}
        <div className="text-center py-4">
           {game.status === 'finished' ? (
             <motion.div 
               initial={{ scale: 0.8, opacity: 0 }}
               animate={{ scale: 1, opacity: 1 }}
               className="flex flex-col items-center gap-2"
             >
               <Trophy className={`w-12 h-12 ${game.winner === currentUser?.uid ? 'text-yellow-400' : 'text-slate-400'}`} />
               <h3 className="text-2xl font-bold">
                 {game.winner === 'draw' ? 'تعادل!' : (game.winner === currentUser?.uid ? 'مبروك! لقد فزت' : 'حظ أوفر المرة القادمة')}
               </h3>
             </motion.div>
           ) : (
             <div className="px-6 py-2 rounded-full bg-white/5 border border-white/10">
               <p className="text-sm font-medium">
                 {isMyTurn ? 'دورك الآن: هل تسحب ورقة أم تكتفي؟' : 'انتظر دور الخصم...'}
               </p>
             </div>
           )}
        </div>

        {/* My Hand */}
        <div className="w-full flex flex-col items-center gap-4 pb-8">
           <div className="flex gap-2 min-h-[120px] mb-4">
             {myHand.map((card, i) => (
               <Card key={`my-${i}`} code={card} />
             ))}
           </div>

           <div className="flex items-center gap-3 bg-primary/10 p-2 pl-4 rounded-full border border-primary/20">
              <Avatar className="w-10 h-10 ring-2 ring-primary">
                <AvatarImage src={currentUser?.photoURL || undefined} />
                <AvatarFallback className="bg-primary text-white font-bold">{currentUser?.displayName?.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xs font-bold text-primary">أنت</p>
                <p className="text-sm font-bold text-white">{myScore > 21 ? 'خسرت (تجاوزت 21)' : `نقاطك: ${myScore}`}</p>
              </div>
           </div>

           {isMyTurn && (
             <div className="flex gap-4 w-full max-w-xs mt-4">
               <Button 
                onClick={drawCard} 
                disabled={myScore >= 21}
                className="flex-1 h-14 rounded-2xl bg-primary hover:bg-primary/90 text-lg font-bold shadow-lg shadow-primary/20"
               >
                 سحب ورقة
               </Button>
               <Button 
                onClick={stand}
                variant="outline"
                className="flex-1 h-14 rounded-2xl border-white/20 hover:bg-white/5 text-lg font-bold"
               >
                 اكتفاء
               </Button>
             </div>
           )}
        </div>

      </div>

      <div className="p-4 text-center bg-black/20 text-[10px] opacity-40 uppercase tracking-widest font-bold">
        لعبة الورق 21 - تليعراق بريميوم
      </div>
    </div>
  );
}

function Card({ code }: { code: string }) {
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
      className={`w-20 h-28 bg-white rounded-lg shadow-xl flex flex-col p-2 select-none ${isRed ? 'text-red-500' : 'text-slate-900'}`}
    >
      <div className="flex justify-between items-start">
        <span className="font-bold text-lg leading-none">{value}</span>
        <span className="text-sm leading-none">{getSuitIcon()}</span>
      </div>
      <div className="flex-1 flex items-center justify-center text-3xl">
        {getSuitIcon()}
      </div>
      <div className="flex justify-between items-end rotate-180">
        <span className="font-bold text-lg leading-none">{value}</span>
        <span className="text-sm leading-none">{getSuitIcon()}</span>
      </div>
    </motion.div>
  );
}

export { createDeck };
