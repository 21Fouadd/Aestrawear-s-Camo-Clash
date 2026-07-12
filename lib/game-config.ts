export type PantId = "ghost" | "chain" | "guard" | "surge";

export type PantConfig = {
  id: PantId;
  name: string;
  callSign: string;
  ability: string;
  abilityLabel: string;
  description: string;
  cooldown: number;
  color: string;
  asset: string;
};

export const PANTS: PantConfig[] = [
  {
    id: "ghost",
    name: "Grey Woodland",
    callSign: "GHOSTSTEP",
    ability: "Ghost Step",
    abilityLabel: "Vanish, move faster, then land a crushing ambush strike.",
    description: "Evasive · burst damage",
    cooldown: 14,
    color: "#f7f7f2",
    asset: "/pants/pants1.webp",
  },
  {
    id: "chain",
    name: "Pale Tree",
    callSign: "CHAINBURST",
    ability: "Chain Burst",
    abilityLabel: "Arc street energy through up to five nearby enemies.",
    description: "Crowd control · chain damage",
    cooldown: 13,
    color: "#d8d8d4",
    asset: "/pants/pants2.webp",
  },
  {
    id: "guard",
    name: "Concrete Wash",
    callSign: "CONCRETE GUARD",
    ability: "Concrete Guard",
    abilityLabel: "Reduce incoming damage and blast attackers away.",
    description: "Defense · knockback",
    cooldown: 17,
    color: "#b8b8b4",
    asset: "/pants/pants3.webp",
  },
  {
    id: "surge",
    name: "Night Smoke",
    callSign: "NIGHT SURGE",
    ability: "Night Surge",
    abilityLabel: "Attack at high speed and keep your combo alive while the surge lasts.",
    description: "Speed · combo control",
    cooldown: 18,
    color: "#eeeeea",
    asset: "/pants/pants4.webp",
  },
];

export const PANT_IDS = PANTS.map((pant) => pant.id);

export function getPant(id: PantId) {
  return PANTS.find((pant) => pant.id === id) ?? PANTS[0];
}
