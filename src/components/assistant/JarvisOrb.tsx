import React from 'react';

export function JarvisOrb({ size = 'md', active = false }: { size?: 'sm' | 'md' | 'lg'; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`jarvis-orb jarvis-orb--${size}${active ? ' is-active' : ''}`}
    >
      <span className="jarvis-orb__ring jarvis-orb__ring--outer" />
      <span className="jarvis-orb__ring jarvis-orb__ring--inner" />
      <span className="jarvis-orb__core">
        <span className="jarvis-orb__glint" />
      </span>
      <span className="jarvis-orb__node jarvis-orb__node--one" />
      <span className="jarvis-orb__node jarvis-orb__node--two" />
      <span className="jarvis-orb__node jarvis-orb__node--three" />
    </span>
  );
}

export function JarvisOrbStyles() {
  return <style>{`
    .jarvis-orb{--orb-size:52px;position:relative;display:inline-grid;width:var(--orb-size);height:var(--orb-size);place-items:center;isolation:isolate;perspective:220px;transform-style:preserve-3d;flex:none}
    .jarvis-orb--sm{--orb-size:32px}.jarvis-orb--lg{--orb-size:92px}
    .jarvis-orb__core{position:absolute;inset:18%;border-radius:50%;background:radial-gradient(circle at 34% 28%,#f5ffc7 0 5%,#c5f36a 18%,#78a53f 45%,#253a27 72%,#101713 100%);box-shadow:inset -5px -7px 12px #10171399,inset 3px 3px 8px #f7ffd477,0 0 22px #c5f36a66;transform:translateZ(14px);overflow:hidden}
    .jarvis-orb__glint{position:absolute;top:15%;left:22%;width:34%;height:17%;border-radius:100%;background:#fffbd9aa;filter:blur(2px);transform:rotate(-32deg)}
    .jarvis-orb__ring{position:absolute;inset:5%;border:1px solid #c5f36a99;border-radius:50%;transform-style:preserve-3d;box-shadow:0 0 12px #c5f36a33}
    .jarvis-orb__ring--outer{transform:rotateX(68deg) rotateY(-24deg);animation:jarvis-orbit 9s linear infinite}
    .jarvis-orb__ring--inner{inset:14%;border-color:#f4ffd488;transform:rotateX(58deg) rotateY(48deg);animation:jarvis-orbit-inner 7s linear infinite reverse}
    .jarvis-orb__node{position:absolute;width:5px;height:5px;border-radius:50%;background:#f2ffc0;box-shadow:0 0 10px #c5f36a;transform:translateZ(22px)}
    .jarvis-orb__node--one{top:8%;left:48%}.jarvis-orb__node--two{right:6%;bottom:31%}.jarvis-orb__node--three{left:13%;bottom:15%}
    .jarvis-orb.is-active .jarvis-orb__core{box-shadow:inset -5px -7px 12px #10171399,inset 3px 3px 8px #f7ffd477,0 0 34px #c5f36aaa}
    @keyframes jarvis-orbit{to{transform:rotateX(68deg) rotateY(336deg)}}
    @keyframes jarvis-orbit-inner{to{transform:rotateX(58deg) rotateY(408deg)}}
    @media(prefers-reduced-motion:reduce){.jarvis-orb__ring{animation:none!important}}
  `}</style>;
}
