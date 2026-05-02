import { Send } from 'lucide-react';

export function IraqLogo({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* App Icon Container - Premium circular container */}
      <div className="w-full h-full bg-white rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.15)] flex items-center justify-center p-[15%] relative overflow-hidden group transition-transform hover:scale-110 active:scale-95">
        
        {/* Subtle background gradient to give depth */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-50 to-gray-200/50"></div>

        {/* Chat Bubble Logo with Iraqi Flag Colors */}
        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-[0_5px_15px_rgba(0,0,0,0.2)] z-10"
        >
          <defs>
            <linearGradient id="flagGradientIcon" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ce1126" /> {/* Red */}
              <stop offset="35%" stopColor="#ce1126" />
              <stop offset="35%" stopColor="#ffffff" /> {/* White */}
              <stop offset="65%" stopColor="#ffffff" />
              <stop offset="65%" stopColor="#0a0a0a" /> {/* Black */}
              <stop offset="100%" stopColor="#0a0a0a" />
            </linearGradient>
          </defs>

          {/* Chat Bubble Shape */}
          <path
            d="M50 15C30.67 15 15 28.43 15 45C15 54.41 20.25 62.69 28.16 68.16C27.41 73.1 24.32 78.43 19.49 81.68C18.42 82.39 18.66 83.91 19.86 84.28C27.42 86.6 34.34 84.14 39.51 79.91C42.82 81.24 46.35 81.99 50 81.99C69.33 81.99 85 68.56 85 51.99C85 35.43 69.33 15 50 15Z"
            fill="url(#flagGradientIcon)"
          />
          
          {/* Detailed accents representing Iraqi identity */}
          <text
            x="50"
            y="52"
            fill="#007a3d"
            fontSize="7"
            fontWeight="900"
            fontFamily="Arial, sans-serif"
            textAnchor="middle"
            className="select-none font-black"
          >
            الله أكبر
          </text>
        </svg>

        {/* Glossy highlight effect */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-transparent via-white/20 to-white/40 pointer-events-none"></div>
      </div>

      {/* Outer focus glow */}
      <div className="absolute -inset-2 bg-primary/10 rounded-full blur-2xl -z-10 group-hover:bg-primary/20 transition-all"></div>
    </div>
  );
}
