import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { Button } from '@/components/ui/button';
import { RotateCcw, Trophy, AlertCircle } from 'lucide-react';

interface ChessGameProps {
  onMove?: (fen: string, winner: string | null) => void;
  gameState: string; // FEN
  isPlayerTurn: boolean;
  gameWinner: string | null;
}

export function ChessGame({ onMove, gameState, isPlayerTurn, gameWinner }: ChessGameProps) {
  const [game, setGame] = useState(new Chess(gameState));
  const [moveFrom, setMoveFrom] = useState("");
  const [optionSquares, setOptionSquares] = useState({});

  useEffect(() => {
    if (gameState !== game.fen()) {
      setGame(new Chess(gameState));
    }
  }, [gameState]);

  function makeAMove(move: any) {
    try {
      const gameCopy = new Chess(game.fen());
      const result = gameCopy.move(move);
      
      if (result) {
        setGame(gameCopy);
        let winner = null;
        if (gameCopy.isCheckmate()) {
          winner = gameCopy.turn() === 'w' ? 'Black' : 'White';
        } else if (gameCopy.isDraw()) {
          winner = 'Draw';
        }
        onMove?.(gameCopy.fen(), winner);
        return result;
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (!isPlayerTurn) return false;
    const move = makeAMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q", // always promote to queen for simplicity
    });
    if (move === null) return false;
    return true;
  }

  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    onMove?.(newGame.fen(), null);
  };

  const ChessBoardAny = Chessboard as any;

  return (
    <div className="flex flex-col items-center gap-6 p-4 bg-card rounded-3xl border shadow-xl max-w-sm mx-auto overflow-hidden">
      <div className="text-center space-y-1 w-full">
        <div className="flex items-center justify-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="font-black text-xl text-primary tracking-tighter">بطولة الشطرنج</h3>
        </div>
        <div className="flex items-center justify-center gap-2">
           <p className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isPlayerTurn ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
            {isPlayerTurn ? 'دورك الآن' : 'بانتظار الخصم...'}
          </p>
          {game.isCheck() && (
             <p className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 animate-pulse">
              كش ملك! ⚠️
            </p>
          )}
        </div>
      </div>

      <div className="w-full aspect-square shadow-2xl rounded-lg overflow-hidden border-4 border-muted">
        <ChessBoardAny 
          id="BasicBoard"
          position={game.fen()} 
          onPieceDrop={onDrop} 
          boardOrientation={isPlayerTurn ? (game.turn() === 'w' ? 'white' : 'black') : 'white'}
          customDarkSquareStyle={{ backgroundColor: "#3b82f6" }}
          customLightSquareStyle={{ backgroundColor: "#eff6ff" }}
          animationDuration={200}
          boardWidth={320}
        />
      </div>

      <div className="w-full grid grid-cols-2 gap-3">
        <Button 
          variant="outline" 
          onClick={resetGame} 
          className="rounded-xl h-10 font-bold gap-2 text-[10px]"
        >
          <RotateCcw className="w-3.5 h-3.5" /> إعادة البدء
        </Button>
        <div className="bg-muted/30 rounded-xl flex items-center justify-center text-[10px] font-medium border border-primary/5">
          {game.turn() === 'w' ? 'الأبيض' : 'الأسود'} - {Math.ceil(game.history().length / 2)} نقلة
        </div>
      </div>
      
      {(gameWinner || game.isGameOver()) && (
        <div className="w-full p-3 bg-primary/5 rounded-2xl border border-primary/20 text-center animate-bounce">
          <p className="text-xs font-black text-primary">🎉 انتهت اللعبة! {gameWinner || (game.isCheckmate() ? 'كش ملك' : 'تعادل')}</p>
        </div>
      )}
    </div>
  );
}
