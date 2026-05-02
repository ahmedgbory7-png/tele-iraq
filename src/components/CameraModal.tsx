import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';

interface CameraModalProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
}

export function CameraModal({ onCapture, onClose }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState<string | null>(null);

  const startCamera = async () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false
      });
      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      setIsReady(true);
      setError(null);
    } catch (err: any) {
      console.error("Camera access error:", err);
      setError("فشل الوصول إلى الكاميرا. يرجى التأكد من منح الأذونات اللازمة.");
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // If user mode (selfie), flip horizontally
        if (facingMode === 'user') {
          context.translate(canvas.width, 0);
          context.scale(-1, 1);
        }
        
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(dataUrl);
      }
    }
  };

  const flipCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    setIsReady(false);
  };

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  const sendPhoto = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-4"
    >
      <div className="relative w-full max-w-lg aspect-[3/4] bg-neutral-900 rounded-3xl overflow-hidden shadow-2xl">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white space-y-4">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
              <Camera className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-sm font-medium">{error}</p>
            <Button variant="outline" className="border-white/20 text-white hover:bg-white/10" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        ) : (
          <>
            {!capturedImage ? (
              <div className="relative w-full h-full">
                {!isReady && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                />
                
                <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
                  <Button variant="ghost" size="icon" className="rounded-full bg-black/40 text-white hover:bg-black/60 h-10 w-10" onClick={onClose}>
                    <X className="w-6 h-6" />
                  </Button>
                  <Button variant="ghost" size="icon" className="rounded-full bg-black/40 text-white hover:bg-black/60 h-10 w-10" onClick={flipCamera}>
                    <RefreshCw className="w-6 h-6" />
                  </Button>
                </div>

                <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center gap-8 z-10">
                  <button 
                    onClick={capturePhoto}
                    className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1 hover:scale-105 transition-transform active:scale-95"
                  >
                    <div className="w-full h-full rounded-full bg-white transition-all active:bg-white/80" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full">
                <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                
                <div className="absolute top-4 right-4 z-10">
                  <Button variant="ghost" size="icon" className="rounded-full bg-black/40 text-white hover:bg-black/60 h-10 w-10" onClick={onClose}>
                    <X className="w-6 h-6" />
                  </Button>
                </div>

                <div className="absolute bottom-10 left-4 right-4 flex justify-between items-center z-10">
                  <Button 
                    variant="ghost" 
                    className="rounded-full bg-black/40 text-white hover:bg-black/60 px-6 font-bold"
                    onClick={retakePhoto}
                  >
                    إعادة التقاط
                  </Button>
                  <Button 
                    className="rounded-full bg-primary text-white hover:bg-primary/90 px-8 font-bold gap-2 shadow-lg"
                    onClick={sendPhoto}
                  >
                    إرسال
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </motion.div>
  );
}
