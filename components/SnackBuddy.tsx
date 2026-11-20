/**
 * 간식 요정 "쿠키" 캐릭터.
 *
 * 카드 톤(크림 · 캐러멜)에 맞춘 동글동글한 쿠키 요정으로,
 * 간식 도착 여부에 따라 표정과 포즈가 바뀝니다.
 *  - waiting: 두 눈을 반짝이며 두 손을 모으고 얌전히 기다리는 표정
 *  - arrived: 양손을 들고 환하게 웃는 표정 + 반짝이
 *
 * 장식용이라 스크린리더에는 노출하지 않고(aria-hidden), 상태는 글자로 전달합니다.
 * 움직임은 CSS 애니메이션(.buddy / .buddy__twinkle)으로만 주며,
 * 전역 `prefers-reduced-motion` 규칙이 그대로 적용됩니다.
 */

interface SnackBuddyProps {
  arrived: boolean;
}

/** 중심이 (0,0)인 네 갈래 반짝이 별. scale 로 크기를 정합니다. */
const STAR_PATH =
  "M0 -1 L0.22 -0.22 L1 0 L0.22 0.22 L0 1 L-0.22 0.22 L-1 0 L-0.22 -0.22 Z";

function Star({ x, y, size, delay = 0 }: { x: number; y: number; size: number; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="buddy__twinkle" style={delay ? { animationDelay: `${delay}ms` } : undefined}>
        <path d={STAR_PATH} transform={`scale(${size})`} fill="#f0b25e" />
      </g>
    </g>
  );
}

function Chip({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#7c4a24" />
      <circle cx={x - r * 0.28} cy={y - r * 0.32} r={r * 0.34} fill="#b07c4e" opacity="0.6" />
    </g>
  );
}

export default function SnackBuddy({ arrived }: SnackBuddyProps) {
  return (
    <div className={arrived ? "buddy buddy--arrived" : "buddy buddy--waiting"} aria-hidden="true">
      <svg className="buddy__svg" viewBox="0 0 140 140" role="presentation" focusable="false">
        <defs>
          <radialGradient id="buddyBody" cx="36%" cy="24%" r="86%">
            <stop offset="0%" stopColor="#fce6bd" />
            <stop offset="52%" stopColor="#f0c78d" />
            <stop offset="100%" stopColor="#dda76a" />
          </radialGradient>
          <clipPath id="buddyMouth">
            <path d="M62 79 h16 q-8 12 -16 0 Z" />
          </clipPath>
        </defs>

        {/* 머리 위 새싹 */}
        <g strokeLinecap="round">
          <path d="M70 39 q0 -6 0 -10" stroke="#8caf74" strokeWidth="2.8" />
          <ellipse cx="63" cy="29" rx="7" ry="3.6" fill="#9cc283" transform="rotate(-24 63 29)" />
          <ellipse cx="77" cy="28.5" rx="6.6" ry="3.4" fill="#b1d49a" transform="rotate(28 77 28.5)" />
        </g>

        {/* 발 (몸통 뒤) */}
        <ellipse cx="54" cy="104" rx="8.4" ry="5.6" fill="#cf9252" />
        <ellipse cx="86" cy="104" rx="8.4" ry="5.6" fill="#cf9252" />

        {/* 쿠키 몸통 */}
        <circle cx="70" cy="72" r="35" fill="url(#buddyBody)" stroke="#d59a5b" strokeWidth="1.6" />
        <ellipse cx="56" cy="52" rx="15" ry="9" fill="#ffffff" opacity="0.2" />

        {/* 초콜릿 칩 */}
        <Chip x={47} y={54} r={4.6} />
        <Chip x={89} y={50} r={3.8} />
        <Chip x={95} y={75} r={4.2} />
        <Chip x={47} y={92} r={3.4} />
        <Chip x={86} y={95} r={4.6} />
        <Chip x={70} y={44} r={3.4} />

        {/* 볼터치 */}
        <ellipse cx="47" cy="79" rx="5.4" ry="3" fill="#f39489" opacity={arrived ? 0.62 : 0.45} />
        <ellipse cx="93" cy="79" rx="5.4" ry="3" fill="#f39489" opacity={arrived ? 0.62 : 0.45} />

        {arrived ? (
          <>
            {/* 눈웃음 */}
            <g fill="none" stroke="#4a3620" strokeWidth="3" strokeLinecap="round">
              <path d="M52.5 70 q4.5 -6 9 0" />
              <path d="M78.5 70 q4.5 -6 9 0" />
            </g>

            {/* 활짝 웃는 입 */}
            <path d="M62 79 h16 q-8 12 -16 0 Z" fill="#6b4326" />
            <ellipse cx="70" cy="86.6" rx="6" ry="3.6" fill="#ef8d90" clipPath="url(#buddyMouth)" />

            {/* 양손 번쩍 */}
            <g fill="none" strokeLinecap="round">
              <path d="M45 72 Q40 60 35 48" stroke="#d59a5b" strokeWidth="15" />
              <path d="M45 72 Q40 60 35 48" stroke="#f9dcae" strokeWidth="12" />
              <path d="M95 72 Q100 60 105 48" stroke="#d59a5b" strokeWidth="15" />
              <path d="M95 72 Q100 60 105 48" stroke="#f9dcae" strokeWidth="12" />
            </g>

            {/* 반짝이 */}
            <Star x={21} y={50} size={5.6} />
            <Star x={119} y={55} size={4.2} delay={620} />
            <Star x={26} y={92} size={3.4} delay={1100} />
            <Star x={115} y={92} size={5.2} delay={380} />
            <Star x={70} y={13} size={3.2} delay={880} />
          </>
        ) : (
          <>
            {/* 반짝이는 눈 */}
            <ellipse cx="56.5" cy="69" rx="3.6" ry="4.4" fill="#4a3620" />
            <ellipse cx="83.5" cy="69" rx="3.6" ry="4.4" fill="#4a3620" />
            <circle cx="55.2" cy="67.2" r="1.5" fill="#ffffff" />
            <circle cx="82.2" cy="67.2" r="1.5" fill="#ffffff" />
            <circle cx="57.8" cy="70.6" r="0.75" fill="#ffffff" opacity="0.85" />
            <circle cx="84.8" cy="70.6" r="0.75" fill="#ffffff" opacity="0.85" />
            <Star x={44} y={62} size={3.6} />
            <Star x={96} y={62} size={3.2} delay={700} />

            {/* 얌전한 미소 */}
            <path
              d="M65 80 q5 4.6 10 0"
              fill="none"
              stroke="#4a3620"
              strokeWidth="2.6"
              strokeLinecap="round"
            />

            {/* 양팔을 가지런히 내리고 서서 기다리기 */}
            <g fill="none" strokeLinecap="round">
              <path d="M40 68 Q36 76 37 84" stroke="#d59a5b" strokeWidth="15" />
              <path d="M40 68 Q36 76 37 84" stroke="#f9dcae" strokeWidth="12" />
              <path d="M100 68 Q104 76 103 84" stroke="#d59a5b" strokeWidth="15" />
              <path d="M100 68 Q104 76 103 84" stroke="#f9dcae" strokeWidth="12" />
            </g>
          </>
        )}
      </svg>
    </div>
  );
}
