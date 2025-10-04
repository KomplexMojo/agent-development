// assembly/agent/vitals.ts
// Purpose: Self-contained vitals value object. Owns hp/sp/stamina behavior.

export class Vitals {

  stamina: i32 = 100;
  staminaMax: i32 = 100;
  staminaRegen: i32 = 0; // per tick

  // Snapshot getters — simple numbers to export to JS/UI
  getStamina(): i32 { return this.stamina; }
  getStaminaMax(): i32 { return this.staminaMax; }
  getStaminaRegen(): i32 { return this.staminaRegen; }
}