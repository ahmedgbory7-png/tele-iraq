import { Phone } from 'lucide-react';

export function IraqLogo({ className = "w-16 h-16" }: { className?: string }) {
  return (
    <div className={`relative rounded-full overflow-hidden shadow-lg border-2 border-white/20 ${className}`}>
      {/* Iraqi Flag Stripes */}
      <div className="absolute inset-0 flex flex-col">
        <div className="flex-1 bg-[#ce1126]"></div> {/* Red */}
        <div className="flex-1 bg-white"></div>    {/* White */}
        <div className="flex-1 bg-black"></div>    {/* Black */}
      </div>
      
      {/* Center Icon Overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white/90 p-1.5 rounded-full shadow-sm">
          <Phone className="w-1/2 h-1/2 text-[#007a3d]" fill="currentColor" />
        </div>
      </div>
    </div>
  );
}
