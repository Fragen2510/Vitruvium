const SYSTEM_ID = "vitruvium";
const DICE_SO_NICE_MODEL = `systems/${SYSTEM_ID}/assets/dice/vitruvium-d6.glb`;
let diceSoNiceModelRegistered = false;

const CHARACTERISTICS = {
  physique: { label: "Телосложение" },
  movement: { label: "Движение" },
  awareness: { label: "Внимание" },
  thinking: { label: "Мышление" },
  influence: { label: "Влияние" },
  will: { label: "Воля" }
};
const CHARACTERISTIC_KEYS = new Set(Object.keys(CHARACTERISTICS));

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const getSetting = (key) => game.settings.get(SYSTEM_ID, key);
const hasCustomImage = (image) => {
  const path = String(image ?? "").split("?")[0].toLowerCase();
  return Boolean(path) && !["icons/svg/mystery-man.svg", "icons/svg/item-bag.svg"].some((placeholder) => path.endsWith(placeholder));
};
const dieSuccess = (face) => (face === 6 ? 2 : face >= 4 ? 1 : 0);
const getStatusCharacteristicModifier = (actor, key) => actor.items
  .filter((item) => item.type === "status" && item.system.active !== false)
  .flatMap((item) => Array.isArray(item.system.effects) ? item.system.effects : [])
  .filter((effect) => effect.characteristic === key && Number.isFinite(Number(effect.modifier)))
  .reduce((total, effect) => total + Number(effect.modifier), 0);
