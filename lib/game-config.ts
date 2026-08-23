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
    name: "Grey Tree Camo",
    callSign: "GHOSTSTEP",
    ability: "Ghost Step",
    abilityLabel: "Vanish, move faster, then land a crushing ambush strike.",
    description: "Evasive · burst damage",
    cooldown: 14,
    color: "#63d8ff",
    asset: "/pants/pants1.webp",
  },
  {
    id: "chain",
    name: "Tree Camo",
    callSign: "CHAINBURST",
    ability: "Chain Burst",
    abilityLabel: "Arc street energy through up to five nearby enemies.",
    description: "Crowd control · chain damage",
    cooldown: 13,
    color: "#b785ff",
    asset: "/pants/pants2.webp",
  },
  {
    id: "guard",
    name: "White Tree Camo",
    callSign: "CONCRETE GUARD",
    ability: "Concrete Guard",
    abilityLabel: "Reduce incoming damage and blast attackers away.",
    description: "Defense · knockback",
    cooldown: 17,
    color: "#ffc857",
    asset: "/pants/pants3.webp",
  },
  {
    id: "surge",
    name: "Smokey Black Camo",
    callSign: "NIGHT SURGE",
    ability: "Night Surge",
    abilityLabel: "Attack at high speed and keep your combo alive while the surge lasts.",
    description: "Speed · combo control",
    cooldown: 18,
    color: "#ff5a73",
    asset: "/pants/pants4.webp",
  },
];

export const PANT_IDS = PANTS.map((pant) => pant.id);

export function getPant(id: PantId) {
  return PANTS.find((pant) => pant.id === id) ?? PANTS[0];
}
