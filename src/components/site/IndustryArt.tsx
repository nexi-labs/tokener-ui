"use client";

import clsx from "clsx";
import { Pause, Play } from "lucide-react";
import { useId, useRef, useState } from "react";

/**
 * Hand-drawn, animated line art for each industry. Every drawing is built from the same few strokes so the set reads as one family,
 * and each one shows something that belongs to the sector: a bank, a hospital trace, a conveyor, a route, a turbine, a tower.
 * Motion uses SMIL so it can be paused with the control, which is always visible.
 */

const INK = "rgba(255,255,255,0.62)";
const DIM = "rgba(255,255,255,0.22)";
const ACC = "#02F5A1";
const AMB = "#F5B642";

const line = { fill: "none", stroke: INK, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const dim = { ...line, stroke: DIM } as const;

function Packet({ path, dur = 4, begin = 0, color = ACC, r = 4 }: { path: string; dur?: number; begin?: number; color?: string; r?: number }) {
  return (
    <g>
      <circle r={r * 2.4} fill={color} opacity="0.16"><animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" path={path} /></circle>
      <circle r={r} fill={color}><animateMotion dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" path={path} /></circle>
    </g>
  );
}

function Pulse({ cx, cy, r = 26, dur = 3, begin = 0, color = ACC }: { cx: number; cy: number; r?: number; dur?: number; begin?: number; color?: string }) {
  return (
    <circle cx={cx} cy={cy} r="4" fill="none" stroke={color} strokeWidth="1.4">
      <animate attributeName="r" values={`4;${r}`} dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.9;0" dur={`${dur}s`} begin={`${begin}s`} repeatCount="indefinite" />
    </circle>
  );
}


/** A wind turbine whose blades turn about the hub. The tower ends exactly at the hub, and the blades rotate about the group origin that is translated to it. */
function Turbine({ x, y, s = 1, dur = 7 }: { x: number; y: number; s?: number; dur?: number }) {
  const L = 58 * s;
  const a = (deg: number) => [Math.cos(((deg - 90) * Math.PI) / 180) * L, Math.sin(((deg - 90) * Math.PI) / 180) * L];
  const b = [0, 120, 240].map(a);
  return (
    <g>
      <path d={`M${x - 7 * s} 226 L${x - 1.6 * s} ${y + 3} M${x + 7 * s} 226 L${x + 1.6 * s} ${y + 3}`} {...line} />
      <g transform={`translate(${x} ${y})`}>
        <g {...line}>
          {b.map(([bx, by], i) => <path key={i} d={`M0 0 L${bx.toFixed(1)} ${by.toFixed(1)}`} />)}
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur={`${dur}s`} repeatCount="indefinite" />
        </g>
        <circle r={4.5 * s + 1} fill={ACC} />
      </g>
    </g>
  );
}

const ground = (y = 220) => <path d={`M30 ${y} H610`} {...dim} />;

const ARTS: Record<string, { title: string; draw: () => React.ReactNode }> = {
  banking: {
    title: "A bank, a shield and a ledger",
    draw: () => (
      <>
        {ground()}
        <g {...line}>
          <path d="M70 118 L150 78 L230 118 Z" />
          <path d="M76 124 H224" />
          {[96, 124, 152, 180, 208].map((x) => <path key={x} d={`M${x} 130 V196`} />)}
          <path d="M68 202 H232 M58 212 H242" />
        </g>
        <circle cx="150" cy="104" r="6" fill="none" stroke={ACC} strokeWidth="1.6" />
        <path d="M252 168 H360" {...dim} /><path d="M252 168 H360" fill="none" stroke={ACC} strokeWidth="1.5" className="tok-flow tok-keep" />
        <Packet path="M252 168 H360" dur={3} />
        <g {...line}>
          <path d="M360 118 C380 118 396 112 410 104 C424 112 440 118 460 118 V164 C460 190 436 206 410 216 C384 206 360 190 360 164 Z" />
        </g>
        <path d="M388 160 L404 176 L434 142" fill="none" stroke={ACC} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="80" strokeDashoffset="80">
          <animate attributeName="stroke-dashoffset" values="80;0;0;80" keyTimes="0;0.35;0.85;1" dur="4s" repeatCount="indefinite" />
        </path>
        <path d="M468 168 H520" {...dim} /><path d="M468 168 H520" fill="none" stroke={ACC} strokeWidth="1.5" className="tok-flow tok-keep" />
        <g {...line}>
          <rect x="520" y="104" width="86" height="112" rx="6" />
          {[128, 148, 168, 188].map((y) => <path key={y} d={`M534 ${y} H592`} />)}
        </g>
        <rect x="534" y="124" width="30" height="8" rx="2" fill={ACC} opacity="0.8"><animate attributeName="width" values="12;52;12" dur="5s" repeatCount="indefinite" /></rect>
        <Pulse cx={150} cy={104} r={30} />
      </>
    ),
  },
  insurance: {
    title: "A claim read once and reviewed",
    draw: () => (
      <>
        {ground()}
        <g {...line}>
          <path d="M80 70 H170 L196 96 V204 H80 Z" />
          <path d="M170 70 V96 H196" />
          {[116, 136, 156, 176].map((y) => <path key={y} d={`M98 ${y} H178`} />)}
        </g>
        <rect x="80" y="70" width="116" height="3" fill={ACC}>
          <animate attributeName="y" values="74;200;74" dur="4.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.9;0.9;0.2;0.9" dur="4.4s" repeatCount="indefinite" />
        </rect>
        <path d="M200 140 H300" {...dim} /><path d="M200 140 H300" fill="none" stroke={ACC} strokeWidth="1.5" className="tok-flow tok-keep" />
        <Packet path="M200 140 H300" dur={3} />
        <g {...line}>
          <rect x="300" y="96" width="120" height="88" rx="8" />
          <path d="M318 122 H402 M318 142 H380 M318 162 H392" />
        </g>
        <rect x="318" y="118" width="40" height="8" rx="2" fill={AMB} opacity="0.85"><animate attributeName="opacity" values="0.15;0.9;0.9;0.15" dur="4.4s" repeatCount="indefinite" /></rect>
        <path d="M426 140 H476" {...dim} /><path d="M426 140 H476" fill="none" stroke={ACC} strokeWidth="1.5" className="tok-flow tok-keep" />
        <g {...line}><path d="M476 96 C492 96 504 92 516 86 C528 92 540 96 556 96 V132 C556 154 538 166 516 176 C494 166 476 154 476 132 Z" /></g>
        <path d="M498 130 L512 144 L536 116" fill="none" stroke={ACC} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="70" strokeDashoffset="70">
          <animate attributeName="stroke-dashoffset" values="70;70;0;0;70" keyTimes="0;0.4;0.6;0.9;1" dur="4.4s" repeatCount="indefinite" />
        </path>
        <circle cx="580" cy="176" r="14" {...line} /><path d="M574 176 L579 181 L587 171" fill="none" stroke={ACC} strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  healthcare: {
    title: "Patient data stays inside the line",
    draw: () => (
      <>
        <rect x="64" y="46" width="512" height="176" rx="14" fill="none" stroke={ACC} strokeWidth="1.3" strokeDasharray="6 6" opacity="0.55" className="tok-flow tok-keep" />
        <g {...line}>
          <rect x="92" y="84" width="76" height="76" rx="12" />
          <path d="M130 100 V144 M108 122 H152" stroke={ACC} strokeWidth="3" />
        </g>
        <path d="M180 122 H210" {...dim} />
        <g fill="none" stroke={ACC} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M210 122 H260 L276 92 L296 160 L312 122 H340 L352 108 L366 138 L376 122 H470" strokeDasharray="520" strokeDashoffset="520">
            <animate attributeName="stroke-dashoffset" values="520;0;0;-520" keyTimes="0;0.5;0.8;1" dur="4.2s" repeatCount="indefinite" />
          </path>
        </g>
        <g {...line}>
          <rect x="486" y="92" width="64" height="60" rx="8" />
          <path d="M502 92 V80 a16 16 0 0 1 32 0 V92" />
        </g>
        <circle cx="518" cy="122" r="6" fill={ACC}><animate attributeName="opacity" values="1;0.35;1" dur="2.4s" repeatCount="indefinite" /></circle>
        <g {...line}><path d="M92 190 H230" /><path d="M250 190 H340" /></g>
        <rect x="92" y="186" width="30" height="8" rx="2" fill={AMB}><animate attributeName="x" values="92;212;92" dur="5.2s" repeatCount="indefinite" /></rect>
        <text x="352" y="194" fill={INK} fontSize="11" fontFamily="ui-monospace, monospace">masked before it leaves</text>
      </>
    ),
  },
  retail: {
    title: "A storefront, a basket and a peak",
    draw: () => (
      <>
        {ground()}
        <g {...line}>
          <path d="M70 100 H250 L240 70 H80 Z" />
          <path d="M70 100 c0 12 22 12 22 0 c0 12 22 12 22 0 c0 12 22 12 22 0 c0 12 22 12 22 0 c0 12 22 12 22 0 c0 12 22 12 22 0 c0 12 22 12 22 0 c0 12 22 12 22 0" />
          <path d="M84 116 V220 M236 116 V220" />
          <rect x="108" y="140" width="60" height="80" rx="3" />
          <rect x="180" y="140" width="40" height="40" rx="3" />
        </g>
        <path d="M262 168 H360" {...dim} /><path d="M262 168 H360" fill="none" stroke={ACC} strokeWidth="1.5" className="tok-flow tok-keep" />
        <g {...line}>
          <path d="M380 96 H400 L420 164 H520 L538 116 H408" />
          <circle cx="436" cy="184" r="9" /><circle cx="504" cy="184" r="9" />
        </g>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={430 + i * 30} y="60" width="20" height="20" rx="3" fill={i === 1 ? AMB : ACC} opacity="0">
            <animate attributeName="y" values="50;118;118" keyTimes="0;0.5;1" dur="4.5s" begin={`${i * 1.2}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="4.5s" begin={`${i * 1.2}s`} repeatCount="indefinite" />
          </rect>
        ))}
        <g transform="translate(560 120)">
          <path d="M0 0 L16 -22 L32 0" {...line} /><path d="M0 24 L16 2 L32 24" {...line} stroke={AMB} />
          <animateTransform attributeName="transform" type="translate" values="560 120;560 112;560 120" dur="2.4s" repeatCount="indefinite" />
        </g>
      </>
    ),
  },
  manufacturing: {
    title: "A line with a model beside it",
    draw: () => (
      <>
        <path d="M40 188 H600" {...line} /><path d="M40 200 H600" {...dim} />
        {[70, 150, 230, 310, 390, 470, 550].map((x) => <circle key={x} cx={x} cy="194" r="5" {...dim} />)}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x="0" y="152" width="38" height="36" rx="3" fill="none" stroke={INK} strokeWidth="1.6">
              <animate attributeName="x" values="20;600" dur="9s" begin={`${-i * 3}s`} repeatCount="indefinite" />
            </rect>
          </g>
        ))}
        <g {...line}>
          <path d="M470 188 V150 L498 120 L546 112" />
          <circle cx="470" cy="150" r="7" /><circle cx="498" cy="120" r="6" />
          <path d="M546 112 l12 10 M546 112 l12 -10" />
        </g>
        <g fill="none" stroke={ACC} strokeWidth="1.8">
          <path d="M240 60 h-18 v18 M300 60 h18 v18 M240 150 h-18 v-18 M300 150 h18 v-18" />
        </g>
        <rect x="224" y="62" width="92" height="3" fill={ACC} opacity="0.8"><animate attributeName="y" values="62;144;62" dur="3s" repeatCount="indefinite" /></rect>
        <g {...line}><circle cx="270" cy="105" r="22" /><path d="M262 105 L269 112 L281 97" stroke={ACC} strokeWidth="2.2" /></g>
        <g {...line}><rect x="64" y="64" width="84" height="54" rx="6" /><path d="M64 78 H148" /></g>
        <circle cx="76" cy="71" r="2.5" fill={ACC}><animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite" /></circle>
        <path d="M80 104 L96 96 L110 100 L124 88 L138 92" fill="none" stroke={ACC} strokeWidth="1.6" />
      </>
    ),
  },
  logistics: {
    title: "A route, a truck and a decision at each stop",
    draw: () => (
      <>
        <path id="lg-route" d="M80 190 C180 190 190 100 290 110 C390 120 380 190 480 170 C540 158 560 110 580 80" fill="none" stroke={DIM} strokeWidth="2" strokeDasharray="4 8" />
        {[[80, 190], [290, 110], [480, 170], [580, 80]].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="9" fill="#07191E" stroke={INK} strokeWidth="1.6" />
            <circle cx={x} cy={y} r="3.5" fill={i === 3 ? ACC : INK} />
            <Pulse cx={x} cy={y} r={22} dur={3.6} begin={i * 0.9} />
          </g>
        ))}
        <g>
          <g {...line} transform="translate(-18 -14)">
            <rect x="0" y="2" width="22" height="18" rx="2" />
            <path d="M22 8 H30 L36 14 V20 H22" />
            <circle cx="9" cy="23" r="4" fill="#07191E" /><circle cx="29" cy="23" r="4" fill="#07191E" />
          </g>
          <animateMotion dur="9s" repeatCount="indefinite" rotate="0" path="M80 190 C180 190 190 100 290 110 C390 120 380 190 480 170 C540 158 560 110 580 80" />
        </g>
        <g {...line}>
          <rect x="40" y="52" width="26" height="22" rx="2" /><path d="M40 63 H66" />
          <rect x="70" y="52" width="26" height="22" rx="2" /><path d="M70 63 H96" />
          <rect x="55" y="28" width="26" height="22" rx="2" /><path d="M55 39 H81" />
        </g>
        <g transform="translate(330 44)" {...line}>
          <path d="M0 18 L28 12 L52 2 L44 20 L20 24 Z" />
          <animateTransform attributeName="transform" type="translate" values="330 56;410 40;330 56" dur="7s" repeatCount="indefinite" />
        </g>
        <text x="470" y="206" fill={INK} fontSize="11" fontFamily="ui-monospace, monospace">ETA 14:20</text>
      </>
    ),
  },
  energy: {
    title: "Wind, grid and load on one picture",
    draw: () => (
      <>
        {ground(226)}
        <Turbine x={96} y={92} s={1} dur={7} />
        <Turbine x={186} y={124} s={0.72} dur={5.2} />
        <g {...line}><path d="M300 226 L312 150 L324 226 M294 170 H330 M300 190 H324" /></g>
        <path d="M200 124 C240 140 270 150 312 150" fill="none" stroke={DIM} strokeWidth="1.4" />
        <path d="M112 100 C170 112 250 140 312 150" fill="none" stroke={DIM} strokeWidth="1.4" />
        <Packet path="M112 100 C170 112 250 140 312 150" dur={3.4} />
        <path d="M312 150 C370 170 420 170 468 150" fill="none" stroke={DIM} strokeWidth="1.4" />
        <Packet path="M312 150 C370 170 420 170 468 150" dur={3.4} begin={1.1} />
        <g {...line}><path d="M456 226 L468 150 L480 226 M450 170 H486 M456 190 H480" /></g>
        <g {...line}><circle cx="574" cy="62" r="14" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => <path key={a} d={`M${574 + 21 * Math.cos((a * Math.PI) / 180)} ${62 + 21 * Math.cos(((a - 90) * Math.PI) / 180)} L${574 + 28 * Math.cos((a * Math.PI) / 180)} ${62 + 28 * Math.cos(((a - 90) * Math.PI) / 180)}`} />)}</g>
        <Pulse cx={574} cy={62} r={34} dur={4} color={AMB} />
        <g {...line}><rect x="512" y="136" width="96" height="62" rx="6" /></g>
        <path d="M522 186 L538 170 L552 178 L568 154 L582 162 L598 144" fill="none" stroke={ACC} strokeWidth="1.8" strokeDasharray="160" strokeDashoffset="160">
          <animate attributeName="stroke-dashoffset" values="160;0;0;160" keyTimes="0;0.55;0.9;1" dur="5s" repeatCount="indefinite" />
        </path>
        <path d="M480 168 L510 168" {...dim} /><path d="M480 168 L510 168" fill="none" stroke={ACC} strokeWidth="1.5" className="tok-flow tok-keep" />
      </>
    ),
  },
  telecom: {
    title: "A mast, a network and a call that gets answered",
    draw: () => (
      <>
        {ground()}
        <g {...line}>
          <path d="M150 220 L170 90 L190 220 M156 180 H184 M160 150 H180 M164 120 H176" />
          <circle cx="170" cy="80" r="6" stroke={ACC} />
        </g>
        <Pulse cx={170} cy={80} r={60} dur={3.2} />
        <Pulse cx={170} cy={80} r={60} dur={3.2} begin={1.1} />
        <Pulse cx={170} cy={80} r={60} dur={3.2} begin={2.2} />
        <g {...line}><rect x="64" y="150" width="40" height="66" rx="6" /><path d="M78 206 H90" /></g>
        <path d="M110 170 C130 150 140 120 160 96" fill="none" stroke={DIM} strokeWidth="1.4" strokeDasharray="4 6" />
        <path d="M200 100 C260 100 300 150 340 150" fill="none" stroke={DIM} strokeWidth="1.5" />
        <Packet path="M200 100 C260 100 300 150 340 150" dur={3.4} />
        <g {...line}><rect x="340" y="120" width="96" height="60" rx="8" /><path d="M352 142 H424 M352 158 H402" /></g>
        <path d="M436 150 H500" {...dim} /><path d="M436 150 H500" fill="none" stroke={ACC} strokeWidth="1.5" className="tok-flow tok-keep" />
        <g {...line}><circle cx="530" cy="150" r="28" /><path d="M518 150 a12 12 0 0 1 24 0 M522 158 a8 8 0 0 1 16 0" stroke={ACC} /></g>
        <text x="496" y="204" fill={INK} fontSize="11" fontFamily="ui-monospace, monospace">answered in 3 s</text>
      </>
    ),
  },
  "public-sector": {
    title: "A public service that answers for itself",
    draw: () => (
      <>
        {ground()}
        <g {...line}>
          <path d="M90 108 L170 70 L250 108 Z" /><path d="M96 114 H244" />
          {[110, 134, 158, 182, 206, 230].map((x) => <path key={x} d={`M${x} 120 V196`} />)}
          <path d="M84 202 H256 M74 212 H266" />
          <path d="M170 70 V40" /><path d="M170 40 H196 V52 H170" stroke={ACC} />
        </g>
        {[[330, 150], [370, 118], [410, 170], [450, 130], [490, 176], [530, 140]].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="8" {...line} /><path d={`M${x - 10} ${y + 22} a10 10 0 0 1 20 0`} {...line} />
            <path d={`M${x} ${y} L262 130`} stroke={DIM} strokeWidth="1" fill="none" />
          </g>
        ))}
        <Packet path="M330 150 L262 130" dur={2.6} />
        <Packet path="M450 130 L262 130" dur={3.2} begin={0.8} />
        <Packet path="M490 176 L262 130" dur={3.8} begin={1.6} />
        <g {...line} transform="translate(560 86)"><rect x="-22" y="0" width="44" height="52" rx="4" /><path d="M-12 14 H12 M-12 24 H8" /><circle cx="10" cy="40" r="8" stroke={ACC} /></g>
      </>
    ),
  },
  education: {
    title: "A learner, a tutor and a record of progress",
    draw: () => (
      <>
        {ground()}
        <g {...line}>
          <path d="M70 130 L150 98 L230 130 L150 162 Z" />
          <path d="M104 146 V176 C130 192 170 192 196 176 V146" />
          <path d="M230 130 V172" />
        </g>
        <circle cx="230" cy="176" r="5" fill={ACC} />
        <g {...line}>
          <path d="M290 206 V104 C320 96 346 100 366 112 C386 100 412 96 442 104 V206 C412 198 386 202 366 214 C346 202 320 198 290 206 Z" />
          <path d="M366 112 V214" />
          <path d="M306 126 H350 M306 146 H350 M382 126 H426 M382 146 H426" />
        </g>
        <path d="M382 166 H426" stroke={ACC} strokeWidth="2.4" strokeLinecap="round"><animate attributeName="stroke-dasharray" values="0 44;44 0;44 0" keyTimes="0;0.6;1" dur="4s" repeatCount="indefinite" /></path>
        <g {...line}>
          <path d="M490 146 a22 22 0 1 1 44 0 c0 10 -8 16 -12 24 h-20 c-4 -8 -12 -14 -12 -24 Z" />
          <path d="M504 178 H520 M506 186 H518" />
        </g>
        <Pulse cx={512} cy={146} r={34} dur={3.2} color={AMB} />
        <path d="M450 150 H484" {...dim} /><path d="M450 150 H484" fill="none" stroke={ACC} strokeWidth="1.5" className="tok-flow tok-keep" />
        <g {...line}><rect x="560" y="120" width="12" height="96" rx="3" /></g>
        <rect x="562" y="122" width="8" height="10" rx="2" fill={ACC}><animate attributeName="height" values="10;90;10" dur="6s" repeatCount="indefinite" /><animate attributeName="y" values="204;122;204" dur="6s" repeatCount="indefinite" /></rect>
      </>
    ),
  },
  legal: {
    title: "Weighing the clause against the source",
    draw: () => (
      <>
        {ground()}
        <g {...line}><path d="M320 90 V210 M290 214 H350 M300 210 H340" /><circle cx="320" cy="84" r="6" stroke={ACC} /></g>
        <g>
          <g {...line}>
            <path d="M200 100 H440" />
            <path d="M216 100 L192 156 H240 Z" /><path d="M424 100 L400 156 H448 Z" />
            <path d="M188 156 a28 12 0 0 0 56 0 M396 156 a28 12 0 0 0 56 0" />
          </g>
          <animateTransform attributeName="transform" type="rotate" values="-4 320 100;4 320 100;-4 320 100" dur="5s" repeatCount="indefinite" />
        </g>
        <g {...line}><rect x="64" y="76" width="92" height="128" rx="4" />{[100, 118, 136, 154, 172].map((y) => <path key={y} d={`M80 ${y} H140`} />)}</g>
        <rect x="76" y="112" width="68" height="12" rx="2" fill={AMB} opacity="0.5"><animate attributeName="y" values="96;164;96" dur="5s" repeatCount="indefinite" /></rect>
        <g {...line}><rect x="484" y="76" width="92" height="128" rx="4" />{[100, 118, 136, 154, 172].map((y) => <path key={y} d={`M500 ${y} H560`} />)}</g>
        <rect x="496" y="112" width="68" height="12" rx="2" fill={ACC} opacity="0.45"><animate attributeName="y" values="96;164;96" dur="5s" begin="0.4s" repeatCount="indefinite" /></rect>
        <Packet path="M156 140 C210 140 220 150 240 150" dur={3} />
        <Packet path="M484 140 C430 140 420 150 400 150" dur={3} begin={0.6} />
      </>
    ),
  },
  startups: {
    title: "Fast launch, with a cap on the fuel",
    draw: () => (
      <>
        {ground()}
        <path d="M60 210 C160 210 200 170 260 130 C320 90 400 70 520 60" fill="none" stroke={DIM} strokeWidth="1.6" strokeDasharray="4 8" />
        <g>
          <g {...line} transform="translate(-14 -30)">
            <path d="M14 0 C24 10 26 26 24 40 H4 C2 26 4 10 14 0 Z" /><circle cx="14" cy="18" r="4" stroke={ACC} />
            <path d="M4 34 L-6 46 L6 42 M24 34 L34 46 L22 42" />
          </g>
          <animateMotion dur="7s" repeatCount="indefinite" rotate="0" path="M60 210 C160 210 200 170 260 130 C320 90 400 70 520 60" />
        </g>
        <g {...line}><rect x="470" y="130" width="120" height="14" rx="7" /><rect x="470" y="160" width="120" height="14" rx="7" /><rect x="470" y="190" width="120" height="14" rx="7" /></g>
        <rect x="472" y="132" width="40" height="10" rx="5" fill={ACC}><animate attributeName="width" values="20;96;20" dur="6s" repeatCount="indefinite" /></rect>
        <rect x="472" y="162" width="60" height="10" rx="5" fill={AMB}><animate attributeName="width" values="40;116;40" dur="7s" repeatCount="indefinite" /></rect>
        <rect x="472" y="192" width="30" height="10" rx="5" fill={ACC}><animate attributeName="width" values="10;70;10" dur="5s" repeatCount="indefinite" /></rect>
        <path d="M90 90 l-18 14 l18 14 M130 90 l18 14 l-18 14 M118 84 l-18 40" {...line} />
      </>
    ),
  },
  enterprise: {
    title: "Many teams, one control plane",
    draw: () => (
      <>
        {ground()}
        {[[60, 120, 40], [110, 90, 44], [164, 140, 36], [440, 100, 44], [494, 70, 50], [552, 124, 40]].map(([x, y, w], i) => (
          <g key={i}>
            <rect x={x} y={y} width={w} height={220 - y} {...line} />
            {[0, 1, 2, 3].map((r) => [0, 1].map((c) => (
              <rect key={`${r}${c}`} x={x + 8 + c * (w / 2 - 4)} y={y + 10 + r * 18} width="8" height="8" fill={(i + r + c) % 3 === 0 ? AMB : ACC} opacity="0.2">
                <animate attributeName="opacity" values="0.15;0.9;0.15" dur={`${3 + ((i + r + c) % 4)}s`} begin={`${(r * 0.7 + c * 0.4 + i * 0.3) % 3}s`} repeatCount="indefinite" />
              </rect>
            )))}
          </g>
        ))}
        <g {...line}><circle cx="320" cy="120" r="34" stroke={ACC} /><path d="M308 120 h24 M320 108 v24" /></g>
        <Pulse cx={320} cy={120} r={52} dur={3.4} />
        {[[200, 140], [220, 112], [400, 112], [420, 140]].map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x} ${y} L${x < 320 ? 288 : 352} 120`} stroke={DIM} strokeWidth="1.3" fill="none" />
            <Packet path={`M${x} ${y} L${x < 320 ? 288 : 352} 120`} dur={2.6} begin={i * 0.5} r={3} />
          </g>
        ))}
      </>
    ),
  },
  knowledge: {
    title: "Documents become an answer with sources",
    draw: () => (
      <>
        {[0, 1, 2].map((i) => (
          <g key={i} {...line} transform={`translate(${60 + i * 12} ${64 + i * 14})`}>
            <path d="M0 0 H56 L72 16 V90 H0 Z" fill="#07191E" /><path d="M10 28 H58 M10 44 H58 M10 60 H44" />
          </g>
        ))}
        <path d="M146 140 H210" {...dim} /><path d="M146 140 H210" fill="none" stroke={ACC} strokeWidth="1.5" className="tok-flow tok-keep" />
        <Packet path="M146 140 H210" dur={2.8} />
        <g {...line}>
          {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={214 + c * 30} y={96 + r * 26} width="24" height="18" rx="3" />))}
        </g>
        <rect x="214" y="96" width="24" height="18" rx="3" fill={ACC} opacity="0"><animate attributeName="opacity" values="0;0.7;0" dur="3s" repeatCount="indefinite" /></rect>
        <rect x="244" y="148" width="24" height="18" rx="3" fill={ACC} opacity="0"><animate attributeName="opacity" values="0;0.7;0" dur="3s" begin="1s" repeatCount="indefinite" /></rect>
        <path d="M318 140 H372" {...dim} /><path d="M318 140 H372" fill="none" stroke={ACC} strokeWidth="1.5" className="tok-flow tok-keep" />
        <g>
          {[[390, 100], [410, 150], [432, 118], [450, 170], [400, 190], [470, 110], [478, 150]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4.5" fill={i === 2 || i === 5 ? ACC : INK}>
              <animate attributeName="opacity" values="0.5;1;0.5" dur={`${2.2 + (i % 3) * 0.6}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
        <path d="M520 60 L432 118" stroke={ACC} strokeWidth="1.3" strokeDasharray="4 5" fill="none" className="tok-flow tok-keep" />
        <g {...line}><rect x="500" y="40" width="100" height="28" rx="14" /><path d="M514 54 H572" /></g>
        <g {...line}><rect x="520" y="150" width="86" height="64" rx="8" /><path d="M534 170 H590 M534 184 H578" /></g>
        <path d="M478 150 C496 150 500 180 520 180" fill="none" stroke={DIM} strokeWidth="1.4" />
        <Packet path="M478 150 C496 150 500 180 520 180" dur={3} begin={0.6} />
        <g transform="translate(540 202)"><rect x="0" y="-6" width="14" height="10" rx="2" fill={AMB} /><rect x="18" y="-6" width="14" height="10" rx="2" fill={AMB} opacity="0.6" /></g>
      </>
    ),
  },
};

export const ART_KEYS = Object.keys(ARTS);

export function IndustryArt({ kind, className, caption = true }: { kind: string; className?: string; caption?: boolean }) {
  const art = ARTS[kind] ?? ARTS.enterprise;
  const uid = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const toggle = () => {
    const next = !paused;
    setPaused(next);
    ref.current?.querySelectorAll("svg").forEach((s) => { try { next ? s.pauseAnimations() : s.unpauseAnimations(); } catch { /* ignore */ } });
  };
  return (
    <figure className={clsx("rounded-2xl border border-white/10 bg-ink-800 overflow-hidden", className)}>
      <div ref={ref} className={clsx("relative", paused && "[&_*]:[animation-play-state:paused]")} role="img" aria-label={art.title}>
        <svg viewBox="0 0 640 260" className="w-full h-auto block" aria-hidden>
          <defs>
            <pattern id={`${uid}g`} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(2,245,161,0.05)" strokeWidth="1" /></pattern>
          </defs>
          <rect width="640" height="260" fill={`url(#${uid}g)`} />
          {art.draw()}
        </svg>
      </div>
      {caption && (
        <figcaption className="flex items-center justify-between gap-4 border-t border-white/10 px-4 py-2.5 text-xs text-text-tertiary">
          <span className="text-text-inverse/90">{art.title}</span>
          <button onClick={toggle} aria-pressed={paused} className="inline-flex items-center gap-1.5 hover:text-text-inverse">
            {paused ? <Play size={12} /> : <Pause size={12} />}{paused ? "Play" : "Pause"}
          </button>
        </figcaption>
      )}
    </figure>
  );
}
