import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Circle, RotateCcw, Trophy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface XOGameProps {
  onMove?: (board: ('X' | 'O' | null)[], winner: 'X' | 'O' | 'Draw' | null) => void;
  gameState: ('X' | 'O' | null)[];
  isPlayerTurn: boolean;
  gameWinner: 'X' | 'O' | 'Draw' | null;
}

export function XOGame({ onMove, gameState, isPlayerTurn, gameWinner }: XOGameProps) {
  const [board, setBoard] = useState<('X' | 'O' | null)[]>(gameState);

  useEffect(() => {
    setBoard(gameState);
  }, [gameState]);

  const calculateWinner = (squares: ('X' | 'O' | null)[]) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6],
    ];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return squares[a];
      }
    }
    if (!squares.includes(null)) return 'Draw';
    return null;
  };

  const handleClick = (i: number) => {
    if (board[i] || gameWinner || !isPlayerTurn) return;

    const newBoard = [...board];
    const currentPlayerSymbol = board.filter(x => x).length % 2 === 0 ? 'X' : 'O';
    newBoard[i] = currentPlayerSymbol;
    
    const result = calculateWinner(newBoard);
    onMove?.(newBoard, result as any);
  };

  const resetGame = () => {
    onMove?.(Array(9).fill(null), null);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6 bg-card rounded-3xl border shadow-xl max-w-sm mx-auto">
      <div className="text-center space-y-1">
        <h3 className="font-black text-xl text-primary tracking-tighter">تحدي XO</h3>
        <p className="text-xs text-muted-foreground font-medium">
          {gameWinner ? (gameWinner === 'Draw' ? 'تعادل!' : `الفائز هو ${gameWinner}!`) : (isPlayerTurn ? 'دورك الآن' : 'بانتظار الخصم...')}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full aspect-square">
        {board.map((square, i) => (
          <motion.button
            key={i}
            whileHover={!square && isPlayerTurn && !gameWinner ? { scale: 0.95 } : {}}
            whileTap={!square && isPlayerTurn && !gameWinner ? { scale: 0.9 } : {}}
            onClick={() => handleClick(i)}
            disabled={!!square || !isPlayerTurn || !!gameWinner}
            className={`aspect-square rounded-2xl flex items-center justify-center text-3xl shadow-sm border transition-all ${
              square === 'X' ? 'bg-blue-500/10 border-blue-500/20 text-blue-600' : 
              square === 'O' ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' : 
              'bg-muted/30 border-primary/5'
            }`}
          >
            <AnimatePresence mode="wait">
              {square === 'X' && (
                <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
                  <X className="w-10 h-10 stroke-[3]" />
                </motion.div>
              )}
              {square === 'O' && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                  <Circle className="w-9 h-9 stroke-[3]" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        ))}
      </div>

      <div className="flex gap-3 w-full">
        <Button 
          variant="outline" 
          onClick={resetGame} 
          className="flex-1 rounded-xl h-11 font-bold gap-2 text-xs"
        >
          <RotateCcw className="w-4 h-4" /> إعادة البدء
        </Button>
      </div>
    </div>
  );
}
