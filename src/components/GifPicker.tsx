import React, { useState } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import { Grid, SearchBar, SearchContext, SearchContextManager } from '@giphy/react-components';
import { X, Search as SearchIcon, Ghost, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Public Beta Key - for demo purposes. 
// User should replace with their own in production.
const GIPHY_API_KEY = (import.meta as any).env.VITE_GIPHY_API_KEY || '0UtS93K9IdG694vBC6sqS0YnF8P680YV';

interface GifPickerProps {
  onSelect: (gif: any, type: 'image' | 'sticker') => void;
  onClose: () => void;
}

const GridContainer = ({ onSelect, type }: { onSelect: (gif: any, type: 'image' | 'sticker') => void, type: 'image' | 'sticker' }) => {
  const { fetchGifs, searchKey } = React.useContext(SearchContext);
  const [error, setError] = useState<string | null>(null);
  
  return (
    <div className="h-[300px] overflow-y-auto no-scrollbar pt-2 relative">
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center space-y-3 bg-background/80 backdrop-blur-sm z-10">
          <div className="bg-destructive/10 p-2 rounded-full">
            <X className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <p className="text-sm text-destructive font-bold">خطأ في الاتصال</p>
            <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px]">
              {error.includes('Unauthorized') 
                ? 'مفتاح GIPHY API غير صالح أو منتهي الصلاحية. يرجى تحديث المفتاح في الإعدادات.' 
                : 'حدث خطأ أثناء تحميل المحتوى. يرجى المحاولة لاحقاً.'}
            </p>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setError(null)}>
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <Grid
          width={280}
          columns={3}
          gutter={4}
          fetchGifs={async (offset: number) => {
            try {
              return await fetchGifs(offset);
            } catch (err: any) {
              console.error('Giphy Fetch Error:', err);
              setError(err.message || String(err));
              throw err;
            }
          }}
          key={searchKey}
          onGifClick={(gif, e) => {
            e.preventDefault();
            onSelect(gif, type);
          }}
          noResultsMessage="لا توجد نتائج"
          noLink
          hideAttribution
        />
      )}
    </div>
  );
};

export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [activeTab, setActiveTab] = useState<'gifs' | 'stickers'>('stickers');

  return (
    <div className="flex flex-col w-[300px] bg-card border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200" dir="rtl">
      <div className="p-3 border-b flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Ghost className="w-4 h-4" />
          <span className="text-sm">ملصقات وصور متحركة</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="p-0">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <div className="px-3 pt-3">
             <TabsList className="w-full grid grid-cols-2 h-9 rounded-xl">
              <TabsTrigger value="stickers" className="rounded-lg gap-2 text-xs">
                <Ghost className="w-3 h-3" />
                ملصقات
              </TabsTrigger>
              <TabsTrigger value="gifs" className="rounded-lg gap-2 text-xs">
                <ImageIcon className="w-3 h-3" />
                GIFs
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-3" key={activeTab}>
            <SearchContextManager apiKey={GIPHY_API_KEY} options={{ limit: 20, type: activeTab }}>
              <div className="space-y-2">
                <SearchBar 
                  placeholder={activeTab === 'stickers' ? "بحث عن ملصقات..." : "بحث في GIPHY..."}
                  className="giphy-search-bar"
                />
                <GridContainer onSelect={onSelect} type={activeTab === 'stickers' ? 'sticker' : 'image'} />
              </div>
            </SearchContextManager>
          </div>
        </Tabs>
      </div>
      
      <div className="p-2 text-center bg-muted/50 border-t">
        <img 
          src="https://images.ctfassets.net/8gu7gn969p96/4G2tV1id676Qyq86Q8k2kY/0879c558c4048ca090e3860bb4d2b27a/PoweredBy_200px-White_Horizontal_Logo.png" 
          alt="Powered by GIPHY"
          className="h-3 mx-auto opacity-50 contrast-0"
        />
      </div>

      <style>{`
        .giphy-search-bar {
          background-color: hsl(var(--muted));
          border-radius: 12px;
          border: none;
          color: hsl(var(--foreground));
        }
        .giphy-search-bar input {
          font-family: inherit;
          font-size: 14px !important;
          color: hsl(var(--foreground)) !important;
          background: transparent !important;
          padding-right: 36px !important;
        }
        /* Custom scrollbar forgiphy grid */
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