const successLabel = (count) => {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "успехов";
  const last = count % 10;
  if (last === 1) return "успех";
  if (last >= 2 && last <= 4) return "успеха";
  return "успехов";
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

async function registerDiceSoNiceModel(dice3d) {
  if (!dice3d?.addSystem || !dice3d?.addDicePreset) return;
  try {
    const modelUrl = foundry.utils.getRoute(DICE_SO_NICE_MODEL);
    const response = await fetch(modelUrl, { method: "HEAD" });
    if (!response.ok) return;

    const { DiceSystem } = await import("/modules/dice-so-nice/api.js");
    const system = new DiceSystem(SYSTEM_ID, "Vitruvium", "default", "Vitruvium");
    system.setRoleDefaults("basic");
    dice3d.addSystem(system);
    dice3d.addDicePreset({ type: "d6", modelFile: DICE_SO_NICE_MODEL, system: SYSTEM_ID });
    await dice3d.preloadPresets?.(SYSTEM_ID);
    diceSoNiceModelRegistered = true;
  } catch (error) {
    console.warn("Vitruvium could not register its Dice So Nice d6 model.", error);
  }
}

function renderRollCard(data) {
  const chosen = data.pools[data.chosenIndex];
  const bonusSuccesses = data.bonusDice.reduce((total, result) => total + result, 0)
    + data.domainSuccesses.reduce((total, result) => total + result.successes, 0);
  const successes = chosen.successes + bonusSuccesses;
  const rolls = data.pools.map((pool, index) => {
    const results = (pool.results ?? []).map((result) => `${result} ${successLabel(result)}`).join(", ") || "Значения кубиков не сохранены";
    return `<li${index === data.chosenIndex ? " class=\"chosen\"" : ""}><span>Бросок ${index + 1}</span><span class="roll-values">${results}</span><b>${pool.successes} ${successLabel(pool.successes)}</b></li>`;
  }).join("");
  const bonusDiceSuccesses = data.bonusDice.reduce((total, result) => total + result, 0);
  const bonusDice = data.bonusDice.length ? `<li class="bonus-roll"><span>Дополнительные d6: ${data.bonusDice.map((result) => `${result} ${successLabel(result)}`).join(", ")}</span><b>+${bonusDiceSuccesses} ${successLabel(bonusDiceSuccesses)}</b></li>` : "";
  const domainBonuses = data.domainSuccesses.map((result) => `<li class="bonus-roll"><span>${escapeHtml(result.name)} (уровень ${result.level})</span><b>+${result.successes} ${successLabel(result.successes)}</b></li>`).join("");
  const totalInspirationSpent = data.inspirationSpent + data.bonusDice.length + data.domainSuccesses.length;
  const inspiration = totalInspirationSpent ? `<span><small>Вдохновение</small><b>−${totalInspirationSpent}</b></span>` : "";
  const domainOptions = data.domains.length
    ? data.domains.map((domain) => `<option value="${escapeHtml(domain.id)}">${escapeHtml(domain.name)} (уровень ${domain.level}, +${domain.level})</option>`).join("")
    : `<option value="">Нет доменов</option>`;
  const dieAction = `<div class="roll-action-group"><button type="button" data-vitruvium-roll-action="add-die">Добавить кубик</button><small>+1d6 за 1 вдохновение</small></div>`;
  const domainAction = `<label class="domain-success-action"><span>Домен для успехов</span><select data-roll-domain>${domainOptions}</select><button type="button" data-vitruvium-roll-action="add-domain-success">Добавить успехи</button><small>1 вдохновение добавляет успехи по уровню домена</small></label>`;
  const actions = `<div class="roll-actions">${dieAction}${domainAction}</div>`;
  const characteristicModifier = Number(data.characteristicModifier) || 0;
  const modifierLabel = characteristicModifier
    ? ` (${characteristicModifier > 0 ? "+" : "−"}${Math.abs(characteristicModifier)} от статусов)`
    : "";
  const characteristic = data.characteristic ? `<span><small>Характеристика</small><b>${escapeHtml(data.characteristic + modifierLabel)}</b></span>` : "";
  return `<section class="vitruvium-chat-card"><header><div class="roll-heading"><h3>Бросок Vitruvium</h3><span class="roll-character">${escapeHtml(data.character)}</span></div><span class="roll-mode">${data.mode}</span></header><div class="roll-summary">${characteristic}<span><small>Пул</small><b>${data.baseDice}+${data.inspirationSpent}=${data.poolDice}d6</b></span>${inspiration}</div><ol>${rolls}${bonusDice}${domainBonuses}</ol><footer><span>Итог</span><strong>${successes} ${successLabel(successes)}</strong></footer>${actions}</section>`;
}

/** Roll a special d6 pool. Each die yields 0, 1 or 2 successes. */
async function rollPool({ dice, advantage = 0, hindrance = 0, inspiration = 0, speaker, actor, characteristic, characteristicModifier = 0 }) {
  const maxDice = Math.max(1, Number(getSetting("maxDice")) || 6);
  const count = clamp(dice, 1, maxDice);
  const availableInspiration = Math.max(0, Number(actor?.system?.inspiration) || 0);
  const spentInspiration = Math.min(clamp(inspiration, 0, availableInspiration), maxDice - count);
  const poolSize = count + spentInspiration;
  const net = clamp(advantage, 0, 2) - clamp(hindrance, 0, 2);
  const attempts = Math.abs(net) + 1;
  const pools = [];

  for (let i = 0; i < attempts; i += 1) {
    const roll = await (new Roll(`${poolSize}d6`)).evaluate();
    if (diceSoNiceModelRegistered) roll.options.appearance = { system: SYSTEM_ID };
    const faces = roll.dice[0].results.map((result) => result.result);
    const results = faces.map(dieSuccess);
    pools.push({ roll, results, successes: results.reduce((total, result) => total + result, 0) });
  }

  const chosen = pools.reduce((selected, pool) => {
    if (net > 0) return pool.successes > selected.successes ? pool : selected;
    if (net < 0) return pool.successes < selected.successes ? pool : selected;
    return selected;
  });
  const mode = net > 0 ? `Преимущество ×${net}` : net < 0 ? `Помеха ×${Math.abs(net)}` : "Обычный бросок";
  const result = {
    actorUuid: actor?.uuid ?? null, character: actor?.name ?? speaker?.alias ?? "Без персонажа",
    characteristic, characteristicModifier,
    baseDice: count, poolDice: poolSize, mode,
    inspirationSpent: spentInspiration, inspirationRemaining: availableInspiration - spentInspiration,
    pools: pools.map((pool) => ({ results: pool.results, successes: pool.successes })),
    chosenIndex: pools.indexOf(chosen), bonusDice: [], domainSuccesses: [],
    domains: actor?.items?.filter((item) => item.type === "domain").map((domain) => ({
      id: domain.id, name: domain.name, level: clamp(domain.system.value, 1, 3)
    })) ?? []
  };
  const content = renderRollCard(result);
  if (spentInspiration && actor) await actor.update({ "system.inspiration": availableInspiration - spentInspiration });
  try {
    await ChatMessage.create({
      content, speaker, rolls: pools.map((pool) => pool.roll),
      flags: { [SYSTEM_ID]: { roll: result } }
    });
  } catch (error) {
    if (spentInspiration && actor) {
      try {
        await actor.update({ "system.inspiration": availableInspiration });
      } catch (restoreError) {
        console.error("Vitruvium could not restore inspiration after a failed roll message.", restoreError);
      }
    }
    throw error;
  }
}

async function handleRollAction(event) {
  const button = event.target instanceof Element ? event.target.closest("[data-vitruvium-roll-action]") : null;
  if (!button || button.disabled) return;
  event.preventDefault();
  event.stopPropagation();
  const action = button.dataset.vitruviumRollAction;
  if (!['add-die', 'add-domain-success'].includes(action)) return;
  try {
    const messageId = button.closest("[data-message-id]")?.dataset.messageId;
    const message = messageId ? game.messages.get(messageId) : null;
    const data = foundry.utils.deepClone(message?.flags?.[SYSTEM_ID]?.roll);
    if (!message || !data || !message.canUserModify(game.user, "update")) return;
    const actorFromRoll = data.actorUuid ? await fromUuid(data.actorUuid) : null;
    const speakerActor = getSpeakerActor(message.speaker);
    const sameActor = !actorFromRoll || !speakerActor
      || actorFromRoll.uuid === speakerActor.uuid || actorFromRoll.id === speakerActor.id;
    const speakerInspiration = Number(speakerActor?.system?.inspiration) || 0;
    const actor = sameActor && speakerActor?.isOwner && speakerInspiration > 0
      ? speakerActor
      : actorFromRoll ?? speakerActor;
    const availableInspiration = Math.max(0, Number(actor?.system?.inspiration) || 0);
    if (!actor?.isOwner || !availableInspiration) return;
    button.disabled = true;
    let bonusDieSuccesses = null;
    let bonusRoll = null;
    let domainBonus = null;
    if (action === "add-die") {
      bonusRoll = await (new Roll("1d6")).evaluate();
      if (diceSoNiceModelRegistered) bonusRoll.options.appearance = { system: SYSTEM_ID };
      bonusDieSuccesses = dieSuccess(bonusRoll.dice[0].results[0].result);
    } else {
      const domainId = button.closest(".roll-actions")?.querySelector("[data-roll-domain]")?.value;
      const domain = actor.items.get(domainId);
      if (!domain || domain.type !== "domain" || !data.domains.some((entry) => entry.id === domain.id)) return;
      const level = clamp(domain.system.value, 1, 3);
      domainBonus = { name: domain.name, level, successes: level };
    }
    await actor.update({ "system.inspiration": availableInspiration - 1 });
    data.inspirationRemaining = availableInspiration - 1;
    if (bonusDieSuccesses !== null) data.bonusDice.push(bonusDieSuccesses);
    if (domainBonus) data.domainSuccesses.push(domainBonus);
    try {
      if (bonusRoll && game.dice3d?.animateRoll) await game.dice3d.animateRoll(bonusRoll, message);
      await message.update({ content: renderRollCard(data), [`flags.${SYSTEM_ID}.roll`]: data });
    } catch (error) {
      await actor.update({ "system.inspiration": availableInspiration });
      throw error;
    }
  } catch (error) {
    console.error("Vitruvium inspiration die action failed.", error);
    ui.notifications.error("Не удалось добавить кубик вдохновения.");
  } finally {
    if (button.isConnected) button.disabled = false;
  }
}

const trayState = {
  dice: 3, advantage: 0, hindrance: 0, inspiration: 0, rolling: false
};

function getSpeakerActor(speaker = ChatMessage.getSpeaker()) {
  const tokenActor = speaker?.token ? canvas.tokens?.get(speaker.token)?.actor : null;
  return tokenActor ?? (speaker?.actor ? game.actors.get(speaker.actor) : null) ?? game.user?.character ?? null;
}

function updateTrayDisplay(tray) {
  const maxDice = Math.max(1, Number(getSetting("maxDice")) || 6);
  const actor = getSpeakerActor();
  const actorInspiration = Math.max(0, Number(actor?.system?.inspiration) || 0);
  trayState.dice = clamp(trayState.dice, 1, maxDice);
  trayState.inspiration = clamp(trayState.inspiration, 0, Math.min(actorInspiration, maxDice - trayState.dice));
  tray.querySelectorAll("[data-tray-value]").forEach((value) => {
    value.textContent = String(trayState[value.dataset.trayValue]);
  });
  const availableValue = tray.querySelector("[data-tray-available]");
  if (availableValue) availableValue.textContent = String(actorInspiration);
  tray.querySelectorAll("[data-tray-action='change']").forEach((button) => {
    const key = button.dataset.key;
    const delta = Number(button.dataset.delta);
    const limit = key === "dice" ? maxDice : key === "inspiration" ? Math.min(actorInspiration, maxDice - trayState.dice) : 2;
    const minimum = key === "dice" ? 1 : 0;
    button.disabled = delta < 0 ? trayState[key] <= minimum : trayState[key] >= limit;
  });
  const rollButton = tray.querySelector("[data-tray-action='roll']");
  if (rollButton) rollButton.disabled = trayState.rolling;
}

function chatRoot(html) {
  const root = html?.element ?? html?.[0] ?? html;
  if (root instanceof HTMLElement && (root.matches("#chat") || root.querySelector("#chat-form, #chat-controls"))) return root;
  return document.querySelector("#chat");
}

/** Persistent compact Dice Tray below the chat composer. */
function renderChatTray(html) {
  const root = chatRoot(html) ?? document.querySelector("#chat");
  if (!root?.querySelector) return;
  const existing = root.querySelector("#vitruvium-dice-tray");
  if (existing) {
    updateTrayDisplay(existing);
    return;
  }
  const chatForm = root.querySelector("#chat-form");
  const tray = document.createElement("section");
  tray.id = "vitruvium-dice-tray";
  tray.className = "vitruvium-dice-tray";
  updateTrayDisplay(tray);
  tray.innerHTML = `
    <div class="tray-counter">
      <span>Кубики</span>
      <button type="button" data-tray-action="change" data-key="dice" data-delta="-1" aria-label="Уменьшить количество кубиков">−</button>
      <b data-tray-value="dice">${trayState.dice}</b>
      <button type="button" data-tray-action="change" data-key="dice" data-delta="1" aria-label="Увеличить количество кубиков">+</button>
    </div>
    <div class="tray-counter">
      <div class="tray-counter-heading"><span>Вдохновение</span><small>Доступно: <b data-tray-available>0</b></small></div>
      <small class="tray-counter-note">1 очко = +1d6</small>
      <button type="button" data-tray-action="change" data-key="inspiration" data-delta="-1" aria-label="Уменьшить трату вдохновения">−</button>
      <b data-tray-value="inspiration">${trayState.inspiration}</b>
      <button type="button" data-tray-action="change" data-key="inspiration" data-delta="1" aria-label="Добавить вдохновение к броску">+</button>
    </div>
    <div class="tray-counter">
      <span>Преимущество</span>
      <button type="button" data-tray-action="change" data-key="advantage" data-delta="-1" aria-label="Уменьшить преимущество">−</button>
      <b data-tray-value="advantage">${trayState.advantage}</b>
      <button type="button" data-tray-action="change" data-key="advantage" data-delta="1" aria-label="Увеличить преимущество">+</button>
    </div>
    <div class="tray-counter">
      <span>Помеха</span>
      <button type="button" data-tray-action="change" data-key="hindrance" data-delta="-1" aria-label="Уменьшить помеху">−</button>
      <b data-tray-value="hindrance">${trayState.hindrance}</b>
      <button type="button" data-tray-action="change" data-key="hindrance" data-delta="1" aria-label="Увеличить помеху">+</button>
    </div>
    <button type="button" class="tray-roll" data-tray-action="roll" ${trayState.rolling ? "disabled" : ""}>Бросить</button>`;
  updateTrayDisplay(tray);
  if (chatForm?.insertAdjacentElement) chatForm.insertAdjacentElement("afterend", tray);
  else if (chatForm?.parentElement) chatForm.parentElement.append(tray);
  else root.append(tray);
}

async function handleTrayClick(event) {
  const button = event.target instanceof Element ? event.target.closest("[data-tray-action]") : null;
  if (!button || !button.closest("#vitruvium-dice-tray") || button.disabled) return;
  event.preventDefault();
  event.stopPropagation();
  if (button.dataset.trayAction === "change") {
    const key = button.dataset.key;
    if (!["dice", "advantage", "hindrance", "inspiration"].includes(key)) return;
    const tray = button.closest("#vitruvium-dice-tray");
    const maxDice = Math.max(1, Number(getSetting("maxDice")) || 6);
    const actor = getSpeakerActor();
    const limit = key === "dice" ? maxDice : key === "inspiration" ? Math.min(Number(actor?.system?.inspiration) || 0, maxDice - trayState.dice) : 2;
    trayState[key] = clamp(trayState[key] + Number(button.dataset.delta), key === "dice" ? 1 : 0, limit);
    updateTrayDisplay(tray);
    return;
  }
  if (button.dataset.trayAction !== "roll" || trayState.rolling) return;
  trayState.rolling = true;
  button.disabled = true;
  try {
    const speaker = ChatMessage.getSpeaker();
    await rollPool({
      dice: trayState.dice,
      advantage: trayState.advantage,
      hindrance: trayState.hindrance,
      inspiration: trayState.inspiration,
      speaker,
      actor: getSpeakerActor(speaker)
    });
  } catch (error) {
    console.error("Vitruvium Dice Tray roll failed.", error);
    ui.notifications.error("Не удалось выполнить бросок Vitruvium.");
  } finally {
    trayState.rolling = false;
    const currentTray = button.closest("#vitruvium-dice-tray");
    if (currentTray) updateTrayDisplay(currentTray);
  }
}

class VitruviumActorSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vitruvium", "sheet", "actor"], position: { width: 980, height: 820 },
    form: { closeOnSubmit: false, submitOnChange: true }
  };
  static PARTS = { main: { template: "systems/vitruvium/templates/actor-sheet.hbs" } };
  constructor(options) {
    super(options);
    this.editingName = false;
    this.editing = { characteristics: false, domains: false, attributes: false, possessions: false, statuses: false, relationships: false, resources: false };
    this.editingItems = {};
    this._vitruviumScrollPositions = null;
    this._vitruviumRenderVersion = 0;
  }
  get actor() { return this.object ?? this.document; }
  get title() { return this.actor.name; }

  async render(options = {}) {
    if (!this._vitruviumScrollPositions && this.element) {
      this._vitruviumScrollPositions = [...this.element.querySelectorAll(".window-content, .character-sheet, .scroll-list, .resource-list")]
        .map((element, index) => ({ index, top: element.scrollTop, left: element.scrollLeft }));
    }
    const renderVersion = ++this._vitruviumRenderVersion;
    const result = await super.render(options);
    if (this._vitruviumScrollPositions?.length) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (renderVersion === this._vitruviumRenderVersion) {
        const scrollContainers = this.element.querySelectorAll(".window-content, .character-sheet, .scroll-list, .resource-list");
        this._vitruviumScrollPositions.forEach(({ index, top, left }) => {
          const container = scrollContainers[index];
          if (!container) return;
          container.scrollTop = top;
          container.scrollLeft = left;
        });
        this._vitruviumScrollPositions = null;
      }
    }
    return result;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const relationships = (this.actor.system.relationships ?? []).map((relationship) => ({
      ...relationship, hasImage: hasCustomImage(relationship.portrait)
    }));
    const resources = (this.actor.system.resources ?? []).map((resource, index) => ({
      ...resource, id: resource.id ?? `resource-${index}`, hasImage: hasCustomImage(resource.img)
    }));
    const itemsOfType = (type) => this.actor.items.filter((item) => item.type === type).map((item) => ({
      id: item.id, name: item.name, img: item.img, hasImage: hasCustomImage(item.img), system: item.system
    }));
    const statuses = this.actor.items.filter((item) => item.type === "status").map((item) => ({
      id: item.id,
      name: item.name,
      img: item.img,
      hasImage: hasCustomImage(item.img),
      system: {
        ...item.system,
        active: item.system.active !== false,
        effects: (Array.isArray(item.system.effects) ? item.system.effects : []).map((effect, index) => ({
          ...effect,
          id: effect.id ?? `status-effect-${index}`,
          characteristicOptions: Object.entries(CHARACTERISTICS).map(([key, characteristic]) => ({
            key, label: characteristic.label, selected: effect.characteristic === key
          }))
        }))
      }
    }));
    const domains = this.actor.items.filter((item) => item.type === "domain").map((domain) => ({
      id: domain.id, name: domain.name, img: domain.img, hasImage: hasCustomImage(domain.img), system: domain.system,
      abilities: this.actor.items.filter((item) => item.type === "ability" && item.system.domainId === domain.id).map((ability) => ({
        id: ability.id, name: ability.name, img: ability.img, hasImage: hasCustomImage(ability.img), system: ability.system
      }))
    }));
    const tokenizer = game.modules.get("vtta-tokenizer");
    return {
      ...context, actor: this.actor, system: this.actor.system, characteristics: CHARACTERISTICS,
      actorHasImage: hasCustomImage(this.actor.img),
      tokenizerAvailable: Boolean(tokenizer?.active && (tokenizer.api?.launch || globalThis.Tokenizer?.launch)),
      editingName: this.editingName,
      relationships, maxCharacteristic: getSetting("maxCharacteristic"), relationshipMin: getSetting("relationshipMin"),
      relationshipMax: getSetting("relationshipMax"), maxInspiration: 6, resources,
      domains,
      abilities: itemsOfType("ability"),
      attributes: itemsOfType("attribute"),
      possessions: itemsOfType("possession"),
      statuses,
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
          "edit-name": VitruviumActorSheet.#editName,
          "save-name": VitruviumActorSheet.#saveName,
          "cancel-name": VitruviumActorSheet.#cancelName,
          "adjust-inspiration": VitruviumActorSheet.#adjustInspiration,
          "adjust-characteristic": VitruviumActorSheet.#adjustCharacteristic,
          "roll-characteristic": VitruviumActorSheet.#rollCharacteristic,
          "add-status-effect": VitruviumActorSheet.#addStatusEffect,
          "remove-status-effect": VitruviumActorSheet.#removeStatusEffect,
          "create-item": VitruviumActorSheet.#createItem, "delete-item": VitruviumActorSheet.#deleteItem,
          "edit-item": VitruviumActorSheet.#editItem, "save-item": VitruviumActorSheet.#saveItem,
          "cancel-item": VitruviumActorSheet.#cancelItem, "create-ability": VitruviumActorSheet.#createAbility,
          "add-relationship": VitruviumActorSheet.#addRelationship, "adjust-relationship": VitruviumActorSheet.#adjustRelationship,
          "save-relationship": VitruviumActorSheet.#saveRelationship, "remove-relationship": VitruviumActorSheet.#removeRelationship,
          "add-resource": VitruviumActorSheet.#addResource, "edit-resource": VitruviumActorSheet.#editResource,
          "save-resource": VitruviumActorSheet.#saveResource, "cancel-resource": VitruviumActorSheet.#cancelResource,
          "delete-resource": VitruviumActorSheet.#deleteResource, "adjust-resource": VitruviumActorSheet.#adjustResource,
          "remove-relationship-image": VitruviumActorSheet.#removeRelationshipImage,
          "remove-actor-image": VitruviumActorSheet.#removeActorImage,
          "tokenize-actor-image": VitruviumActorSheet.#tokenizeActorImage,
          "remove-item-image": VitruviumActorSheet.#removeItemImage,
          "remove-resource-image": VitruviumActorSheet.#removeResourceImage
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
    this.element.querySelectorAll("[data-actor-image]").forEach((input) => {
      input.addEventListener("change", async () => {
        try {
          const file = input.files?.[0];
          if (!file) return;
          await this.actor.update({ img: await VitruviumActorSheet.uploadImage(file, "actor") });
          return this.render();
        } catch (error) {
          console.error("Vitruvium actor image update failed.", error);
          ui.notifications.error("Не удалось сохранить фотографию персонажа.");
        }
      });
    });
    this.element.querySelectorAll("[data-item-image]").forEach((input) => {
      input.addEventListener("change", async () => {
        try {
          await VitruviumActorSheet.#updateItemImage.call(this, input);
        } catch (error) {
          console.error("Vitruvium item image update failed.", error);
          ui.notifications.error("Не удалось сохранить изображение.");
        }
      });
    });
    this.element.querySelectorAll("[data-resource-image]").forEach((input) => {
      input.addEventListener("change", async () => {
        try {
          await VitruviumActorSheet.#updateResourceImage.call(this, input);
        } catch (error) {
          console.error("Vitruvium resource image update failed.", error);
          ui.notifications.error("Не удалось сохранить изображение ресурса.");
        }
      });
    });
  }

  static async #editName() {
    this.editingName = !this.editingName;
    return this.render();
  }

  static async #saveName(event, target) {
    const input = target.closest(".character-name")?.querySelector(".character-name-input");
    const name = input?.value.trim();
    if (!name) return ui.notifications.warn("Имя персонажа не может быть пустым.");
    await this.actor.update({ name });
    this.editingName = false;
    return this.render();
  }

  static async #cancelName() {
    this.editingName = false;
    return this.render();
  }

  static async #adjustCharacteristic(event, target) {
    const key = target.dataset.characteristic;
    const value = clamp((this.actor.system.characteristics?.[key]?.value ?? 1) + Number(target.dataset.delta), 1, getSetting("maxCharacteristic"));
    await this.actor.update({ [`system.characteristics.${key}.value`]: value });
    return this.render();
  }

  static async #rollCharacteristic(event, target) {
    const key = target.dataset.characteristic;
    const characteristic = CHARACTERISTICS[key];
    if (!characteristic) return;

    const tray = document.querySelector("#vitruvium-dice-tray");
    if (trayState.rolling) return;
    trayState.rolling = true;
    target.disabled = true;
    const trayRollButton = tray?.querySelector("[data-tray-action='roll']");
    if (trayRollButton) trayRollButton.disabled = true;
    try {
      const speaker = ChatMessage.getSpeaker({ actor: this.actor });
      const characteristicModifier = getStatusCharacteristicModifier(this.actor, key);
      await rollPool({
        dice: (this.actor.system.characteristics?.[key]?.value ?? 1) + characteristicModifier,
        advantage: trayState.advantage,
        hindrance: trayState.hindrance,
        inspiration: trayState.inspiration,
        speaker,
        actor: this.actor,
        characteristic: characteristic.label,
        characteristicModifier
      });
    } catch (error) {
      console.error("Vitruvium characteristic roll failed.", error);
      ui.notifications.error("Не удалось выполнить проверку характеристики.");
    } finally {
      trayState.rolling = false;
      if (tray?.isConnected) updateTrayDisplay(tray);
      if (target.isConnected) target.disabled = false;
    }
  }

  static async #addStatusEffect(event, target) {
    const effectList = target.closest("article")?.querySelector(".status-effects");
    if (!effectList) throw new Error("Status effect list was not found.");
    const effect = document.createElement("div");
    effect.className = "status-effect";
    effect.dataset.statusEffectId = foundry.utils.randomID();

    const characteristicLabel = document.createElement("label");
    characteristicLabel.textContent = "Характеристика";
    const characteristicSelect = document.createElement("select");
    characteristicSelect.dataset.statusEffectField = "characteristic";
    for (const [key, characteristic] of Object.entries(CHARACTERISTICS)) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = characteristic.label;
      characteristicSelect.append(option);
    }
    characteristicLabel.append(characteristicSelect);

    const modifierLabel = document.createElement("label");
    modifierLabel.textContent = "Изменение кубов";
    const modifierInput = document.createElement("input");
    modifierInput.type = "number";
    modifierInput.step = "1";
    modifierInput.value = "0";
    modifierInput.dataset.statusEffectField = "modifier";
    modifierLabel.append(modifierInput);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.dataset.vitruviumAction = "remove-status-effect";
    removeButton.textContent = "Удалить эффект";
    removeButton.addEventListener("click", (clickEvent) => {
      clickEvent.preventDefault();
      effect.remove();
    });
    effect.append(characteristicLabel, modifierLabel, removeButton);
    effectList.append(effect);
  }

  static async #removeStatusEffect(event, target) {
    const effect = target.closest("[data-status-effect-id]");
    if (!effect) throw new Error("Status effect was not found.");
    effect.remove();
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
    const system = type === "domain"
      ? { value: 1, description: "" }
      : type === "status"
        ? { description: "", active: true, effects: [] }
        : { description: "" };
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{ name: labels[type], type, system }]);
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
    if (item.type === "status") {
      const statusCard = target.closest("article");
      const activeField = statusCard.querySelector("[data-status-active]");
      const effects = [...statusCard.querySelectorAll("[data-status-effect-id]")].map((effect) => {
        const characteristic = effect.querySelector("[data-status-effect-field='characteristic']")?.value;
        const modifierValue = effect.querySelector("[data-status-effect-field='modifier']")?.value;
        const modifier = Number(modifierValue);
        if (!CHARACTERISTIC_KEYS.has(characteristic) || !Number.isFinite(modifier)) {
          throw new Error("Status effect contains an invalid characteristic modifier.");
        }
        return { id: effect.dataset.statusEffectId, characteristic, modifier: Math.trunc(modifier) };
      });
      foundry.utils.setProperty(updates, "system.active", activeField?.checked ?? true);
      foundry.utils.setProperty(updates, "system.effects", effects);
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

  static async #removeRelationshipImage(event, target) {
    const relationships = foundry.utils.deepClone(this.actor.system.relationships ?? []);
    const relationship = relationships.find((entry) => entry.id === target.dataset.id);
    if (!relationship) return;
    relationship.portrait = "";
    await this.actor.update({ "system.relationships": relationships });
    return this.render();
  }

  static async #removeActorImage() {
    await this.actor.update({ img: "icons/svg/mystery-man.svg" });
    return this.render();
  }

  static async #tokenizeActorImage() {
    const module = game.modules.get("vtta-tokenizer");
    const launchTokenizer = module?.active ? module.api?.launch ?? globalThis.Tokenizer?.launch : null;
    if (typeof launchTokenizer !== "function") {
      throw new Error("The active Tokenizer module does not expose its launch API.");
    }
    if (game.settings.get("vtta-tokenizer", "token-only-toggle")) {
      ui.notifications.warn("В настройках Tokenizer включён режим «Только токен». Включите создание аватара, чтобы изменить портрет персонажа.");
      return;
    }

    const actor = this.actor;
    const onTokenized = (result) => {
      void (async () => {
        const avatar = result?.avatarFilename;
        const token = result?.tokenFilename;
        if (typeof avatar !== "string" || !avatar || typeof token !== "string" || !token) {
          throw new Error("Tokenizer did not return both avatar and token paths.");
        }
        const cacheTag = Date.now();
        const avatarPath = `${avatar.split("?")[0]}?${cacheTag}`;
        const tokenPath = `${token.split("?")[0]}?${cacheTag}`;
        await actor.update({
          img: avatarPath,
          "prototypeToken.texture.src": tokenPath,
          "prototypeToken.randomImg": false
        });
        if (canvas.ready && canvas.scene) {
          const tokenUpdates = actor.getActiveTokens(true).map((activeToken) => ({
            _id: activeToken.id,
            texture: { src: tokenPath },
            randomImg: false
          }));
          if (tokenUpdates.length) await canvas.scene.updateEmbeddedDocuments("Token", tokenUpdates);
        }
        await this.render();
      })().catch((error) => {
        console.error("Vitruvium Tokenizer image update failed.", error);
        ui.notifications.error("Не удалось сохранить изображения персонажа из Tokenizer.");
      });
    };

    launchTokenizer({
      name: actor.name,
      type: "pc",
      avatarFilename: actor.img,
      tokenFilename: actor.prototypeToken.texture.src
    }, onTokenized);
  }

  static async #updateRelationshipImage(input) {
    const file = input.files?.[0];
    if (!file) return;
    const relationships = foundry.utils.deepClone(this.actor.system.relationships ?? []);
    const relationship = relationships.find((entry) => entry.id === input.dataset.relationshipImage);
    if (!relationship) throw new Error("Relationship was not found.");
    relationship.portrait = await VitruviumActorSheet.uploadImage(file, "relationship");
    await this.actor.update({ "system.relationships": relationships });
    return this.render();
  }

  static async #updateItemImage(input) {
    const file = input.files?.[0];
    const item = this.actor.items.get(input.dataset.itemImage);
    if (!file || !item) return;
    const image = await VitruviumActorSheet.uploadImage(file, "item");
    await item.update({ img: image });
    return this.render();
  }

  static async #removeItemImage(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) throw new Error(`Embedded item ${target.dataset.itemId} was not found.`);
    await item.update({ img: "icons/svg/mystery-man.svg" });
    return this.render();
  }

  static async #updateResourceImage(input) {
    const file = input.files?.[0];
    if (!file) return;
    const resources = foundry.utils.deepClone(this.actor.system.resources ?? []);
    const resource = resources.find((entry, index) => (entry.id ?? `resource-${index}`) === input.dataset.resourceImage);
    if (!resource) throw new Error(`Resource ${input.dataset.resourceImage} was not found.`);
    resource.img = await VitruviumActorSheet.uploadImage(file, "resource");
    await this.actor.update({ "system.resources": resources });
    return this.render();
  }

  static async uploadImage(file, category) {
    const allowedExtensions = new Set(["gif", "jpeg", "jpg", "png", "webp"]);
    const mimeExtensions = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
    const sourceExtension = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
    const extension = allowedExtensions.has(sourceExtension) ? sourceExtension : mimeExtensions[file.type];
    if (!extension) throw new Error("Unsupported image format.");
    const filename = `vitruvium-${category}-${foundry.utils.randomID()}.${extension}`;
    const uploadFile = new File([file], filename, { type: file.type || `image/${extension}` });
    const directory = `worlds/${game.world.id}/vitruvium`;
    try {
      await foundry.applications.apps.FilePicker.createDirectory("data", directory);
    } catch (error) {
      try {
        await foundry.applications.apps.FilePicker.browse("data", directory);
      } catch {
        throw error;
      }
    }
    const response = await foundry.applications.apps.FilePicker.upload(
      "data", directory, uploadFile, {}, { notify: false }
    );
    const path = typeof response === "string" ? response : response?.path ?? response?.url;
    if (typeof path !== "string" || !path) throw new Error("The image upload did not return a file path.");
    return path;
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
      else if (field.dataset.resourceField === "description") resource.description = field.value;
      else resource[field.dataset.resourceField] = Math.max(0, Number(field.value) || 0);
    });
    resource.value = clamp(resource.value, 0, resource.max);
    await this.actor.update({ "system.resources": resources });
    this.editing.resources = false;
    this.editingItems = {};
    return this.render();
  }

  static async #adjustResource(event, target) {
    const resources = foundry.utils.deepClone(this.actor.system.resources ?? []);
    const resource = resources.find((entry, index) => (entry.id ?? `resource-${index}`) === target.dataset.resourceId);
    if (!resource) throw new Error(`Resource ${target.dataset.resourceId} was not found.`);
    resource.value = clamp(Number(resource.value) + Number(target.dataset.delta), 0, Math.max(0, Number(resource.max) || 0));
    const scrollTop = this.element?.querySelector?.(".character-sheet")?.scrollTop ?? 0;
    await this.actor.update({ "system.resources": resources });
    await this.render();
    const sheetBody = this.element?.querySelector?.(".character-sheet");
    if (sheetBody) sheetBody.scrollTop = scrollTop;
    return this;
  }

  static async #removeResourceImage(event, target) {
    const resources = foundry.utils.deepClone(this.actor.system.resources ?? []);
    const resource = resources.find((entry, index) => (entry.id ?? `resource-${index}`) === target.dataset.resourceId);
    if (!resource) throw new Error(`Resource ${target.dataset.resourceId} was not found.`);
    resource.img = "";
    await this.actor.update({ "system.resources": resources });
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

class VitruviumNpcSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vitruvium", "sheet", "actor", "npc"],
    position: { width: 720, height: 620 },
    form: { closeOnSubmit: false, submitOnChange: false }
  };
  static PARTS = { main: { template: "systems/vitruvium/templates/npc-sheet.hbs" } };
  get actor() { return this.object ?? this.document; }
  get title() { return this.actor.name; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const npc = this.actor.system.npc ?? {};
    return {
      ...context,
      actor: this.actor,
      npc: {
        attackDice: clamp(npc.attackDice ?? 3, 1, 99),
        defenseDice: clamp(npc.defenseDice ?? 2, 1, 99),
        block: clamp(npc.block ?? 0, 0, 99),
        abilities: Array.isArray(npc.abilities) ? npc.abilities : []
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelectorAll("[data-npc-stat]").forEach((field) => {
      field.addEventListener("change", async () => {
        const key = field.dataset.npcStat;
        const minimum = key === "block" ? 0 : 1;
        const value = clamp(field.value, minimum, 99);
        field.value = String(value);
        try {
          await this.actor.update({ [`system.npc.${key}`]: value });
        } catch (error) {
          console.error("Vitruvium NPC stat update failed.", error);
          ui.notifications.error("Не удалось сохранить параметры НПС.");
        }
      });
    });
    this.element.querySelectorAll("[data-npc-ability-field]").forEach((field) => {
      field.addEventListener("change", async () => {
        const abilities = foundry.utils.deepClone(this.actor.system.npc?.abilities ?? []);
        const ability = abilities.find((entry) => entry.id === field.dataset.abilityId);
        if (!ability) return;
        ability[field.dataset.npcAbilityField] = field.dataset.npcAbilityField === "bonusDice"
          ? clamp(field.value, 0, 99)
          : field.value.trim() || "Способность";
        try {
          await this.actor.update({ "system.npc.abilities": abilities });
        } catch (error) {
          console.error("Vitruvium NPC ability update failed.", error);
          ui.notifications.error("Не удалось сохранить способность НПС.");
        }
      });
    });
    this.element.querySelectorAll("[data-npc-action]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        try {
          if (button.dataset.npcAction === "add-ability") return await this.#addAbility();
          if (button.dataset.npcAction === "delete-ability") return await this.#deleteAbility(button.dataset.abilityId);
          if (button.dataset.npcAction === "roll") return await this.#roll(button);
        } catch (error) {
          console.error("Vitruvium NPC action failed.", error);
          ui.notifications.error("Не удалось выполнить действие НПС.");
        }
      });
    });
  }

  async #addAbility() {
    const abilities = foundry.utils.deepClone(this.actor.system.npc?.abilities ?? []);
    abilities.push({ id: foundry.utils.randomID(), name: "Новая способность", bonusDice: 0 });
    await this.actor.update({ "system.npc.abilities": abilities });
    return this.render();
  }

  async #deleteAbility(id) {
    const abilities = (this.actor.system.npc?.abilities ?? []).filter((ability) => ability.id !== id);
    await this.actor.update({ "system.npc.abilities": abilities });
    return this.render();
  }

  async #roll(button) {
    const target = button.dataset.target;
    if (!["attack", "defense"].includes(target)) return;
    const npc = this.actor.system.npc ?? {};
    const ability = npc.abilities?.find((entry) => entry.id === button.dataset.abilityId);
    const baseDice = clamp(target === "attack" ? npc.attackDice ?? 3 : npc.defenseDice ?? 2, 1, 99);
    const bonusDice = ability ? clamp(ability.bonusDice, 0, 99) : 0;
    const dice = baseDice + bonusDice;
    const roll = await (new Roll(`${dice}d6`)).evaluate();
    if (diceSoNiceModelRegistered) roll.options.appearance = { system: SYSTEM_ID };
    const results = roll.dice[0].results.map((result) => dieSuccess(result.result));
    const successes = results.reduce((total, result) => total + result, 0);
    const label = target === "attack" ? "Атака" : "Защита";
    const abilityLabel = ability ? `Способность: ${escapeHtml(ability.name)}` : "Базовый бросок";
    const content = `<section class="vitruvium-chat-card"><header><div class="roll-heading"><h3>${label} НПС</h3><span class="roll-character">${escapeHtml(this.actor.name)}</span></div></header><div class="roll-summary"><span><small>${abilityLabel}</small><b>${baseDice}+${bonusDice}=${dice}d6</b></span></div><ol><li class="chosen"><span>Кубики</span><span class="roll-values">${results.map((result) => `${result} ${successLabel(result)}`).join(", ")}</span><b>${successes} ${successLabel(successes)}</b></li></ol><footer><span>Итог</span><strong>${successes} ${successLabel(successes)}</strong></footer></section>`;
    return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: this.actor }), rolls: [roll] });
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
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector("[data-item-sheet-image]")?.addEventListener("change", async (event) => {
      try {
        const file = event.currentTarget.files?.[0];
        if (!file || !this.isEditable) return;
        await this.item.update({ img: await VitruviumActorSheet.uploadImage(file, "item") });
        return this.render();
      } catch (error) {
        console.error("Vitruvium standalone item image upload failed.", error);
        ui.notifications.error("Не удалось загрузить изображение предмета.");
      }
    });
    this.element.querySelector("[data-item-sheet-action='remove-image']")?.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!this.isEditable) return;
      await this.item.update({ img: "icons/svg/item-bag.svg" });
      return this.render();
    });
  }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context, item: this.item, system: this.item.system,
      itemHasImage: hasCustomImage(this.item.img),
      isEditable: this.isEditable,
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
  SheetConfig.registerSheet(Actor, SYSTEM_ID, VitruviumActorSheet, { types: ["character"], makeDefault: true });
  SheetConfig.registerSheet(Actor, SYSTEM_ID, VitruviumNpcSheet, { types: ["npc"], makeDefault: true });
  SheetConfig.registerSheet(Item, SYSTEM_ID, VitruviumItemSheet, { makeDefault: true });
});

Hooks.on("preCreateActor", (actor) => {
  if (actor.type === "npc") {
    const npc = actor.system?.npc ?? {};
    actor.updateSource({ system: { npc: {
      attackDice: npc.attackDice ?? 3,
      defenseDice: npc.defenseDice ?? 2,
      block: npc.block ?? 0,
      abilities: npc.abilities ?? []
    } } });
    return;
  }
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
        ...resource,
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

Hooks.on("renderChatLog", (app, html) => renderChatTray(app?.element ?? html));
Hooks.on("renderChat", (app, html) => renderChatTray(app?.element ?? html));
Hooks.once("diceSoNiceReady", (dice3d) => registerDiceSoNiceModel(dice3d));
Hooks.on("updateActor", () => {
  const tray = document.querySelector("#vitruvium-dice-tray");
  if (tray) updateTrayDisplay(tray);
});
Hooks.once("ready", () => {
  document.addEventListener("click", handleTrayClick, true);
  document.addEventListener("click", handleRollAction, true);
  game.vitruvium = { rollPool, renderChatTray };
  renderChatTray(ui.chat?.element ?? document.querySelector("#chat"));
});
