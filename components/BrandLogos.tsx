import React, { useState, useRef } from 'react';

const TOGGI_LOGO_STORAGE_KEY = 'toggi_custom_park_logo_v1';
const TBG_LOGO_STORAGE_KEY = 'toggi_custom_tbg_logo_v1';

/**
 * Exact recreation of attached "TOGGI LOGO2.png" as-is:
 * - Dark charcoal background (#1c1c21)
 * - White outer glow sticker contour around 3D black block extrusion
 * - Green jungle-striped "Toggi" with dinosaur skull 'o' and yellow slit-pupil reptile eyes inside 'gg'
 * - 3D orange-amber tiger-striped "FUN" & "WORLD"
 * - Also supports clicking to load the local PNG file directly into localStorage if desired
 */
export const ToggiFunWorldLogo: React.FC<{ className?: string }> = ({ className = 'h-14 w-auto' }) => {
  const [customSrc, setCustomSrc] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOGGI_LOGO_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCustomSrc(result);
      try {
        localStorage.setItem(TOGGI_LOGO_STORAGE_KEY, result);
      } catch {}
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      onClick={() => fileInputRef.current?.click()}
      title="Toggi Fun World Logo (Click to upload custom image file if needed)"
      className={`relative inline-flex items-center justify-center bg-[#1c1c20] rounded-lg overflow-hidden cursor-pointer select-none shrink-0 border border-white/15 shadow-md ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {customSrc ? (
        <img
          src={customSrc}
          alt="Toggi Fun World"
          className="h-full w-auto object-contain"
        />
      ) : (
        <svg
          viewBox="0 0 250 245"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-auto"
          role="img"
          aria-label="Toggi Fun World Logo"
        >
          <rect width="250" height="245" fill="#1c1c20" />
          <defs>
            <linearGradient id="tgGreen" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#c4ec4e" />
              <stop offset="50%" stopColor="#75b838" />
              <stop offset="100%" stopColor="#3c7a1e" />
            </linearGradient>
            <linearGradient id="tgOrange" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffca3a" />
              <stop offset="45%" stopColor="#f0821e" />
              <stop offset="100%" stopColor="#c94914" />
            </linearGradient>
            <filter id="tgWhiteGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feMorphology operator="dilate" radius="4.5" in="SourceAlpha" result="dilated" />
              <feFlood floodColor="#ffffff" floodOpacity="0.98" result="whiteFill" />
              <feComposite in="whiteFill" in2="dilated" operator="in" result="outline" />
              <feGaussianBlur in="outline" stdDeviation="3.2" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="outline" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#tgWhiteGlow)">
            {/* 3D Solid Black Extrusion Silhouette */}
            <path
              d="M46 28 L122 8 L130 48 L210 38 L218 96 L204 108 L210 152 L240 164 L228 222 L28 220 L14 166 L50 148 L56 96 L68 90 L66 52 L44 48 Z"
              fill="#050505"
              stroke="#050505"
              strokeWidth="8"
              strokeLinejoin="round"
            />
            {/* "T" in Toggi */}
            <path
              d="M45 30 C68 18 96 10 120 9 L123 30 L96 37 L93 90 L68 90 L70 43 L46 46 Z"
              fill="url(#tgGreen)"
              stroke="#1e4210"
              strokeWidth="2.2"
            />
            <path d="M56 26 L71 37 M88 15 L102 31 M71 58 L92 65 M70 74 L90 80" stroke="#3c7a1e" strokeWidth="3.5" strokeLinecap="round" />
            {/* "o" Dino Head Profile */}
            <path
              d="M96 49 C96 34 121 33 125 49 C128 62 123 80 111 82 C99 84 94 69 96 49 Z"
              fill="#a8e03c"
              stroke="#1e4210"
              strokeWidth="2.2"
            />
            {/* Dino Eye & Jaw Line */}
            <path d="M105 51 L115 58 L107 62 Z" fill="#090909" />
            <path d="M99 67 L115 76" stroke="#090909" strokeWidth="3.2" strokeLinecap="round" />
            {/* First "g" with Yellow Reptile Eye */}
            <path
              d="M154 46 C138 42 127 52 129 68 C131 80 143 84 152 80 C152 88 144 93 133 90 L129 101 C146 107 166 99 166 78 L164 45 Z"
              fill="url(#tgGreen)"
              stroke="#1e4210"
              strokeWidth="2.2"
            />
            <ellipse cx="147" cy="60" rx="6.2" ry="4.4" transform="rotate(-12 147 60)" fill="#ffde00" stroke="#090909" strokeWidth="1.8" />
            <ellipse cx="147" cy="60" rx="1.8" ry="3.8" fill="#090909" />
            {/* Second "g" with Yellow Reptile Eye */}
            <path
              d="M192 40 C177 36 166 46 168 62 C170 74 181 78 190 74 C190 82 182 87 171 84 L168 95 C184 101 203 92 203 72 L201 38 Z"
              fill="url(#tgGreen)"
              stroke="#1e4210"
              strokeWidth="2.2"
            />
            <ellipse cx="185" cy="54" rx="6.2" ry="4.4" transform="rotate(-15 185 54)" fill="#ffde00" stroke="#090909" strokeWidth="1.8" />
            <ellipse cx="185" cy="54" rx="1.8" ry="3.8" fill="#090909" />
            {/* "i" */}
            <ellipse cx="211" cy="48" rx="5.5" ry="6.5" fill="#a8e03c" stroke="#1e4210" strokeWidth="2" />
            <path d="M205 60 L215 58 L209 90 L200 90 Z" fill="url(#tgGreen)" stroke="#1e4210" strokeWidth="2" />
            {/* "FUN" */}
            <path d="M64 98 L103 104 L100 118 L80 115 L79 124 L96 127 L94 140 L77 137 L74 154 L57 152 Z" fill="url(#tgOrange)" stroke="#752406" strokeWidth="2.2" />
            <path d="M109 105 L127 105 L126 136 C126 143 138 143 138 136 L139 105 L157 105 L156 138 C155 155 109 156 109 137 Z" fill="url(#tgOrange)" stroke="#752406" strokeWidth="2.2" />
            <path d="M164 105 L181 103 L196 129 L198 100 L214 101 L208 155 L192 155 L178 128 L175 154 L160 153 Z" fill="url(#tgOrange)" stroke="#752406" strokeWidth="2.2" />
            <path d="M62 110 L83 105 M60 134 L77 128 M110 120 L126 114 M139 126 L155 119 M165 118 L182 112 M193 140 L210 132" stroke="#cc3b0c" strokeWidth="3.2" strokeLinecap="round" />
            {/* "WORLD" */}
            <path d="M18 162 L35 159 L44 188 L53 160 L66 160 L74 188 L83 159 L98 162 L82 216 L66 216 L58 187 L49 216 L35 216 Z" fill="url(#tgOrange)" stroke="#752406" strokeWidth="2.2" />
            <path d="M116 161 C132 161 141 173 141 189 C141 205 131 216 116 216 C100 216 91 205 91 189 C91 173 100 161 116 161 Z M116 177 C109 177 106 182 106 189 C106 196 109 201 116 201 C123 201 126 196 126 189 C126 182 123 177 116 177 Z" fill="url(#tgOrange)" stroke="#752406" strokeWidth="2.2" />
            <path d="M145 162 L171 162 C182 162 187 169 186 178 C185 185 180 190 175 192 L186 215 L169 215 L160 195 L158 195 L157 215 L142 215 Z M159 174 L159 183 L167 183 C170 183 172 181 172 178 C172 175 170 174 167 174 Z" fill="url(#tgOrange)" stroke="#752406" strokeWidth="2.2" />
            <path d="M189 162 L204 162 L201 199 L216 199 L214 215 L185 215 Z" fill="url(#tgOrange)" stroke="#752406" strokeWidth="2.2" />
            <path d="M218 163 L236 165 C247 167 252 177 250 191 C248 205 240 215 227 215 L212 215 Z M230 177 L227 201 L232 201 C237 201 239 197 240 190 C241 182 238 178 233 177 Z" fill="url(#tgOrange)" stroke="#752406" strokeWidth="2.2" />
            <path d="M24 179 L39 173 M69 199 L86 192 M95 182 L110 174 M123 202 L138 194 M147 178 L164 171 M190 186 L203 179 M220 192 L236 184" stroke="#cc3b0c" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>
      )}
    </div>
  );
};

/**
 * Exact recreation of attached "TBG.JPG" as-is:
 * - Pure white rectangular background (#ffffff)
 * - Exact black serif "T" on left + interlocking grey serif "BG" on right
 * - Exact "TANVIR BASHUNDHARA GROUP" serif subtitle centered directly underneath
 * - No extra side text added inside the logo box
 */
export const TanvirBashundharaLogo: React.FC<{
  className?: string;
}> = ({ className = 'h-14 w-auto' }) => {
  const [customSrc, setCustomSrc] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TBG_LOGO_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCustomSrc(result);
      try {
        localStorage.setItem(TBG_LOGO_STORAGE_KEY, result);
      } catch {}
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      onClick={() => fileInputRef.current?.click()}
      title="TBG - Tanvir Bashundhara Group Logo (Click to upload custom image file if needed)"
      className={`relative inline-flex items-center justify-center bg-white rounded-lg overflow-hidden cursor-pointer select-none shrink-0 border border-slate-200 shadow-md px-2.5 py-1 ${className}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {customSrc ? (
        <img
          src={customSrc}
          alt="Tanvir Bashundhara Group"
          className="h-full w-auto object-contain"
        />
      ) : (
        <svg
          viewBox="0 0 420 240"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-auto"
          role="img"
          aria-label="TBG - Tanvir Bashundhara Group"
        >
          <rect width="420" height="240" fill="#ffffff" />
          {/* ==================== BLACK SERIF "T" ==================== */}
          {/* Top-left curved bracket serif & top bar of T */}
          <path
            d="M46 38 L152 38 L152 172 L112 172 L112 56 L94 56 C68 56 56 68 51 90 L46 90 Z"
            fill="#161616"
          />
          {/* Bottom-left serif foot of T */}
          <path
            d="M86 166 C104 166 112 158 112 144 L112 172 L152 172 L152 176 L86 176 Z"
            fill="#161616"
          />
          {/* Solid vertical stem of T */}
          <rect x="110" y="38" width="42" height="138" fill="#161616" />
          {/* ==================== GREY INTERLOCKING "BG" ==================== */}
          {/* Top loop start of B */}
          <path
            d="M164 38 L196 38 C216 38 231 43 238 51 C228 59 220 71 214 84 C209 61 194 49 164 49 Z"
            fill="#8d8f92"
          />
          {/* Sweeping S-curve of G top arch into B middle & lower loop */}
          <path
            d="M342 36 L349 36 L349 90 L341 90 C334 62 314 46 282 46 C252 46 234 64 221 92 C210 115 194 120 164 120 L164 108 C189 108 200 98 211 73 C226 42 251 32 286 32 C311 32 329 38 338 45 Z"
            fill="#8d8f92"
          />
          {/* Lower bowl of B */}
          <path
            d="M164 110 L204 110 C240 110 262 124 262 145 C262 165 238 176 198 176 L164 176 L164 166 L190 166 C217 166 231 156 231 142 C231 126 214 118 164 118 Z"
            fill="#8d8f92"
          />
          {/* Lower right crossbar & bowl of G */}
          <path
            d="M298 122 L374 122 L374 129 L358 129 L358 164 C336 174 309 179 282 179 C260 179 242 173 229 163 L237 154 C250 164 266 168 286 168 C306 168 321 163 329 156 L329 129 L298 129 Z"
            fill="#8d8f92"
          />
          {/* ==================== SUBTITLE: TANVIR BASHUNDHARA GROUP ==================== */}
          <text
            x="210"
            y="214"
            textAnchor="middle"
            fill="#4d4d4f"
            fontFamily="Georgia, 'Times New Roman', Times, serif"
            fontSize="20.5"
            fontWeight="400"
            letterSpacing="2.8"
          >
            TANVIR BASHUNDHARA GROUP
          </text>
        </svg>
      )}
    </div>
  );
};
