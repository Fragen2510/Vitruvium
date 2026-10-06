const SYSTEM_ID = "vitruvium";

const CHARACTERISTICS = {
  physique: { label: "Телосложение" },
  movement: { label: "Движение" },
  awareness: { label: "Внимание" },
  thinking: { label: "Мышление" },
  influence: { label: "Влияние" },
  will: { label: "Воля" }
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const getSetting = (key) => game.settings.get(SYSTEM_ID, key);
const dieSuccess = (face) => (face === 6 ? 2 : face >= 4 ? 1 : 0);

/** Roll a special d6 pool. Each die yields 0, 1 or 2 successes. */
async function rollPool({ dice, difficulty, advantage = 0, hindrance = 0, bonusSuccesses = 0, useInspiration = false, domainLevel = 0, speaker }) {
  const maxDice = getSetting("maxDice");
  const count = clamp(dice + (useInspiration ? 1 : 0), 1, maxDice + 1);
  const net = clamp(advantage, 0, 2) - clamp(hindrance, 0, 2);
  const attempts = Math.abs(net) + 1;
  const pools = [];

  for (let i = 0; i < attempts; i += 1) {
    const roll = await (new Roll(`${count}d6`)).evaluate();
    const faces = roll.dice[0].results.map((result) => result.result);
    pools.push({ faces, successes: faces.reduce((total, face) => total + dieSuccess(face), 0), roll });
  }

  const chosen = pools.reduce((selected, pool) => {
    if (net > 0) return pool.successes > selected.successes ? pool : selected;
    if (net < 0) return pool.successes < selected.successes ? pool : selected;
    return selected;
  });
  const domainBonus = Math.max(0, Number(domainLevel) || 0);
  const total = chosen.successes + Math.max(0, Number(bonusSuccesses) || 0) + domainBonus;
  const success = total >= difficulty;
  const rolls = pools.map((pool, index) => `<li${pool === chosen ? " class=\"chosen\"" : ""}>Бросок ${index + 1}: ${pool.faces.join(", ")} — <b>${pool.successes}</b> успех(а/ов)</li>`).join("");
  const mode = net > 0 ? `Преимущество ×${net}` : net < 0 ? `Помеха ×${Math.abs(net)}` : "Обычный бросок";
  const labels = [];
  if (useInspiration) labels.push("вдохновение");
  if (domainLevel) labels.push(`домен Lv.${domainLevel}`);
  const content = `<section class="vitruvium-chat-card"><h3>${success ? "Успех" : "Провал"}</h3><p>${mode}. Сложность: <b>${difficulty}</b>. Кубиков: <b>${count}</b>.</p><ul>${rolls}</ul><p>Итог: <b>${total}</b> успех(а/ов)${labels.length ? ` (${labels.join(", ")})` : ""}.</p></section>`;
  await ChatMessage.create({ content, speaker, rolls: pools.map((pool) => pool.roll.toJSON()) });
}

const trayState = {
  dice: 1, difficulty: 1, characteristic: "physique", advantage: 0, hindrance: 0,
  useInspiration: false, domainId: "", useDomain: false, speaker: null
};

function chatRoot(html) {
  return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

/** Persistent Dice Tray-style panel below the chat composer. */
function renderChatTray(html) {
  const root = chatRoot(html) ?? document.querySelector("#chat");
  if (!root?.querySelector) return;
  root.querySelector("#vitruvium-dice-tray")?.remove();
  const chatForm = root.querySelector("#chat-form");
  const target = root.querySelector("#chat-controls") ?? chatForm?.parentElement;
  if (!target) return;
  const tray = document.createElement("section");
  tray.id = "vitruvium-dice-tray";
  tray.className = "vitruvium-dice-tray";
  tray.innerHTML = `
    <div class="tray-title">Бросок Vitruvium</div>
    <label class="tray-select">Характеристика
      <select data-tray-field="characteristic">${Object.entries(CHARACTERISTICS).map(([key, item]) => `<option value="${key}" ${trayState.characteristic === key ? "selected" : ""}>${item.label}</option>`).join("")}</select>
    </label>
    <div class="tray-grid">
      <div class="tray-readonly"><span>Кубики</span><b id="vitruvium-dice-count">${trayState.dice}</b></div>
      ${trayCounter("Сложность", "difficulty", trayState.difficulty, 1, 99)}
      ${trayCounter("Преимущество", "advantage", trayState.advantage, 0, 2)}
      ${trayCounter("Помеха", "hindrance", trayState.hindrance, 0, 2)}
    </div>
    <label class="tray-toggle"><input type="checkbox" data-tray-field="useInspiration" ${trayState.useInspiration ? "checked" : ""}> Потратить 1 вдохновение</label>
    <label class="tray-select">Домен
      <select data-tray-field="domainId"><option value="">Не выбран</option>${(game.user?.character?.items ?? []).filter((item) => item.type === "domain").map((item) => `<option value="${item.id}" ${trayState.domainId === item.id ? "selected" : ""}>${item.name} — Lv.${item.system?.value ?? 1}</option>`).join("")}</select>
    </label>
    <label class="tray-toggle"><input type="checkbox" data-tray-field="useDomain" ${trayState.useDomain ? "checked" : ""}> Использовать домен</label>
    <button type="button" class="tray-roll" data-tray-action="roll">Бросить</button>`;
  target.append(tray);
  tray.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.trayAction === "change") {
      const key = button.dataset.key;
      const max = Number(button.dataset.max);
      trayState[key] = clamp(trayState[key] + Number(button.dataset.delta), Number(button.dataset.min), max);
      renderChatTray(root);
      return;
    }
    if (button.dataset.trayAction === "roll") {
      const actor = game.user?.character;
      const domain = actor?.items?.get(trayState.domainId);
      const characteristic = Number(actor?.system?.characteristics?.[trayState.characteristic]?.value ?? 1);
      const domainLevel = trayState.useDomain ? Number(domain?.system?.value ?? 0) : 0;
      const dice = Math.max(1, characteristic);
      trayState.dice = dice;
      root.querySelector("#vitruvium-dice-count")?.replaceChildren(document.createTextNode(String(dice)));
      await rollPool({
        dice,
        difficulty: trayState.difficulty,
        advantage: trayState.advantage,
        hindrance: trayState.hindrance,
        useInspiration: trayState.useInspiration && (actor?.system?.inspiration ?? 0) > 0,
        domainLevel,
        speaker: trayState.speaker ?? ChatMessage.getSpeaker()
      });
      if (trayState.useInspiration && (actor?.system?.inspiration ?? 0) > 0) {
        await actor.update({ "system.inspiration": actor.system.inspiration - 1 });
      }
    }
  });
  tray.addEventListener("change", (event) => {
    const field = event.target.dataset.trayField;
    if (!field) return;
    trayState[field] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    renderChatTray(root);
  });
}

