interface Props {
  term: string;
  children?: React.ReactNode;
}

const GLOSSARY: Record<string, string> = {
  GPI: "Gameplay Performance Index. Score 0-100 que combina farm, visión, agresión, supervivencia, objetivos y versatilidad.",
  KDA: "Kills + Assists ÷ Deaths. >2 es decente, >4 es excelente.",
  CS: "Creep Score. Minions y monstruos asesinados. Marca el oro disponible para items.",
  CSPM: "CS por minuto. Diamond promedio: top 7, jungla 5.5, mid 7.5, ADC 8.",
  KP: "Kill Participation. % de las kills del equipo en las que participaste. >55% en SoloQ es bueno.",
  WR: "Win Rate. % de partidas ganadas.",
  LP: "League Points. Sistema de puntuación dentro de cada división.",
  Vision:
    "Vision Score. Combina wards puestas, control wards comprados y wards enemigos destruidos. >1/min es bueno.",
  Counter: "Cómo le va a un campeón contra otro en estadística histórica.",
  Synergy: "Compatibilidad entre dos campeones del mismo equipo.",
  Tier:
    "S, A, B, C, D según winrate global. S = >53.5%, A = >51.5%, B = ≥49%, C = ≥47%, D = <47%.",
  Mastery:
    "Nivel de maestría con un campeón (1-7). M5+ implica conocimiento sólido. >100k pts es 'main', >200k 'one-trick'.",
  Hotstreak: "4 victorias seguidas o más. Riot lo marca como 'jugador en racha'.",
};

export function InfoTooltip({ term, children }: Props) {
  const detail = GLOSSARY[term];
  if (!detail) return <>{children ?? term}</>;
  return (
    <span
      className="border-b border-dotted border-white/30 cursor-help"
      title={detail}
    >
      {children ?? term}
    </span>
  );
}
