/**
 * 간식 요정 "쿠키" 캐릭터.
 *
 * 카드 톤(크림 · 캐러멜)에 맞춘 동글동글한 쿠키 요정으로,
 * 간식 상태에 따라 표정과 포즈가 바뀝니다.
 *  - waiting  : 두 눈을 반짝이며 팔을 가지런히 내리고 얌전히 기다리는 표정
 *  - arrived  : 양손을 들고 환하게 웃는 표정 + 반짝이
 *  - sold_out : 눈썹이 처진 아쉬운 표정 + 빈 접시와 부스러기
 *
 * 장식용이라 스크린리더에는 노출하지 않고(aria-hidden), 상태는 글자로 전달합니다.
 * 움직임은 CSS 애니메이션(.buddy / .buddy__twinkle)으로만 주며,
 * 전역 `prefers-reduced-motion` 규칙이 그대로 적용됩니다.
 */

import type { SnackStatus } from "@/lib/types";

interface SnackBuddyProps {
  status: SnackStatus;
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

/** 다 먹고 남은 접시 (빈 접시 + 부스러기) */
function EmptyPlate() {
  return (
    <g>
      {/* 접시 그림자 */}
      <ellipse cx="70" cy="126.5" rx="37" ry="7.5" fill="#a9825a" opacity="0.12" />
      <ellipse cx="70" cy="122" rx="38" ry="9.5" fill="#fffdf8" stroke="#d8bb97" strokeWidth="2" />
      <ellipse cx="70" cy="120" rx="26" ry="5.4" fill="#fdf4e6" stroke="#e8d6bd" strokeWidth="1.2" />
      {/* 접시 위 부스러기 */}
      <circle cx="60" cy="119.2" r="2.1" fill="#a8683a" />
      <circle cx="65.5" cy="121.4" r="1.5" fill="#96582c" />
      <circle cx="79" cy="118.6" r="1.8" fill="#a8683a" />
      <circle cx="85" cy="121" r="1.3" fill="#96582c" />
      <circle cx="71" cy="122.2" r="1.1" fill="#a8683a" opacity="0.9" />
      {/* 떨어진 부스러기 */}
      <circle cx="104" cy="112" r="1.2" fill="#c58e56" opacity="0.85" />
      <circle cx="110" cy="118" r="0.9" fill="#c58e56" opacity="0.7" />
      <circle cx="32" cy="116" r="1" fill="#c58e56" opacity="0.7" />
    </g>
  );
}

const BUDDY_CLASS: Record<SnackStatus, string> = {
  waiting: "buddy--waiting",
  arrived: "buddy--arrived",
  sold_out: "buddy--sold",
};

export default function SnackBuddy({ status }: SnackBuddyProps) {
  const arrived = status === "arrived";
  const soldOut = status === "sold_out";

  return (
    <div className={`buddy ${BUDDY_CLASS[status]}`} aria-hidden="true">
      <svg className="buddy__svg" viewBox="0 0 140 140" role="presentation" focusable="false">
        <defs>
          <radialGradient id="buddyBody" cx="36%" cy="24%" r="86%">
            <stop offset="0%" stopColor={soldOut ? "#f7e3c4" : "#fce6bd"} />
            <stop offset="52%" stopColor={soldOut ? "#eccca6" : "#f0c78d"} />
            <stop offset="100%" stopColor={soldOut ? "#d6ab7f" : "#dda76a"} />
          </radialGradient>
          <clipPath id="buddyMouth">
            <path d="M62 79 h16 q-8 12 -16 0 Z" />
          </clipPath>
        </defs>

        {soldOut ? <EmptyPlate /> : null}

        {/* 머리 위 새싹 (품절일 땐 살짝 처집니다) */}
        <g strokeLinecap="round">
          {soldOut ? (
            <>
              <path d="M70 39 q2 -6 1 -11" stroke="#a8b98f" strokeWidth="2.8" />
              <ellipse cx="64" cy="33" rx="7" ry="3.4" fill="#b3c99b" transform="rotate(24 64 33)" />
              <ellipse cx="77" cy="34" rx="6.6" ry="3.2" fill="#c4d7ae" transform="rotate(-22 77 34)" />
            </>
          ) : (
            <>
              <path d="M70 39 q0 -6 0 -10" stroke="#8caf74" strokeWidth="2.8" />
              <ellipse cx="63" cy="29" rx="7" ry="3.6" fill="#9cc283" transform="rotate(-24 63 29)" />
              <ellipse cx="77" cy="28.5" rx="6.6" ry="3.4" fill="#b1d49a" transform="rotate(28 77 28.5)" />
            </>
          )}
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
        <ellipse
          cx="47"
          cy="79"
          rx="5.4"
          ry="3"
          fill="#f39489"
          opacity={arrived ? 0.62 : soldOut ? 0.3 : 0.45}
        />
        <ellipse
          cx="93"
          cy="79"
          rx="5.4"
          ry="3"
          fill="#f39489"
          opacity={arrived ? 0.62 : soldOut ? 0.3 : 0.45}
        />

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
        ) : soldOut ? (
          <>
            {/* 처진 눈썹 */}
            <g fill="none" stroke="#4a3620" strokeWidth="2.2" strokeLinecap="round" opacity="0.8">
              <path d="M49.5 63.5 q6 -3.4 12 -1.2" />
              <path d="M90.5 63.5 q-6 -3.4 -12 -1.2" />
            </g>

            {/* 시무룩한 눈 */}
            <ellipse cx="56.5" cy="71" rx="3.4" ry="3.9" fill="#4a3620" />
            <ellipse cx="83.5" cy="71" rx="3.4" ry="3.9" fill="#4a3620" />
            <circle cx="55.3" cy="69.4" r="1.3" fill="#ffffff" />
            <circle cx="82.3" cy="69.4" r="1.3" fill="#ffffff" />

            {/* 눈물 한 방울 */}
            <path d="M90.5 76 q2.2 4.2 0.4 5.8 q-2.2 -1.4 -0.4 -5.8 Z" fill="#8cc8e6" opacity="0.95" />

            {/* 아쉬운 입 */}
            <path
              d="M64.5 84.5 q5.5 -4.4 11 0"
              fill="none"
              stroke="#4a3620"
              strokeWidth="2.6"
              strokeLinecap="round"
            />

            {/* 축 처진 팔 (몸 앞으로 힘없이) */}
            <g fill="none" strokeLinecap="round">
              <path d="M47 82 Q39 93 45 102" stroke="#d59a5b" strokeWidth="15" />
              <path d="M47 82 Q39 93 45 102" stroke="#f6dcb8" strokeWidth="12" />
              <path d="M93 82 Q101 93 95 102" stroke="#d59a5b" strokeWidth="15" />
              <path d="M93 82 Q101 93 95 102" stroke="#f6dcb8" strokeWidth="12" />
            </g>

            {/* 흩어진 부스러기 */}
            <circle cx="24" cy="100" r="1.4" fill="#d9a66e" opacity="0.75" />
            <circle cx="116" cy="101" r="1.1" fill="#d9a66e" opacity="0.65" />
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