function trayCounter(label, key, value, min, max) {
  return `<div class="tray-counter"><span>${label}</span><button type="button" data-tray-action="change" data-key="${key}" data-delta="-1" data-min="${min}" data-max="${max}">−</button><b>${value}</b><button type="button" data-tray-action="change" data-key="${key}" data-delta="1" data-min="${min}" data-max="${max}">+</button></div>`;
}

class VitruviumActorSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vitruvium", "sheet", "actor"], position: { width: 760, height: 720 },
    form: { closeOnSubmit: false, submitOnChange: true }
  };
  static PARTS = { main: { template: "systems/vitruvium/templates/actor-sheet.hbs" } };
  constructor(options) {
    super(options);
    this.editing = { characteristics: false, domains: false, attributes: false, possessions: false, statuses: false, relationships: false };
  }
  get title() { return this.actor.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const relationships = this.actor.system.relationships ?? [];
    return {
      ...context, actor: this.actor, system: this.actor.system, characteristics: CHARACTERISTICS,
      relationships, maxCharacteristic: getSetting("maxCharacteristic"), relationshipMin: getSetting("relationshipMin"),
      relationshipMax: getSetting("relationshipMax"), maxInspiration: getSetting("maxInspiration"),
      domains: this.actor.items.filter((item) => item.type === "domain").map((domain) => ({ id: domain.id, name: domain.name, system: domain.system, abilities: this.actor.items.filter((item) => item.type === "ability" && item.system.domainId === domain.id).map((ability) => ({ id: ability.id, name: ability.name })) })),
      abilities: this.actor.items.filter((item) => item.type === "ability"),
      attributes: this.actor.items.filter((item) => item.type === "attribute"),
      possessions: this.actor.items.filter((item) => item.type === "possession"),
      statuses: this.actor.items.filter((item) => item.type === "status"),
      editing: this.editing
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelectorAll("[data-vitruvium-action]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const action = button.dataset.vitruviumAction;
        if (action === "toggle-edit") { this.editing[button.dataset.section] = !this.editing[button.dataset.section]; return this.render(); }
        const handlers = {
          "adjust-inspiration": VitruviumActorSheet.#adjustInspiration,
          "adjust-characteristic": VitruviumActorSheet.#adjustCharacteristic,
          "create-item": VitruviumActorSheet.#createItem, "delete-item": VitruviumActorSheet.#deleteItem,
          "edit-item": VitruviumActorSheet.#editItem, "create-ability": VitruviumActorSheet.#createAbility,
          "add-relationship": VitruviumActorSheet.#addRelationship, "adjust-relationship": VitruviumActorSheet.#adjustRelationship,
          "remove-relationship": VitruviumActorSheet.#removeRelationship
        };
        return handlers[action]?.call(this, event, button);
      });
    });
  }

  static async #adjustCharacteristic(event, target) {
    const key = target.dataset.characteristic;
    const value = clamp((this.actor.system.characteristics?.[key]?.value ?? 1) + Number(target.dataset.delta), 1, getSetting("maxCharacteristic"));
    return this.actor.update({ [`system.characteristics.${key}.value`]: value });
  }

  static async #createItem(event, target) {
    const type = target.dataset.type;
    if (type === "domain" && this.actor.items.filter((item) => item.type === "domain").length >= 6) {
      return ui.notifications.warn("У персонажа не может быть больше 6 доменов.");
    }
    if (type === "attribute" && this.actor.items.filter((item) => item.type === "attribute").length >= 12) {
      return ui.notifications.warn("У персонажа не может быть больше 12 атрибутов.");
    }
    const labels = { domain: "Новый домен", ability: "Новая способность", attribute: "Новый атрибут", possession: "Новое имущество", status: "Новый статус" };
    return this.actor.createEmbeddedDocuments("Item", [{ name: labels[type], type, system: type === "domain" ? { value: 1 } : {} }]);
  }

  static async #deleteItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    const ids = [target.dataset.itemId];
    if (item?.type === "domain") ids.push(...this.actor.items.filter((entry) => entry.type === "ability" && entry.system.domainId === item.id).map((entry) => entry.id));
    return this.actor.deleteEmbeddedDocuments("Item", ids);
  }

  static async #editItem(event, target) {
    return (this.actor.items.get(target.dataset.itemId) ?? game.items.get(target.dataset.itemId))?.sheet.render(true);
  }

  static async #createAbility(event, target) {
    const domain = this.actor.items.get(target.dataset.domainId);
    if (!domain) return;
    const level = clamp(domain.system.value, 1, 3);
    const abilities = this.actor.items.filter((item) => item.type === "ability" && item.system.domainId === domain.id);
    if (abilities.length >= level * 2) return ui.notifications.warn(`У домена «${domain.name}» максимум ${level * 2} способности.`);
    return this.actor.createEmbeddedDocuments("Item", [{ name: "Новая способность", type: "ability", system: { domainId: domain.id, description: "" } }]);
  }

  static async #adjustInspiration(event, target) {
    const value = clamp((this.actor.system.inspiration ?? 0) + Number(target.dataset.delta), 0, getSetting("maxInspiration"));
    return this.actor.update({ "system.inspiration": value });
  }

  static async #addRelationship() {
    const relationships = [...(this.actor.system.relationships ?? [])];
    relationships.push({ id: foundry.utils.randomID(), name: "Новые отношения", value: 0, portrait: "", entityUuid: "" });
    return this.actor.update({ "system.relationships": relationships });
  }

  static async #adjustRelationship(event, target) {
    const relationships = foundry.utils.deepClone(this.actor.system.relationships ?? []);
    const relationship = relationships.find((entry) => entry.id === target.dataset.id);
    if (!relationship) return;
    relationship.value = clamp(relationship.value + Number(target.dataset.delta), getSetting("relationshipMin"), getSetting("relationshipMax"));
    return this.actor.update({ "system.relationships": relationships });
  }

  static async #removeRelationship(event, target) {
    const relationships = (this.actor.system.relationships ?? []).filter((entry) => entry.id !== target.dataset.id);
    return this.actor.update({ "system.relationships": relationships });
  }
}

class VitruviumItemSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = { classes: ["vitruvium", "sheet", "item"], position: { width: 540, height: 480 }, form: { closeOnSubmit: false, submitOnChange: true } };
  static PARTS = { main: { template: "systems/vitruvium/templates/item-sheet.hbs" } };
  get isEditable() {
    const mayEditAspect = game.user.isGM || game.user.role >= CONST.USER_ROLES.ASSISTANT;
    return super.isEditable && (this.item.type !== "aspect" || mayEditAspect);
  }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context, item: this.item, system: this.item.system,
      hasValue: ["domain", "aspect"].includes(this.item.type), isAspect: this.item.type === "aspect",
      canEditAspect: game.user.isGM || game.user.role >= CONST.USER_ROLES.ASSISTANT
    };
  }
}

class VitruviumAspectManager extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = { id: "vitruvium-aspects", tag: "section", classes: ["vitruvium", "aspect-manager"], position: { width: 620, height: 620 }, window: { title: "Аспекты мира" } };
  static PARTS = { main: { template: "systems/vitruvium/templates/aspect-manager.hbs" } };
  get canEdit() { return game.user.isGM || game.user.role >= CONST.USER_ROLES.ASSISTANT; }
  async _prepareContext() {
    return { aspects: game.items.filter((item) => item.type === "aspect"), canEdit: this.canEdit };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelectorAll("[data-aspect-action]").forEach((button) => button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!this.canEdit) return;
      if (button.dataset.aspectAction === "create") {
        const [aspect] = await Item.createDocuments([{ name: "Новый аспект", type: "aspect", system: { value: 0, description: "", statuses: [] } }]);
        return aspect.sheet.render(true);
      }
      const aspect = game.items.get(button.dataset.itemId);
      if (button.dataset.aspectAction === "edit") return aspect?.sheet.render(true);
      if (button.dataset.aspectAction === "delete") return aspect?.delete();
    }));
  }
}

