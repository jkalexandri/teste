// Ícones usados no login, copiados 1:1 da prévia (formato lucide).
// Ficam embutidos aqui para garantir que o desenho seja idêntico ao da prévia,
// sem depender da versão de uma biblioteca externa.
import type { CSSProperties, SVGProps } from "react";

type IconNode = [string, Record<string, string>][];

type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  size?: number;
  style?: CSSProperties;
};

function makeIcon(name: string, node: IconNode) {
  function Icon({ size = 24, className = "", ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`lucide lucide-${name} ${className}`.trim()}
        {...rest}
      >
        {node.map(([tag, attrs], i) => {
          const Tag = tag as "path";
          return <Tag key={i} {...attrs} />;
        })}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const ArrowRight = makeIcon("arrow-right", [
  ["path", { d: "M5 12h14" }],
  ["path", { d: "m12 5 7 7-7 7" }],
]);

export const Building2 = makeIcon("building-2", [
  ["path", { d: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" }],
  ["path", { d: "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" }],
  ["path", { d: "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" }],
  ["path", { d: "M10 6h4" }],
  ["path", { d: "M10 10h4" }],
  ["path", { d: "M10 14h4" }],
  ["path", { d: "M10 18h4" }],
]);

export const ChevronRight = makeIcon("chevron-right", [["path", { d: "m9 18 6-6-6-6" }]]);

export const CircleCheck = makeIcon("circle-check", [
  ["circle", { cx: "12", cy: "12", r: "10" }],
  ["path", { d: "m9 12 2 2 4-4" }],
]);

export const CircleDashed = makeIcon("circle-dashed", [
  ["path", { d: "M10.1 2.182a10 10 0 0 1 3.8 0" }],
  ["path", { d: "M13.9 21.818a10 10 0 0 1-3.8 0" }],
  ["path", { d: "M17.609 3.721a10 10 0 0 1 2.69 2.7" }],
  ["path", { d: "M2.182 13.9a10 10 0 0 1 0-3.8" }],
  ["path", { d: "M20.279 17.609a10 10 0 0 1-2.7 2.69" }],
  ["path", { d: "M21.818 10.1a10 10 0 0 1 0 3.8" }],
  ["path", { d: "M3.721 6.391a10 10 0 0 1 2.7-2.69" }],
  ["path", { d: "M6.391 20.279a10 10 0 0 1-2.69-2.7" }],
]);

export const EyeOff = makeIcon("eye-off", [
  ["path", { d: "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" }],
  ["path", { d: "M14.084 14.158a3 3 0 0 1-4.242-4.242" }],
  ["path", { d: "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" }],
  ["path", { d: "m2 2 20 20" }],
]);

export const Eye = makeIcon("eye", [
  ["path", { d: "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" }],
  ["circle", { cx: "12", cy: "12", r: "3" }],
]);

export const Lock = makeIcon("lock", [
  ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }],
  ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }],
]);

export const Mail = makeIcon("mail", [
  ["rect", { width: "20", height: "16", x: "2", y: "4", rx: "2" }],
  ["path", { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" }],
]);

export const Moon = makeIcon("moon", [["path", { d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" }]]);

export const ShieldCheck = makeIcon("shield-check", [
  ["path", { d: "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" }],
  ["path", { d: "m9 12 2 2 4-4" }],
]);

export const Sparkles = makeIcon("sparkles", [
  ["path", { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" }],
  ["path", { d: "M20 3v4" }],
  ["path", { d: "M22 5h-4" }],
  ["path", { d: "M4 17v2" }],
  ["path", { d: "M5 18H3" }],
]);

export const Sun = makeIcon("sun", [
  ["circle", { cx: "12", cy: "12", r: "4" }],
  ["path", { d: "M12 2v2" }],
  ["path", { d: "M12 20v2" }],
  ["path", { d: "m4.93 4.93 1.41 1.41" }],
  ["path", { d: "m17.66 17.66 1.41 1.41" }],
  ["path", { d: "M2 12h2" }],
  ["path", { d: "M20 12h2" }],
  ["path", { d: "m6.34 17.66-1.41 1.41" }],
  ["path", { d: "m19.07 4.93-1.41 1.41" }],
]);

export const TriangleAlert = makeIcon("triangle-alert", [
  ["path", { d: "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" }],
  ["path", { d: "M12 9v4" }],
  ["path", { d: "M12 17h.01" }],
]);

export const Users = makeIcon("users", [
  ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
  ["circle", { cx: "9", cy: "7", r: "4" }],
  ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87" }],
  ["path", { d: "M16 3.13a4 4 0 0 1 0 7.75" }],
]);

export const Zap = makeIcon("zap", [
  ["path", { d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" }],
]);
