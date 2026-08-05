import { CountUp } from "@/components/home/count-up";

export function StatItem({ val, lbl }: { val: number | string; lbl: string }) {
  return (
    <div>
      <div className="text-[2.25rem] font-extrabold text-blue-300 [text-shadow:0_2px_12px_rgba(0,10,40,.6)]">
        {typeof val === "number" ? <CountUp value={val} /> : val}
      </div>
      <div className="text-sm font-semibold uppercase tracking-[.06em] text-primary-foreground [text-shadow:0_1px_8px_rgba(0,10,40,.55)]">
        {lbl}
      </div>
    </div>
  );
}