function registerSettings() {
  const settings = [
    ["maxDice", 6, 1, 99, "Максимум кубиков в пуле"],
    ["maxCharacteristic", 3, 1, 99, "Максимальный уровень характеристики"],
    ["maxInspiration", 6, 0, 99, "Максимальный запас вдохновения"],
    ["relationshipMin", -6, -99, 99, "Минимальное значение отношений"],
    ["relationshipMax", 6, -99, 99, "Максимальное значение отношений"]
  ];
  for (const [key, defaultValue, min, max, name] of settings) {
    game.settings.register(SYSTEM_ID, key, { name, scope: "world", config: true, type: Number, default: defaultValue, range: { min, max, step: 1 }, restricted: true, onChange: normalizeActorLimits });
  }
}

async function normalizeActorLimits() {
  if (!game.user?.isGM) return;
  for (const actor of game.actors.filter((entry) => entry.type === "character")) {
    const characteristics = foundry.utils.deepClone(actor.system.characteristics ?? {});
    for (const key of Object.keys(CHARACTERISTICS)) {
      if (characteristics[key]) characteristics[key].value = clamp(characteristics[key].value, 1, getSetting("maxCharacteristic"));
    }
    await actor.update({
      "system.characteristics": characteristics,
      "system.inspiration": clamp(actor.system.inspiration, 0, getSetting("maxInspiration"))
    });
  }
}

