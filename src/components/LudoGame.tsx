import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Dices, 
  Trophy, 
  RotateCcw, 
  Loader2, 
  X,
  Crown,
  Info
} from 'lucide-react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebase';
import { Button } from './ui/button';
import { useStore } from '@/store/useStore';

interface LudoGameProps {
  gameId: string;
  currentUser: any;
  onClose: () => void;
}

// Ludo Constants: Classic 15x15 board
const BOARD_SIZE = 15;

// Defined coordinates for the path (0 to 51) for Red and Blue
// This is a simplified path for a 15x15 Ludo board
const RED_START_PATH = 0;
const BLUE_START_PATH = 26;

// Function to get grid coordinates for a given player's path position
const getGridCoords = (playerColor: 'red' | 'blue', pos: number) => {
  // pos ranges from -1 (base) to 57 (home)
  // Base positions
  if (pos === -1) {
    return null; // Handle base separately
  }

  // Home stretch
  if (pos >= 52) {
    const step = pos - 52; // 0 to 5
    if (playerColor === 'red') return { r: 7, c: 1 + step };
    if (playerColor === 'blue') return { r: 7, c: 13 - step };
  }

  // Path coordinates (0 to 51)
  // This is a mapping of the Ludo path on a 15x15 grid
  const fullPathCoords = [
    {r:6,c:1}, {r:6,c:2}, {r:6,c:3}, {r:6,c:4}, {r:6,c:5}, // Top section
    {r:5,c:6}, {r:4,c:6}, {r:3,c:6}, {r:2,c:6}, {r:1,c:6}, {r:0,c:6},
    {r:0,c:7}, {r:0,c:8},
    {r:1,c:8}, {r:2,c:8}, {r:3,c:8}, {r:4,c:8}, {r:5,c:8},
    {r:6,c:9}, {r:6,c:10}, {r:6,c:11}, {r:6,c:12}, {r:6,c:13}, {r:6,c:14},
    {r:7,c:14}, {r:8,c:14},
    {r:8,c:13}, {r:8,c:12}, {r:8,c:11}, {r:8,c:10}, {r:8,c:9},
    {r:9,c:8}, {r:10,c:8}, {r:11,c:8}, {r:12,c:8}, {r:13,c:8}, {r:14,c:8},
    {r:14,c:7}, {r:14,c:6},
    {r:13,c:6}, {r:12,c:6}, {r:11,c:6}, {r:10,c:6}, {r:9,c:6},
    {r:8,c:5}, {r:8,c:4}, {r:8,c:3}, {r:8,c:2}, {r:8,c:1}, {r:8,c:0},
    {r:7,c:0}, {r:6,c:0}
  ];

  // Adjust path index based on color
  let idx = pos;
  if (playerColor === 'blue') {
    idx = (pos + 26) % 52;
  }
  return fullPathCoords[idx];
};

