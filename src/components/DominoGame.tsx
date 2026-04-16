import React, { useState, useEffect } from 'react';
import { db } from '@/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { DominoGame as DominoGameType, UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Loader2, RefreshCw } from 'lucide-react';

interface DominoGameProps {
  gameId: string;
  currentUser: UserProfile | null;
  onClose: () => void;
}

export function DominoGame({ gameId, currentUser, onClose }: DominoGameProps) {
  const [game, setGame] = useState<DominoGameType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId) return;

    const unsubscribe = onSnapshot(doc(db, 'games', gameId), (snapshot) => {
      if (snapshot.exists()) {
        setGame({ id: snapshot.id, ...snapshot.data() } as DominoGameType);
      } else {
        onClose();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [gameId, onClose]);

  const isMyTurn = game?.turn === currentUser?.uid;
  const myHand = game?.hands[currentUser?.uid || ''] || [];
  const otherPlayerId = game?.players.find(p => p !== currentUser?.uid);

  const canPlay = (piece: { a: number; b: number }) => {
    if (!game || game.status !== 'playing') return false;
    if (game.board.pieces.length === 0) return true;
    return piece.a === game.board.left || piece.b === game.board.left ||
           piece.a === game.board.right || piece.b === game.board.right;
  };

  const handlePlayPiece = async (piece: { a: number; b: number }, index: number) => {
    if (!game || !isMyTurn || !canPlay(piece)) return;

    const newHand = [...myHand];
    newHand.splice(index, 1);

    const newBoard = { ...game.board };
    let playedPiece: { value: { a: number; b: number }, side: 'left' | 'right' };

    if (newBoard.pieces.length === 0) {
      playedPiece = { value: piece, side: 'left' };
      newBoard.left = piece.a;
      newBoard.right = piece.b;
    } else {
      // Logic to determine which side and orientation
      if (piece.a === newBoard.left) {
        playedPiece = { value: { a: piece.b, b: piece.a }, side: 'left' };
        newBoard.left = piece.b;
      } else if (piece.b === newBoard.left) {
        playedPiece = { value: { a: piece.a, b: piece.b }, side: 'left' };
        newBoard.left = piece.a;
      } else if (piece.a === newBoard.right) {
        playedPiece = { value: { a: piece.a, b: piece.b }, side: 'right' };
        newBoard.right = piece.b;
      } else {
        playedPiece = { value: { a: piece.b, b: piece.a }, side: 'right' };
        newBoard.right = piece.a;
      }
    }

    if (playedPiece.side === 'left') {
      newBoard.pieces.unshift(playedPiece);
    } else {
      newBoard.pieces.push(playedPiece);
    }

    const updates: any = {
      board: newBoard,
      [`hands.${currentUser?.uid}`]: newHand,
      turn: otherPlayerId,
      updatedAt: serverTimestamp()
    };

    if (newHand.length === 0) {
      updates.status = 'finished';
      updates.winner = currentUser?.uid;
    }

    await updateDoc(doc(db, 'games', gameId), updates);
  };

  const handleDraw = async () => {
    if (!game || !isMyTurn || game.boneyard.length === 0) return;

    const newBoneyard = [...game.boneyard];
    const drawnPiece = newBoneyard.pop();
    const newHand = [...myHand, drawnPiece!];

    await updateDoc(doc(db, 'games', gameId), {
      boneyard: newBoneyard,
      [`hands.${currentUser?.uid}`]: newHand,
      updatedAt: serverTimestamp()
    });
  };

  const handleSkip = async () => {
    if (!game || !isMyTurn) return;
    await updateDoc(doc(db, 'games', gameId), {
      turn: otherPlayerId,
      updatedAt: serverTimestamp()
    });
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
          <h2 className="font-bold text-lg">لعبة الدومينا</h2>
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

      {/* Game Board */}
      <div className="flex-1 relative overflow-auto p-8 flex items-center justify-center">
        <div className="flex flex-wrap items-center justify-center gap-1 max-w-full">
          {game.board.pieces.map((p, i) => (
            <DominoPiece key={i} value={p.value} size="sm" />
          ))}
          {game.board.pieces.length === 0 && (
            <div className="text-white/20 text-center">
              <RefreshCw className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>ابدأ اللعب بوضع أول قطعة</p>
            </div>
          )}
        </div>
      </div>

      {/* Boneyard & Actions */}
      <div className="p-4 flex justify-between items-center bg-black/40 border-t border-white/10">
        <div className="text-sm text-white/60">
          المتبقي: {game.boneyard.length} قطعة
        </div>
        <div className="flex gap-2">
          {isMyTurn && game.status === 'playing' && (
            <>
              <Button 
                onClick={handleDraw} 
                disabled={game.boneyard.length === 0}
                className="bg-primary hover:bg-primary/90"
              >
                سحب قطعة
              </Button>
              <Button 
                onClick={handleSkip}
                variant="outline"
                className="border-white/20 hover:bg-white/10"
              >
                تخطي الدور
              </Button>
            </>
          )}
        </div>
      </div>

      {/* My Hand */}
      <div className="p-6 bg-black/60">
        <div className="flex flex-wrap justify-center gap-3">
          {myHand.map((piece, i) => (
            <button
              key={i}
              onClick={() => handlePlayPiece(piece, i)}
              disabled={!isMyTurn || !canPlay(piece)}
              className={`transition-transform hover:-translate-y-2 disabled:opacity-50 disabled:hover:translate-y-0 ${canPlay(piece) && isMyTurn ? 'ring-2 ring-primary ring-offset-2 ring-offset-black rounded-md' : ''}`}
            >
              <DominoPiece value={piece} />
            </button>
          ))}
        </div>
      </div>

      {/* Winner Overlay */}
      <AnimatePresence>
        {game.status === 'finished' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
          >
            <div className="text-center">
              <Trophy className="h-20 w-20 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold mb-2">
                {game.winner === currentUser?.uid ? 'مبروك! لقد فزت' : 'حظ أوفر في المرة القادمة'}
              </h2>
              <p className="text-white/60 mb-8">انتهت اللعبة</p>
              <Button onClick={onClose} size="lg" className="w-full bg-primary hover:bg-primary/90">
                العودة للدردشة
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DominoPieceProps {
  value: { a: number; b: number };
  size?: 'sm' | 'md';
  key?: React.Key;
}

function DominoPiece({ value, size = 'md' }: DominoPieceProps) {
  const width = size === 'sm' ? 'w-8' : 'w-12';
  const height = size === 'sm' ? 'h-16' : 'h-24';

  return (
    <div className={`${width} ${height} bg-white rounded-md flex flex-col border-2 border-gray-300 shadow-lg overflow-hidden`}>
      <div className="flex-1 flex items-center justify-center p-1">
        <Dots count={value.a} size={size} />
      </div>
      <div className="h-[2px] bg-gray-300 w-full" />
      <div className="flex-1 flex items-center justify-center p-1">
        <Dots count={value.b} size={size} />
      </div>
    </div>
  );
}

function Dots({ count, size }: { count: number, size: 'sm' | 'md' }) {
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5';
  
  const getGridClass = () => {
    if (count === 0) return '';
    if (count === 1) return 'flex items-center justify-center';
    return 'grid grid-cols-2 gap-1 p-1';
  };

  const renderDots = () => {
    const dots = [];
    for (let i = 0; i < count; i++) {
      dots.push(<div key={i} className={`${dotSize} bg-black rounded-full shadow-inner`} />);
    }
    return dots;
  };

  return (
    <div className={`w-full h-full ${getGridClass()}`}>
      {renderDots()}
    </div>
  );
}
