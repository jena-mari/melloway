// Original code-drawn illustrations; no artwork from the reference brands.
export default function DateIllustration({ kind }) {
  return (
    <svg
      viewBox="0 0 300 220"
      className="date-illustration"
      aria-hidden="true"
      fill="none"
      stroke="#24231f"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "market" && (
        <>
          <path
            d="M28 67 Q49 20 103 22 L173 20 Q201 22 211 58 Z"
            fill="white"
          />
          <path d="M40 68 L45 169 Q120 183 205 165 L204 60 M43 122 Q130 136 205 117 M53 169 L51 181 M192 169 L192 178" />
          <path
            d="M229 112 L273 112 L268 171 Q251 177 235 171 Z"
            fill="#d3e4b4"
          />
          <path d="M233 128 Q250 132 272 126 M252 120 L256 82 L262 83 L260 120" />
          <path
            d="M69 88 Q80 75 91 90 M118 91 Q133 83 145 92 M164 89 L180 87"
            opacity=".35"
          />
          <path d="M226 47 L226 57 M221 52 L231 52 M13 150 L13 158 M9 154 L17 154" />
        </>
      )}
      {kind === "camera" && (
        <>
          <path
            d="M33 49 L95 31 L152 48 L133 82 L117 73 L123 171 Q86 181 54 166 L58 73 L44 85 Z"
            fill="white"
          />
          <path d="M72 38 Q91 61 111 36 M56 153 Q90 164 123 157" />
          <rect
            x="169"
            y="106"
            width="103"
            height="69"
            rx="12"
            fill="#f5e8aa"
          />
          <path d="M186 106 L194 93 L223 93 L230 106 M242 117 L255 117" />
          <circle cx="218" cy="140" r="22" fill="white" />
          <circle cx="218" cy="140" r="15" />
          <path d="M161 49 L161 65 M153 57 L169 57 M260 66 L260 74 M256 70 L264 70" />
        </>
      )}
      {kind === "books" && (
        <>
          <path
            d="M29 59 Q63 40 109 63 Q155 39 186 57 L186 158 Q148 143 109 167 Q72 144 29 161 Z"
            fill="white"
          />
          <path d="M109 63 L109 167 M43 80 Q67 71 93 81 M43 96 Q67 87 93 97 M43 112 Q67 103 93 113 M126 80 Q151 68 174 78 M126 96 Q151 84 174 94" />
          <path
            d="M210 109 L264 109 L259 168 Q235 178 216 165 Z"
            fill="#f8a8b9"
          />
          <path d="M264 118 Q289 118 280 141 Q275 151 262 148 M223 89 Q213 79 226 67 M242 88 Q231 77 244 64" />
          <path d="M211 39 L211 51 M205 45 L217 45" />
        </>
      )}
      {kind === "picnic" && (
        <>
          <path d="M22 136 L176 120 L215 184 L62 197 Z" fill="white" />
          <path
            d="M48 145 L193 134 M57 159 L201 152 M66 177 L209 172 M65 132 L101 192 M98 129 L133 190 M133 124 L165 186"
            opacity=".4"
          />
          <path
            d="M78 113 L143 113 L136 157 Q110 166 83 151 Z"
            fill="#f5e8aa"
          />
          <path d="M92 114 Q92 79 113 82 Q135 83 129 112 M84 127 L142 127" />
          <rect x="202" y="36" width="68" height="85" rx="4" fill="#f8a8b9" />
          <path d="M212 46 L260 46 L260 112 L212 112 Z M216 99 L235 76 L244 87 L257 69" />
          <circle cx="231" cy="61" r="5" />
          <path d="M51 52 L51 64 M45 58 L57 58" />
        </>
      )}
    </svg>
  );
}
