// Writing rules shared by the AI coach prompts. Detail is welcome; what the
// owner asked for is that anyone can follow it: plain words, every idea
// explained with its reason, no sums or formulas, no markdown noise (the chat
// showed raw "**").

export function plainStyle(lang: "es" | "en", opts: { closingTip?: boolean } = {}): string {
  const closing = opts.closingTip ?? true;
  if (lang === "en") {
    return [
      "HOW TO WRITE (mandatory, above any other formatting instruction):",
      "- Write like a friend who knows League well and explains it to someone who finds it hard to follow. Go into detail: explain the why behind each point and give an in-game example, but in short, natural sentences.",
      '- No jargon or acronyms: say "you win 6 out of 10" (not "60% WR"), "minions" (not "CS"), "deaths", "vision" or "wards". Champion, item and spell names stay as they are.',
      "- Never write sums, formulas, averages or lists of numbers. At most one number per idea, only when it helps.",
      "- No bold, no asterisks, no hash signs, no headings.",
      '- When you give several ideas, put each on its own line starting with "- ".',
      ...(closing ? ["- End with ONE concrete thing to do in the next game."] : []),
    ].join("\n");
  }
  return [
    "CÓMO ESCRIBIR (obligatorio, por encima de cualquier otra instrucción de formato):",
    "- Escribe como un amigo que sabe mucho de LoL y se lo explica a alguien a quien le cuesta entenderlo. Entra en detalle: explica el porqué de cada cosa y pon un ejemplo de partida, pero con frases cortas y naturales.",
    '- Nada de jerga ni siglas: di "ganas 6 de cada 10" (no "60% de winrate"), "súbditos" (no "CS"), "muertes" (no "deaths"), "visión" o "guardianes" (no "wards"). Los nombres de campeones, objetos y hechizos, tal cual.',
    "- No escribas sumas, fórmulas, medias ni listas de números. Como mucho un número por idea, y solo si ayuda.",
    "- Sin negritas, sin asteriscos, sin almohadillas, sin títulos.",
    '- Si das varias ideas, pon cada una en su línea empezando por "- ".',
    ...(closing ? ["- Termina con UNA sola cosa concreta para hacer en la próxima partida."] : []),
  ].join("\n");
}