Hooks.once("init", () => {
  registerSettings();
  CONFIG.VITRUVIUM = { characteristics: CHARACTERISTICS };
  const SheetConfig = foundry.applications.apps.DocumentSheetConfig;
  SheetConfig.registerSheet(Actor, SYSTEM_ID, VitruviumActorSheet, { makeDefault: true });
  SheetConfig.registerSheet(Item, SYSTEM_ID, VitruviumItemSheet, { makeDefault: true });
});

Hooks.on("getSceneControlButtons", (controls) => {
  controls.push({
    name: "vitruvium", title: "Vitruvium", icon: "fa-solid fa-book-open", layer: "controls",
    tools: [{ name: "world-aspects", title: "Аспекты мира", icon: "fa-solid fa-list", button: true, onChange: () => new VitruviumAspectManager().render(true) }]
  });
});

Hooks.on("preCreateActor", (actor) => {
  if (actor.type !== "character") return;
  const characteristics = Object.fromEntries(Object.keys(CHARACTERISTICS).map((key) => [key, { value: 1 }]));
  actor.updateSource({ system: { characteristics, inspiration: 0, relationships: [] } });
});

Hooks.on("preUpdateActor", (actor, change) => {
  const incoming = change.system ?? {};
  if (incoming.inspiration !== undefined) incoming.inspiration = clamp(incoming.inspiration, 0, getSetting("maxInspiration"));
  const changedCharacteristics = incoming.characteristics ?? {};
  for (const key of Object.keys(CHARACTERISTICS)) {
    const value = changedCharacteristics[key]?.value;
    if (value !== undefined) changedCharacteristics[key].value = clamp(value, 1, getSetting("maxCharacteristic"));
  }
});

Hooks.on("preUpdateItem", (item, change) => {
  if (item.type !== "domain") return;
  const nextLevel = change.system?.value;
  if (nextLevel === undefined) return;
  change.system.value = clamp(nextLevel, 1, 3);
  const actor = item.parent;
  if (!actor?.items) return;
  const abilityCount = actor.items.filter((entry) => entry.type === "ability" && entry.system.domainId === item.id).length;
  if (abilityCount > change.system.value * 2) {
    ui.notifications.warn("Сначала удалите лишние способности этого домена.");
    return false;
  }
});

function protectAspects(item, userId) {
  if (item.type !== "aspect") return true;
  const user = game.users.get(userId);
  if (!user?.isGM && user?.role < CONST.USER_ROLES.ASSISTANT) {
    ui.notifications.warn("Редактировать аспекты могут только мастер и ассистенты.");
    return false;
  }
  return true;
}

Hooks.on("preCreateItem", (item, change, options, userId) => protectAspects(item, userId));
Hooks.on("preUpdateItem", (item, change, options, userId) => protectAspects(item, userId));
Hooks.on("preDeleteItem", (item, options, userId) => protectAspects(item, userId));

Hooks.on("renderChatLog", (app, html) => renderChatTray(html));
Hooks.once("ready", () => {
  game.vitruvium = { rollPool, renderChatTray };
  if (ui.chat?.element) renderChatTray(ui.chat.element);
});
