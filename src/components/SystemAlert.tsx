import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '@/store/useStore';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

export function SystemAlert() {
  const { appAlert, setAppAlert } = useStore();

  useEffect(() => {
    if (appAlert) {
      const timer = setTimeout(() => {
        setAppAlert(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [appAlert, setAppAlert]);

  return (
    <AnimatePresence>
      {appAlert && (
        <motion.div
          initial={{ opacity: 0, y: -50, x: '-50%' }}
          animate={{ opacity: 1, y: 20, x: '-50%' }}
          exit={{ opacity: 0, y: -50, x: '-50%' }}
          className="fixed top-0 left-1/2 z-[9999] w-full max-w-sm px-4"
        >
          <div className={`
            flex items-center gap-3 p-4 rounded-2xl shadow-2xl border backdrop-blur-md
            ${appAlert.type === 'error' ? 'bg-red-500/90 border-red-400 text-white' : ''}
            ${appAlert.type === 'warning' ? 'bg-amber-500/90 border-amber-400 text-white' : ''}
            ${appAlert.type === 'info' ? 'bg-blue-500/90 border-blue-400 text-white' : ''}
          `}>
            {appAlert.type === 'error' && <AlertCircle className="w-5 h-5 shrink-0" />}
            {appAlert.type === 'warning' && <AlertCircle className="w-5 h-5 shrink-0" />}
            {appAlert.type === 'info' && <Info className="w-5 h-5 shrink-0" />}
            
            <p className="flex-1 text-sm font-medium leading-tight">
              {appAlert.message}
            </p>

            <button 
              onClick={() => setAppAlert(null)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
