import { type ReactElement } from "react";

/** A marca da Criarte, redesenhada em vetor a partir da logo oficial. */
export function LogoCriarte({ className }: { className?: string }): ReactElement {
  return (
    <svg viewBox="140 190 1220 1110" className={className} role="img" aria-label="Criarte">
      <g fill="#758160">
        <path d="M370 1232C230 1110 160 880 160 680C160 420 280 212 490 212C650 212 780 320 850 476C740 372 640 326 550 326C340 326 245 520 245 760C245 940 290 1110 370 1232Z" />
        <path d="M413 1278C850 1250 1180 960 1290 800C1380 640 1320 434 1083 434C900 434 700 560 600 700C470 880 480 1060 488 1157C560 940 700 700 850 605C1000 510 1178 540 1178 712C1178 960 820 1250 413 1278Z" />
      </g>
    </svg>
  );
}