export default function LudoGame({ gameId, currentUser, onClose }: LudoGameProps) {
  const [game, setGame] = useState<any>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [diceValue, setDiceValue] = useState(1);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    const unsubscribe = onSnapshot(doc(db, 'games', gameId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setGame(data);
      }
    }, (err) => {
      console.error("Ludo snapshot error:", err);
    });

    return () => unsubscribe();
  }, [gameId]);

  const isMyTurn = game?.turn === currentUser?.uid && game?.status === 'playing';
  const myColor: 'red' | 'blue' = game?.players?.[0] === currentUser?.uid ? 'red' : 'blue';
  const otherPlayerId = game?.players?.find((p: string) => p !== currentUser?.uid);

  // Initialize game pieces if missing
  useEffect(() => {
    if (game && (!game.pieces || !game.pieces[currentUser?.uid])) {
       const init = async () => {
         const initialPieces = {
           [game.players[0]]: [-1, -1, -1, -1],
           [game.players[1]]: [-1, -1, -1, -1]
         };
         try {
           await updateDoc(doc(db, 'games', gameId), { pieces: initialPieces, waitingForMove: false, lastRoll: null });
         } catch (e) {}
       };
       init();
    }
  }, [game, currentUser?.uid, gameId]);

  const rollDice = async () => {
    if (!isMyTurn || isRolling || game.status !== 'playing' || game.waitingForMove) return;
    
    setIsRolling(true);
    let roll = 1;
    for (let i = 0; i < 8; i++) {
       roll = Math.floor(Math.random() * 6) + 1;
       setDiceValue(roll);
       await new Promise(r => setTimeout(r, 80));
    }
    
    const finalRoll = Math.floor(Math.random() * 6) + 1;
    setDiceValue(finalRoll);
    
    // Check possible moves
    const currentPieces = game.pieces[currentUser.uid];
    const canMove = currentPieces.some((p: number) => {
       if (p === -1) return finalRoll === 6;
       if (p >= 57) return false;
       return p + finalRoll <= 57;
    });

    if (!canMove) {
       setTimeout(async () => {
          try {
            await updateDoc(doc(db, 'games', gameId), { 
              lastRoll: finalRoll, 
              turn: otherPlayerId, 
              updatedAt: serverTimestamp() 
            });
          } catch(e) {}
       }, 1000);
    } else {
       try {
         await updateDoc(doc(db, 'games', gameId), { 
           lastRoll: finalRoll, 
           waitingForMove: true, 
           updatedAt: serverTimestamp() 
         });
       } catch(e) {}
    }
    
    setIsRolling(false);
  };

  const movePiece = async (idx: number) => {
    if (!isMyTurn || !game.waitingForMove) return;
    
    const roll = game.lastRoll;
    const myPieces = [...game.pieces[currentUser.uid]];
    const otherPieces = [...game.pieces[otherPlayerId]];
    let currentPos = myPieces[idx];

    if (currentPos === -1) {
       if (roll === 6) currentPos = 0;
       else return;
    } else {
       if (currentPos + roll > 57) return;
       currentPos += roll;
    }

    myPieces[idx] = currentPos;
    
    const updates: any = {
      [`pieces.${currentUser.uid}`]: myPieces,
      waitingForMove: false,
      updatedAt: serverTimestamp()
    };

    // Knocking logic
    let extraTurn = roll === 6;
    
    if (currentPos < 52) {
       // Convert my relative pos to absolute index
       const myAbsIdx = myColor === 'red' ? currentPos : (currentPos + 26) % 52;
       
       // Safe Squares check (Absolute Indices)
       // Standard Ludo active board steps: 1, 9, 14, 22, 27, 35, 40, 48 (approx)
       // Let's use the safe cells defined in UI:
       // (r:6,c:1) is Red Start, absIdx 0
       // (r:8,c:13) is Blue Start, absIdx 26
       const safeIndices = [0, 8, 13, 21, 26, 34, 39, 47];
       
       if (!safeIndices.includes(myAbsIdx)) {
          let knocked = false;
          const updatedOtherPieces = otherPieces.map((p) => {
             if (p === -1 || p >= 52) return p;
             const otherAbsIdx = myColor === 'red' ? (p + 26) % 52 : p;
             if (otherAbsIdx === myAbsIdx) {
                knocked = true;
                return -1;
             }
             return p;
          });
          
          if (knocked) {
             updates[`pieces.${otherPlayerId}`] = updatedOtherPieces;
             extraTurn = true; // Extra turn for knocking
          }
       }
    }

    if (!extraTurn) {
       updates.turn = otherPlayerId;
    }

    if (myPieces.every(p => p === 57)) {
       updates.status = 'finished';
       updates.winner = currentUser.uid;
    }

    try {
      await updateDoc(doc(db, 'games', gameId), updates);
    } catch(e) {}
  };

  const resetGame = async () => {
    try {
      await updateDoc(doc(db, 'games', gameId), {
        status: 'playing',
        winner: null,
        pieces: {
          [game.players[0]]: [-1, -1, -1, -1],
          [game.players[1]]: [-1, -1, -1, -1]
        },
        turn: game.players[0],
        lastRoll: null,
        waitingForMove: false,
        updatedAt: serverTimestamp()
      });
    } catch(e) {}
  };

  if (!game) return (
     <div className="flex h-full items-center justify-center bg-slate-900">
       <Loader2 className="w-8 h-8 animate-spin text-primary" />
     </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#0b0f19] text-white overflow-hidden font-sans select-none" dir="rtl">
      {/* Premium Header */}
      <div className="p-3 flex justify-between items-center bg-[#161d31] border-b border-white/5 shrink-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Dices className="text-white w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-sm tracking-tight">اللودو الأصلي (Ludo)</h2>
            <div className="flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
               <p className="text-[8px] text-white/40 uppercase tracking-widest leading-none">الملعب الملكي</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setShowRules(!showRules)} className="text-white/40 hover:bg-white/5 rounded-full h-8 w-8">
            <Info className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white/40 hover:bg-white/5 rounded-full h-8 w-8">
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col p-4 items-center justify-center gap-6 no-scrollbar relative">
        
        {/* Background Decorative Elements */}
        <div className="absolute top-20 left-10 w-32 h-32 bg-blue-500/10 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-20 right-10 w-32 h-32 bg-red-500/10 blur-[100px] pointer-events-none" />

        {/* Board Design */}
        <div className="relative w-full max-w-[360px] aspect-square bg-[#1e293b] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-1.5 border-4 border-slate-700/50">
           <div className="grid grid-cols-15 grid-rows-15 w-full h-full gap-[2px]">
              {Array.from({ length: 225 }).map((_, i) => {
                const r = Math.floor(i / 15);
                const c = i % 15;
                
                let bgColor = "bg-slate-700/20";
                
                // Bases
                if (r < 6 && c < 6) bgColor = "bg-red-500/10 border border-red-500/20";
                if (r < 6 && c > 8) bgColor = "bg-green-500/10 opacity-20";
                if (r > 8 && c < 6) bgColor = "bg-yellow-500/10 opacity-20";
                if (r > 8 && c > 8) bgColor = "bg-blue-500/10 border border-blue-500/20";
                
                // Home Stretch
                if (r === 7 && c > 0 && c < 7) bgColor = "bg-red-500/40";
                if (r === 7 && c > 7 && c < 14) bgColor = "bg-blue-500/40";
                if (c === 7 && r > 0 && r < 7) bgColor = "bg-green-500/40 opacity-20";
                if (c === 7 && r > 7 && r < 14) bgColor = "bg-yellow-500/40 opacity-20";

                // Starting Cells
                if (r === 6 && c === 1) bgColor = "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]";
                if (r === 8 && c === 13) bgColor = "bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]";

                // Safe Squares (Classic Stars)
                const isSafe = (r === 6 && c === 1) || (r === 8 && c === 13) || (r === 2 && c === 8) || (r === 12 && c === 6) || (r === 1 && c === 6) || (r === 13 && c === 8) || (r === 6 && c === 12) || (r === 8 && c === 2);

                return (
                  <div key={i} className={`w-full h-full ${bgColor} rounded-[2px] relative flex items-center justify-center`}>
                    {isSafe && <div className="text-[6px] opacity-40">⭐</div>}
                    {r >= 6 && r <= 8 && c >= 6 && c <= 8 && r === 7 && c === 7 && (
                      <Trophy className="w-8 h-8 text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)] animate-pulse" />
                    )}
                  </div>
                );
              })}
           </div>

           {/* Pieces Layer */}
           <div className="absolute inset-1.5 pointer-events-none">
              {/* Red - Player 1 */}
              {game.pieces?.[game.players[0]]?.map((pos: number, idx: number) => {
                const coords = getGridCoords('red', pos);
                const inBase = pos === -1;
                
                return (
                  <motion.div
                    key={`red-${idx}`}
                    initial={false}
                    animate={{
                      left: inBase ? `${15 + (idx % 2) * 15}%` : `${(coords?.c || 0) * 6.66}%`,
                      top: inBase ? `${15 + Math.floor(idx / 2) * 15}%` : `${(coords?.r || 0) * 6.66}%`,
                      scale: inBase ? 1.2 : 1
                    }}
                    className={`absolute w-[6.66%] h-[6.66%] rounded-full shadow-2xl flex items-center justify-center p-0.5
                      ${game.players[0] === currentUser.uid && isMyTurn && game.waitingForMove ? 'pointer-events-auto cursor-pointer ring-4 ring-white animate-bounce z-50' : 'z-20'}`}
                    style={{ backgroundColor: '#ef4444' }}
                    onClick={() => game.players[0] === currentUser.uid && movePiece(idx)}
                  >
                    <div className="w-full h-full rounded-full border-2 border-white/40 flex items-center justify-center">
                       <div className="w-1.5 h-1.5 bg-white rounded-full shadow-inner" />
                    </div>
                  </motion.div>
                );
              })}

              {/* Blue - Player 2 */}
              {game.pieces?.[game.players[1]]?.map((pos: number, idx: number) => {
                const coords = getGridCoords('blue', pos);
                const inBase = pos === -1;
                
                return (
                  <motion.div
                    key={`blue-${idx}`}
                    initial={false}
                    animate={{
                      left: inBase ? `${70 + (idx % 2) * 15}%` : `${(coords?.c || 0) * 6.66}%`,
                      top: inBase ? `${70 + Math.floor(idx / 2) * 15}%` : `${(coords?.r || 0) * 6.66}%`,
                      scale: inBase ? 1.2 : 1
                    }}
                    className={`absolute w-[6.66%] h-[6.66%] rounded-full shadow-2xl flex items-center justify-center p-0.5
                      ${game.players[1] === currentUser.uid && isMyTurn && game.waitingForMove ? 'pointer-events-auto cursor-pointer ring-4 ring-white animate-bounce z-50' : 'z-20'}`}
                    style={{ backgroundColor: '#3b82f6' }}
                    onClick={() => game.players[1] === currentUser.uid && movePiece(idx)}
                  >
                    <div className="w-full h-full rounded-full border-2 border-white/40 flex items-center justify-center">
                       <div className="w-1.5 h-1.5 bg-white rounded-full shadow-inner" />
                    </div>
                  </motion.div>
                );
              })}
           </div>
        </div>

        {/* Dice Controls Area */}
        <div className="w-full max-w-[340px] flex flex-col gap-5">
           {game.status === 'finished' ? (
              <motion.div 
                 initial={{ opacity: 0, scale: 0.9 }}
                 animate={{ opacity: 1, scale: 1 }}
                 className="bg-gradient-to-b from-[#1e293b] to-[#0f172a] border border-white/10 rounded-3xl p-6 text-center shadow-2xl"
              >
                 <Crown className={`w-14 h-14 mx-auto mb-4 ${game.winner === currentUser.uid ? 'text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]' : 'text-slate-500'}`} />
                 <h3 className="text-2xl font-black mb-2">{game.winner === currentUser.uid ? '🎉 بطل اللودو العراقي!' : '💔 حاول مرة أخرى'}</h3>
                 <p className="text-sm text-white/50 mb-6">لقد خضت معركة ملحمية في أرض اللودو</p>
                 <Button onClick={resetGame} className="w-full h-12 bg-yellow-500 hover:bg-yellow-600 text-black font-black rounded-xl gap-2 ios-touch">
                    <RotateCcw className="w-4 h-4" /> تحدي جديد
                 </Button>
              </motion.div>
           ) : (
              <div className="flex items-center justify-between gap-4">
                 <PlayerCard color="red" name="أحمر" isActive={game.turn === game.players[0]} />
                 
                 <div className="flex flex-col items-center gap-3">
                    <motion.div
                       whileTap={{ scale: 0.9 }}
                       onClick={rollDice}
                       className={`w-20 h-20 bg-white rounded-3xl shadow-2xl flex items-center justify-center relative cursor-pointer
                         ${!isMyTurn || game.waitingForMove ? 'grayscale opacity-40 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                    >
                       <AnimatePresence mode="wait">
                          <motion.div
                             key={diceValue}
                             initial={{ rotate: -90, opacity: 0 }}
                             animate={isRolling ? { rotate: [0, 90, 180, 270, 360], scale: [1, 1.1, 1] } : { rotate: 0, opacity: 1 }}
                             className="grid grid-cols-3 grid-rows-3 gap-1.5 w-12 h-12 p-1"
                          >
                             {(diceValue === 1 || diceValue === 3 || diceValue === 5) && <div className="bg-slate-900 rounded-full col-start-2 row-start-2" />}
                             {(diceValue >= 2) && <><div className="bg-slate-900 rounded-full col-start-1 row-start-1" /><div className="bg-slate-900 rounded-full col-start-3 row-start-3" /></>}
                             {(diceValue >= 4) && <><div className="bg-slate-900 rounded-full col-start-3 row-start-1" /><div className="bg-slate-900 rounded-full col-start-1 row-start-3" /></>}
                             {(diceValue === 6) && <><div className="bg-slate-900 rounded-full col-start-1 row-start-2" /><div className="bg-slate-900 rounded-full col-start-3 row-start-2" /></>}
                          </motion.div>
                       </AnimatePresence>
                       {isMyTurn && !game.waitingForMove && !isRolling && (
                         <div className="absolute inset-0 border-4 border-yellow-500 rounded-3xl animate-pulse" />
                       )}
                    </motion.div>
                    
                    {isMyTurn && game.waitingForMove && (
                       <span className="text-[10px] font-bold text-yellow-500 animate-pulse tracking-tight">حرك قطعتك!</span>
                    )}
                 </div>

                 <PlayerCard color="blue" name="أزرق" isActive={game.turn === game.players[1]} />
              </div>
           )}
        </div>
      </div>

      {/* Rules Modal */}
      <AnimatePresence>
         {showRules && (
           <motion.div
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             className="absolute inset-0 bg-black/80 z-[100] flex items-center justify-center p-6 backdrop-blur-md"
           >
              <div className="bg-[#161d31] w-full rounded-3xl p-6 border border-white/10 space-y-4">
                 <div className="flex justify-between items-center border-b border-white/5 pb-3">
                    <h3 className="font-bold text-lg text-yellow-500">قواعد اللعب</h3>
                    <Button variant="ghost" size="icon" onClick={() => setShowRules(false)} className="rounded-full">
                       <X className="w-5 h-5" />
                    </Button>
                 </div>
                 <div className="space-y-3 text-xs leading-relaxed text-white/70">
                    <p>• تحتاج إلى رمي نرد 6 لإخراج قطعة من القاعدة.</p>
                    <p>• الرمية 6 تعطيك رمية إضافية.</p>
                    <p>• الفائز هو من يوصل جميع قطعه الأربعة إلى المركز.</p>
                    <p>• يمكنك استراتيجياً منع الخصم من التقدم بمناورتك.</p>
                 </div>
                 <Button onClick={() => setShowRules(false)} className="w-full bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold">حسناً، فهمت</Button>
              </div>
           </motion.div>
         )}
      </AnimatePresence>

      {/* Footer Turn Indicator */}
      <div className="p-4 bg-[#161d31]/50 backdrop-blur-xl border-t border-white/5 mt-auto">
         <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
               <div className={`w-2 h-2 rounded-full ${isMyTurn ? 'bg-green-500 animate-pulse' : 'bg-white/10'}`} />
               <span className={`text-[10px] font-bold uppercase tracking-widest ${isMyTurn ? 'text-green-500' : 'text-white/30'}`}>
                  {isMyTurn ? 'دورك للمناورة' : 'انتظر قرار الخصم'}
               </span>
            </div>
            {game.lastRoll && (
               <div className="bg-yellow-500/10 px-4 py-1.5 rounded-full border border-yellow-500/20">
                  <span className="text-[10px] font-black text-yellow-500 tracking-tighter">الرمية السابقة: {game.lastRoll}</span>
               </div>
            )}
         </div>
      </div>
    </div>
  );
}

function PlayerCard({ color, name, isActive }: { color: 'red' | 'blue', name: string, isActive: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-2 transition-all p-3 rounded-2xl border-2 ${isActive ? (color === 'red' ? 'border-red-500 bg-red-500/10' : 'border-blue-500 bg-blue-500/10') : 'border-transparent opacity-40 grayscale scale-90'}`}>
       <div className={`w-10 h-10 rounded-full shadow-lg ${color === 'red' ? 'bg-red-500' : 'bg-blue-500'} flex items-center justify-center`}>
          <Crown className="w-5 h-5 text-white/50" />
       </div>
       <span className="text-[10px] font-black uppercase text-white/60 tracking-wider">اللاعب {name}</span>
    </div>
  );
}
