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
async function rollPool({ dice, advantage = 0, hindrance = 0, speaker }) {
  const maxDice = Math.max(1, Number(getSetting("maxDice")) || 6);
  const count = clamp(dice, 1, maxDice);
  const net = clamp(advantage, 0, 2) - clamp(hindrance, 0, 2);
  const attempts = Math.abs(net) + 1;
  const pools = [];

  for (let i = 0; i < attempts; i += 1) {
    const roll = await (new Roll(`${count}d6`)).evaluate();
    const faces = roll.dice[0].results.map((result) => dieSuccess(result.result));
    pools.push({ faces, successes: faces.reduce((total, face) => total + face, 0) });
  }

  const chosen = pools.reduce((selected, pool) => {
    if (net > 0) return pool.successes > selected.successes ? pool : selected;
    if (net < 0) return pool.successes < selected.successes ? pool : selected;
    return selected;
  });
  const rolls = pools.map((pool, index) => `<li${pool === chosen ? " class=\"chosen\"" : ""}>Бросок ${index + 1}: ${pool.faces.join(", ")} — <b>${pool.successes}</b> успех(а/ов)</li>`).join("");
  const mode = net > 0 ? `Преимущество ×${net}` : net < 0 ? `Помеха ×${Math.abs(net)}` : "Обычный бросок";
  const content = `<section class="vitruvium-chat-card"><h3>Бросок Vitruvium</h3><p>${mode}. Кубиков: <b>${count}</b>.</p><ul>${rolls}</ul><p>Итог: <b>${chosen.successes}</b> успех(а/ов).</p></section>`;
  await ChatMessage.create({ content, speaker });
}

const trayState = {
  dice: 3, advantage: 0, hindrance: 0
};

function chatRoot(html) {
  return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

/** Persistent compact Dice Tray below the chat composer. */
function renderChatTray(html) {
  const root = chatRoot(html) ?? document.querySelector("#chat");
  if (!root?.querySelector) return;
  root.querySelector("#vitruvium-dice-tray")?.remove();
  const chatForm = root.querySelector("#chat-form");
  const target = root.querySelector("#chat-controls") ?? chatForm?.parentElement ?? root;
  if (!target) return;
  const tray = document.createElement("section");
  tray.id = "vitruvium-dice-tray";
  tray.className = "vitruvium-dice-tray";
  const maxDice = Math.max(1, Number(getSetting("maxDice")) || 6);
  trayState.dice = clamp(trayState.dice, 1, maxDice);
  tray.innerHTML = `
    <div class="tray-counter">
      <span>Кубики</span>
      <button type="button" data-tray-action="change" data-key="dice" data-delta="-1" aria-label="Уменьшить количество кубиков">−</button>
      <b>${trayState.dice}</b>
      <button type="button" data-tray-action="change" data-key="dice" data-delta="1" aria-label="Увеличить количество кубиков">+</button>
    </div>
    <div class="tray-counter">
      <span>Преимущество</span>
      <button type="button" data-tray-action="change" data-key="advantage" data-delta="-1" aria-label="Уменьшить преимущество">−</button>
      <b>${trayState.advantage}</b>
      <button type="button" data-tray-action="change" data-key="advantage" data-delta="1" aria-label="Увеличить преимущество">+</button>
    </div>
    <div class="tray-counter">
      <span>Помеха</span>
      <button type="button" data-tray-action="change" data-key="hindrance" data-delta="-1" aria-label="Уменьшить помеху">−</button>
      <b>${trayState.hindrance}</b>
      <button type="button" data-tray-action="change" data-key="hindrance" data-delta="1" aria-label="Увеличить помеху">+</button>
    </div>
    <button type="button" class="tray-roll" data-tray-action="roll">Бросить</button>`;
  target.append(tray);
  tray.addEventListener("click", async (event) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (!button) return;
    event.preventDefault();
    if (button.dataset.trayAction === "change") {
      const key = button.dataset.key;
      const limit = key === "dice" ? maxDice : 2;
      if (!["dice", "advantage", "hindrance"].includes(key)) return;
      trayState[key] = clamp(trayState[key] + Number(button.dataset.delta), key === "dice" ? 1 : 0, limit);
      renderChatTray(root);
      return;
    }
    if (button.dataset.trayAction === "roll") {
      button.disabled = true;
      try {
        await rollPool({
          dice: trayState.dice,
          advantage: trayState.advantage,
          hindrance: trayState.hindrance,
          speaker: ChatMessage.getSpeaker()
        });
      } catch (error) {
        console.error("Vitruvium Dice Tray roll failed.", error);
        ui.notifications.error("Не удалось выполнить бросок Vitruvium.");
      } finally {
        button.disabled = false;
      }
    }
  });
}

class VitruviumActorSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vitruvium", "sheet", "actor"], position: { width: 980, height: 820 }, window: { resizable: true },
    form: { closeOnSubmit: false, submitOnChange: true }
  };
  static PARTS = { main: { template: "systems/vitruvium/templates/actor-sheet.hbs" } };
  constructor(options) {
    super(options);
    this.editing = { characteristics: false, domains: false, attributes: false, possessions: false, statuses: false, relationships: false, resources: false };
    this.editingItems = {};
  }
  get actor() { return this.object ?? this.document; }
  get title() { return this.actor.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const relationships = this.actor.system.relationships ?? [];
    const resources = (this.actor.system.resources ?? []).map((resource, index) => ({ ...resource, id: resource.id ?? `resource-${index}` }));
    return {
      ...context, actor: this.actor, system: this.actor.system, characteristics: CHARACTERISTICS,
      relationships, maxCharacteristic: getSetting("maxCharacteristic"), relationshipMin: getSetting("relationshipMin"),
      relationshipMax: getSetting("relationshipMax"), maxInspiration: 6, resources,
      domains: this.actor.items.filter((item) => item.type === "domain").map((domain) => ({ id: domain.id, name: domain.name, system: domain.system, abilities: this.actor.items.filter((item) => item.type === "ability" && item.system.domainId === domain.id) })),
      abilities: this.actor.items.filter((item) => item.type === "ability"),
      attributes: this.actor.items.filter((item) => item.type === "attribute"),
      possessions: this.actor.items.filter((item) => item.type === "possession"),
      statuses: this.actor.items.filter((item) => item.type === "status"),
      editing: this.editing, editingItems: this.editingItems
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelectorAll("[data-vitruvium-action]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        const action = button.dataset.vitruviumAction;
        if (action === "toggle-edit") {
          const section = button.dataset.section;
          if (!Object.hasOwn(this.editing, section)) return;
          this.editing[section] = !this.editing[section];
          if (!this.editing[section]) this.editingItems = {};
          return this.render();
        }
        if (action === "toggle-description") return button.closest("article")?.classList.toggle("description-open");
        const handlers = {
          "adjust-inspiration": VitruviumActorSheet.#adjustInspiration,
          "adjust-characteristic": VitruviumActorSheet.#adjustCharacteristic,
          "create-item": VitruviumActorSheet.#createItem, "delete-item": VitruviumActorSheet.#deleteItem,
          "edit-item": VitruviumActorSheet.#editItem, "save-item": VitruviumActorSheet.#saveItem,
          "cancel-item": VitruviumActorSheet.#cancelItem, "create-ability": VitruviumActorSheet.#createAbility,
          "add-relationship": VitruviumActorSheet.#addRelationship, "adjust-relationship": VitruviumActorSheet.#adjustRelationship,
          "save-relationship": VitruviumActorSheet.#saveRelationship, "remove-relationship": VitruviumActorSheet.#removeRelationship,
          "add-resource": VitruviumActorSheet.#addResource, "edit-resource": VitruviumActorSheet.#editResource,
          "save-resource": VitruviumActorSheet.#saveResource, "cancel-resource": VitruviumActorSheet.#cancelResource,
          "delete-resource": VitruviumActorSheet.#deleteResource
        };
        try {
          return await handlers[action]?.call(this, event, button);
        } catch (error) {
          console.error(`Vitruvium actor sheet action "${action}" failed.`, error);
          ui.notifications.error("Не удалось сохранить изменения персонажа.");
        }
      });
    });
    this.element.querySelectorAll("[data-relationship-field=\"value\"]").forEach((field) => {
      field.addEventListener("input", () => {
        if (field.value !== "") field.value = clamp(field.value, getSetting("relationshipMin"), getSetting("relationshipMax"));
      });
    });
    this.element.querySelectorAll("[data-relationship-image]").forEach((input) => {
      input.addEventListener("change", async () => {
        try {
          await VitruviumActorSheet.#updateRelationshipImage.call(this, input);
        } catch (error) {
          console.error("Vitruvium relationship image update failed.", error);
          ui.notifications.error("Не удалось сохранить изображение отношения.");
        }
      });
    });
  }

  static async #adjustCharacteristic(event, target) {
    const key = target.dataset.characteristic;
    const value = clamp((this.actor.system.characteristics?.[key]?.value ?? 1) + Number(target.dataset.delta), 1, getSetting("maxCharacteristic"));
    await this.actor.update({ [`system.characteristics.${key}.value`]: value });
    return this.render();
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
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: labels[type], type, system: type === "domain" ? { value: 1, description: "" } : { description: "" } }]);
    this.editingItems[item.id] = true;
    return this.render();
  }

  static async #deleteItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    const ids = [target.dataset.itemId];
    if (item?.type === "domain") ids.push(...this.actor.items.filter((entry) => entry.type === "ability" && entry.system.domainId === item.id).map((entry) => entry.id));
    await this.actor.deleteEmbeddedDocuments("Item", ids);
    delete this.editingItems[target.dataset.itemId];
    return this.render();
  }

  static async #editItem(event, target) {
    this.editingItems[target.dataset.itemId] = true;
    return this.render();
  }

  static async #saveItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) throw new Error(`Embedded item ${target.dataset.itemId} was not found.`);
    const fields = [...target.closest("article").querySelectorAll("[data-item-field]")];
    const updates = {};
    for (const field of fields) {
      if (field.dataset.itemId !== item.id) continue;
      const value = field.type === "number" ? Number(field.value) : field.value;
      if (field.dataset.itemField === "system.value") {
        foundry.utils.setProperty(updates, field.dataset.itemField, clamp(value, 1, 3));
      } else {
        foundry.utils.setProperty(updates, field.dataset.itemField, value);
      }
    }
    await item.update(updates);
    const sections = { domain: "domains", ability: "domains", attribute: "attributes", possession: "possessions", status: "statuses" };
    const section = sections[item.type];
    if (section) this.editing[section] = false;
    this.editingItems = {};
    return this.render();
  }

  static async #cancelItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    const sections = { domain: "domains", ability: "domains", attribute: "attributes", possession: "possessions", status: "statuses" };
    const section = sections[item?.type];
    if (section) this.editing[section] = false;
    this.editingItems = {};
    return this.render();
  }

  static async #createAbility(event, target) {
    const domain = this.actor.items.get(target.dataset.domainId);
    if (!domain) return;
    const level = clamp(domain.system.value, 1, 3);
    const abilities = this.actor.items.filter((item) => item.type === "ability" && item.system.domainId === domain.id);
    if (abilities.length >= level * 2) return ui.notifications.warn(`У домена «${domain.name}» максимум ${level * 2} способности.`);
    const [ability] = await this.actor.createEmbeddedDocuments("Item", [{ name: "Новая способность", type: "ability", system: { domainId: domain.id, description: "" } }]);
    this.editingItems[ability.id] = true;
    return this.render();
  }

  static async #adjustInspiration(event, target) {
    const value = clamp((this.actor.system.inspiration ?? 0) + Number(target.dataset.delta), 0, 6);
    await this.actor.update({ "system.inspiration": value });
    return this.render();
  }

  static async #addRelationship() {
    const relationships = [...(this.actor.system.relationships ?? [])];
    relationships.push({ id: foundry.utils.randomID(), name: "Новые отношения", value: 0, portrait: "", entityUuid: "" });
    await this.actor.update({ "system.relationships": relationships });
    return this.render();
  }

  static async #adjustRelationship(event, target) {
    if (this.editing.relationships) {
      const field = target.closest("article")?.querySelector("[data-relationship-field=\"value\"]");
      if (field) field.value = clamp(Number(field.value) + Number(target.dataset.delta), getSetting("relationshipMin"), getSetting("relationshipMax"));
      return;
    }
    const relationships = foundry.utils.deepClone(this.actor.system.relationships ?? []);
    const relationship = relationships.find((entry) => entry.id === target.dataset.id);
    if (!relationship) return;
    relationship.value = clamp(relationship.value + Number(target.dataset.delta), getSetting("relationshipMin"), getSetting("relationshipMax"));
    await this.actor.update({ "system.relationships": relationships });
    return this.render();
  }

  static async #removeRelationship(event, target) {
    const relationships = (this.actor.system.relationships ?? []).filter((entry) => entry.id !== target.dataset.id);
    await this.actor.update({ "system.relationships": relationships });
    return this.render();
  }

  static async #saveRelationship(event, target) {
    const relationships = foundry.utils.deepClone(this.actor.system.relationships ?? []);
    const relationship = relationships.find((entry) => entry.id === target.dataset.id);
    if (!relationship) return;
    target.closest("article").querySelectorAll("[data-relationship-field]").forEach((field) => {
      const value = field.dataset.relationshipField === "value" ? Number(field.value) : field.value;
      relationship[field.dataset.relationshipField] = value;
    });
    relationship.value = clamp(relationship.value, getSetting("relationshipMin"), getSetting("relationshipMax"));
    await this.actor.update({ "system.relationships": relationships });
    this.editing.relationships = false;
    return this.render();
  }

  static async #updateRelationshipImage(input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onerror = () => reject(reader.error ?? new Error("Could not read the relationship image."));
      reader.onload = async () => {
        try {
          const relationships = foundry.utils.deepClone(this.actor.system.relationships ?? []);
          const relationship = relationships.find((entry) => entry.id === input.dataset.relationshipImage);
          if (!relationship || typeof reader.result !== "string") throw new Error("Relationship or image data is unavailable.");
          relationship.portrait = reader.result;
          await this.actor.update({ "system.relationships": relationships });
          this.render();
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      try {
        reader.readAsDataURL(file);
      } catch (error) {
        reject(error);
      }
    });
  }

  static async #addResource() {
    const resources = foundry.utils.deepClone(this.actor.system.resources ?? []);
    const resource = { id: foundry.utils.randomID(), name: "Новый ресурс", value: 0, max: 0 };
    resources.push(resource);
    this.editingItems[resource.id] = true;
    await this.actor.update({ "system.resources": resources });
    return this.render();
  }

  static async #editResource(event, target) {
    this.editingItems[target.dataset.resourceId] = true;
    return this.render();
  }

  static async #saveResource(event, target) {
    const resources = foundry.utils.deepClone(this.actor.system.resources ?? []);
    const resourceIndex = resources.findIndex((entry, index) => (entry.id ?? `resource-${index}`) === target.dataset.resourceId);
    const resource = resources[resourceIndex];
    if (!resource) throw new Error(`Resource ${target.dataset.resourceId} was not found.`);
    target.closest("article").querySelectorAll("[data-resource-field]").forEach((field) => {
      if (field.dataset.resourceId !== target.dataset.resourceId) return;
      if (field.dataset.resourceField === "name") resource.name = field.value.trim() || "Ресурс";
      else resource[field.dataset.resourceField] = Math.max(0, Number(field.value) || 0);
    });
    resource.value = clamp(resource.value, 0, resource.max);
    await this.actor.update({ "system.resources": resources });
    this.editing.resources = false;
    this.editingItems = {};
    return this.render();
  }

  static async #cancelResource(event, target) {
    this.editing.resources = false;
    this.editingItems = {};
    return this.render();
  }

  static async #deleteResource(event, target) {
    const resources = (this.actor.system.resources ?? []).filter((entry, index) => (entry.id ?? `resource-${index}`) !== target.dataset.resourceId);
    await this.actor.update({ "system.resources": resources });
    return this.render();
  }
}

class VitruviumItemSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ItemSheetV2) {
  static DEFAULT_OPTIONS = { classes: ["vitruvium", "sheet", "item"], position: { width: 620, height: 560 }, form: { closeOnSubmit: false, submitOnChange: true } };
  static PARTS = { main: { template: "systems/vitruvium/templates/item-sheet.hbs" } };
  get item() { return this.object ?? this.document; }
  get title() { return this.item.name || super.title; }
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
      "system.inspiration": clamp(actor.system.inspiration, 0, 6)
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

Hooks.on("preCreateActor", (actor) => {
  if (actor.type !== "character") return;
  const characteristics = Object.fromEntries(Object.keys(CHARACTERISTICS).map((key) => [key, { value: 1 }]));
  actor.updateSource({ system: { characteristics, inspiration: 0, relationships: [], resources: [] } });
});

Hooks.on("preUpdateActor", (actor, change) => {
  const incoming = change.system ?? {};
  if (incoming.inspiration !== undefined) incoming.inspiration = clamp(incoming.inspiration, 0, 6);
  const resources = incoming.resources ?? change["system.resources"];
  if (resources !== undefined) {
    if (!Array.isArray(resources)) throw new Error("Vitruvium actor resources must be an array.");
    const normalizedResources = resources.map((resource) => {
      const maximum = Number(resource.max);
      const current = Number(resource.value);
      const max = Number.isFinite(maximum) ? Math.max(0, maximum) : 0;
      return {
        id: resource.id ?? foundry.utils.randomID(),
        name: String(resource.name ?? "Ресурс"),
        max,
        value: Number.isFinite(current) ? clamp(current, 0, max) : 0
      };
    });
    if (incoming.resources !== undefined) incoming.resources = normalizedResources;
    else change["system.resources"] = normalizedResources;
  }
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
Hooks.on("renderChat", (app, html) => renderChatTray(html));
Hooks.once("ready", () => {
  game.vitruvium = { rollPool, renderChatTray };
  if (ui.chat?.element) renderChatTray(ui.chat.element);
  if (ui.chat?.isView) renderChatTray(ui.chat.element);
});
