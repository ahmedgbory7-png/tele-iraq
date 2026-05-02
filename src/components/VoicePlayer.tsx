import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface VoicePlayerProps {
  url: string;
  isMe: boolean;
}

export function VoicePlayer({ url, isMe }: VoicePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [url]);

  const togglePlay = () => {
    if (isLoading) return;
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSliderChange = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div className={`flex items-center gap-3 py-2 px-3 rounded-2xl ${isMe ? 'bg-primary/20' : 'bg-muted'} min-w-[200px]`} dir="ltr">
      <audio ref={audioRef} src={url} preload="metadata" />
      
      <button 
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isMe ? 'bg-white text-primary' : 'bg-primary text-white'} shadow-sm ios-touch active:scale-90`}
      >
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={0.1}
          onValueChange={handleSliderChange}
          className="cursor-pointer"
        />
        <div className="flex justify-between items-center px-0.5">
          <span className={`text-[9px] font-medium ${isMe ? 'text-white/80' : 'text-muted-foreground'}`}>
            {formatTime(currentTime)}
          </span>
          <span className={`text-[9px] font-medium ${isMe ? 'text-white/80' : 'text-muted-foreground'}`}>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center -gap-1">
        {/* Waveform visualization placeholder */}
        <div className="flex items-end gap-[1px] h-4">
          {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.4, 0.6, 0.5, 0.7, 0.4].map((h, i) => (
            <div 
              key={i} 
              className={`w-[2px] rounded-full ${isMe ? 'bg-white/40' : 'bg-primary/30'}`} 
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
