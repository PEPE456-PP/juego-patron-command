// '#' muro, 'o' moneda, '@' inicio
const LEVELS = [
  [
    "@...........",
    "...#....###.",
    "..o#........",
    "...#..o.#...",
    "...#....#..o",
    ".o......#...",
    "......#.....",
    ".###..#..o..",
    "....o.#.....",
  ],
  [
    "@..#........",
    ".#.#.######.",
    ".#...#...o..",
    ".#####.####.",
    "..o.....#...",
    ".####.#.#.#.",
    "...o#.#...#o",
    ".#..#.####..",
    ".#o...#....o",
  ],
  [
    "@.#.....#...",
    "..#.###.#.#.",
    "o.#.#o#...#.",
    "..#.#.#####.",
    "..#.#.....o.",
    "..#.#######.",
    "....#o....#.",
    ".####.##.##.",
    "o.......o...",
  ],
];

// Receiver
class Game {
  constructor() {
    this.W = 12;
    this.H = 9;
    this.level = 0;
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.fx = 1;
    this.fy = 0;
    this.score = 0;
    this.bombs = 2;
    this.walls = new Set();
    this.coins = new Set();

    LEVELS[this.level].forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === "#") this.walls.add(`${x},${y}`);
        if (cell === "o") this.coins.add(`${x},${y}`);
      });
    });

    this.total = this.coins.size;
  }

  blocked(x, y) {
    return (
      x < 0 ||
      y < 0 ||
      x >= this.W ||
      y >= this.H ||
      this.walls.has(`${x},${y}`)
    );
  }

  get won() {
    return this.coins.size === 0;
  }
}

// Command
class MoveCommand {
  // A null direction uses the robot's current facing direction (Dash).
  constructor(dx, dy, steps, name) {
    this.dx = dx;
    this.dy = dy;
    this.steps = steps;
    this.name = name;
  }

  execute(game) {
    const dx = this.dx ?? game.fx;
    const dy = this.dy ?? game.fy;
    this.prev = { x: game.x, y: game.y, fx: game.fx, fy: game.fy };
    this.got = [];

    for (let i = 0; i < this.steps; i++) {
      const nextX = game.x + dx;
      const nextY = game.y + dy;

      if (game.blocked(nextX, nextY)) break;

      game.x = nextX;
      game.y = nextY;
      const key = `${nextX},${nextY}`;

      if (game.coins.delete(key)) {
        game.score++;
        this.got.push(key);
      }
    }

    game.fx = dx;
    game.fy = dy;
    return game.x !== this.prev.x || game.y !== this.prev.y;
  }

  clone() {
    return new MoveCommand(this.dx, this.dy, this.steps, this.name);
  }

  undo(game) {
    game.x = this.prev.x;
    game.y = this.prev.y;
    game.fx = this.prev.fx;
    game.fy = this.prev.fy;
    this.got.forEach((key) => {
      game.coins.add(key);
      game.score--;
    });
  }
}

// Bomb destroys neighboring walls; undo restores them.
class BombCommand {
  constructor() {
    this.name = "Bomba";
  }

  clone() {
    return new BombCommand();
  }

  execute(game) {
    if (game.bombs <= 0) return false;

    this.removed = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([dx, dy]) => `${game.x + dx},${game.y + dy}`)
      .filter((key) => game.walls.delete(key));

    if (!this.removed.length) return false;

    game.bombs--;
    return true;
  }

  undo(game) {
    this.removed.forEach((key) => game.walls.add(key));
    game.bombs++;
  }
}

// Macro (Composite) groups commands and undoes them as one action.
class MacroCommand {
  constructor(commands, name) {
    this.cmds = commands;
    this.name = name;
  }

  clone() {
    return new MacroCommand(
      this.cmds.map((command) => command.clone()),
      this.name,
    );
  }

  execute(game) {
    this.done = this.cmds.filter((command) => command.execute(game));
    return this.done.length > 0;
  }

  undo(game) {
    [...this.done].reverse().forEach((command) => command.undo(game));
  }
}

// Invoker
class InputHandler {
  constructor(game) {
    this.game = game;
    this.history = [];
    this.redoStack = [];
    this.locked = false;
    this.actions = {
      up: {
        label: "Arriba",
        key: "w",
        make: () => new MoveCommand(0, -1, 1, "Mover ↑"),
      },
      down: {
        label: "Abajo",
        key: "s",
        make: () => new MoveCommand(0, 1, 1, "Mover ↓"),
      },
      left: {
        label: "Izquierda",
        key: "a",
        make: () => new MoveCommand(-1, 0, 1, "Mover ←"),
      },
      right: {
        label: "Derecha",
        key: "d",
        make: () => new MoveCommand(1, 0, 1, "Mover →"),
      },
      dash: {
        label: "Dash",
        key: " ",
        make: () => new MoveCommand(null, null, 2, "Dash"),
      },
      bomb: { label: "Bomba", key: "b", make: () => new BombCommand() },
      combo: {
        label: "Combo (repite 3)",
        key: "c",
        make: () => this.makeCombo(),
      },
      undo: { label: "Deshacer", key: "z", make: null },
      redo: { label: "Rehacer", key: "y", make: null },
    };
    this.alias = {
      arrowup: "up",
      arrowdown: "down",
      arrowleft: "left",
      arrowright: "right",
    };
  }

  actionForKey(key) {
    key = key.toLowerCase();
    if (this.alias[key]) return this.alias[key];
    return Object.keys(this.actions).find(
      (action) => this.actions[action].key === key,
    );
  }

  trigger(action) {
    if (this.locked) return;
    if (action === "undo") return this.undo();
    if (action === "redo") return this.redo();

    const command = this.actions[action].make();
    if (!command) return;

    const previousScore = this.game.score;
    if (command.execute(this.game)) {
      this.history.push(command);
      this.redoStack = [];
      beep(this.game.score > previousScore ? 880 : 260);
    } else {
      beep(110, 0.12);
    }

    render();
  }

  makeCombo() {
    const lastCommands = this.history.slice(-3);
    return lastCommands.length
      ? new MacroCommand(
          lastCommands.map((command) => command.clone()),
          `Combo ×${lastCommands.length}`,
        )
      : null;
  }

  redo() {
    const command = this.redoStack.pop();
    if (command) {
      command.execute(this.game);
      this.history.push(command);
    }
    render();
  }

  undo() {
    const command = this.history.pop();
    if (command) {
      command.undo(this.game);
      this.redoStack.push(command);
    }
    render();
  }

  rebind(action, key) {
    // If another action uses this key, swap the bindings.
    const otherAction = this.actionForKey(key);
    if (otherAction && otherAction !== action && !this.alias[key.toLowerCase()]) {
      this.actions[otherAction].key = this.actions[action].key;
    }
    this.actions[action].key = key.toLowerCase();
  }

  replay() {
    const commands = this.history.slice();
    if (!commands.length || this.locked) return;

    this.locked = true;
    this.game.reset();
    render();
    let index = 0;

    const step = () => {
      if (index >= commands.length) {
        this.locked = false;
        render();
        return;
      }

      commands[index++].execute(this.game);
      render();
      setTimeout(step, 280);
    };

    setTimeout(step, 400);
  }

  clear() {
    this.history = [];
    this.redoStack = [];
    this.game.reset();
    render();
  }

  nextLevel() {
    if (this.game.level < LEVELS.length - 1) {
      this.game.level++;
      this.clear();
    }
  }
}

// Client
const game = new Game();
const handler = new InputHandler(game);
let audioContext;

function beep(frequency, duration = 0.08) {
  try {
    audioContext =
      audioContext ||
      new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch (error) {}
}

const canvas = document.getElementById("cv");
const context = canvas.getContext("2d");
const CELL_SIZE = 40;
const $ = (id) => document.getElementById(id);
const css = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function render() {
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < game.H; y++) {
    for (let x = 0; x < game.W; x++) {
      if ((x + y) % 2) {
        context.fillStyle = css("--bg");
        context.globalAlpha = 0.35;
        context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        context.globalAlpha = 1;
      }
    }
  }

  context.fillStyle = css("--wall");
  game.walls.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    context.fillRect(
      x * CELL_SIZE + 2,
      y * CELL_SIZE + 2,
      CELL_SIZE - 4,
      CELL_SIZE - 4,
    );
  });

  context.fillStyle = css("--coin");
  game.coins.forEach((key) => {
    const [x, y] = key.split(",").map(Number);
    context.beginPath();
    context.arc(
      x * CELL_SIZE + CELL_SIZE / 2,
      y * CELL_SIZE + CELL_SIZE / 2,
      9,
      0,
      7,
    );
    context.fill();
  });

  const playerX = game.x * CELL_SIZE;
  const playerY = game.y * CELL_SIZE;
  context.fillStyle = css("--me");
  context.beginPath();
  context.roundRect(
    playerX + 5,
    playerY + 5,
    CELL_SIZE - 10,
    CELL_SIZE - 10,
    8,
  );
  context.fill();

  context.fillStyle = "#fff";
  const eyeOffsetX = game.fx * 5;
  const eyeOffsetY = game.fy * 5;
  [[-6, -4], [6, -4]].forEach(([offsetX, offsetY]) => {
    context.beginPath();
    context.arc(
      playerX + CELL_SIZE / 2 + offsetX + eyeOffsetX,
      playerY + CELL_SIZE / 2 + offsetY + eyeOffsetY + 4,
      3.5,
      0,
      7,
    );
    context.fill();
  });

  $("score").textContent = game.score;
  $("total").textContent = game.total;
  $("count").textContent = handler.history.length;
  $("lvl").textContent = game.level + 1;
  $("bmb").textContent = game.bombs;
  $("msg").textContent = game.won
    ? game.level < LEVELS.length - 1
      ? "¡Nivel completo! Pasa al siguiente o repite tu partida."
      : "¡Completaste todos los niveles! Repite tu partida para ver los comandos."
    : handler.locked
      ? "Repitiendo comandos…"
      : "";
  $("next").hidden = !game.won || game.level >= LEVELS.length - 1;

  const log = $("log");
  log.innerHTML = "";
  handler.history.forEach((command, index) => {
    const item = document.createElement("li");
    item.textContent = `${index + 1}. ${command.name}`;
    log.appendChild(item);
  });
  log.scrollTop = log.scrollHeight;
  $("replay").disabled = handler.locked || !handler.history.length;
}

let waiting = null;

function drawBinds() {
  const box = $("binds");
  box.innerHTML = "";

  Object.entries(handler.actions).forEach(([action, definition]) => {
    const row = document.createElement("div");
    row.className = "bind";
    const button = document.createElement("button");
    button.textContent =
      waiting === action
        ? "pulsa una tecla"
        : definition.key === " "
          ? "Espacio"
          : definition.key.toUpperCase();
    if (waiting === action) button.className = "wait";
    button.onclick = () => {
      waiting = action;
      drawBinds();
    };

    row.innerHTML = `<span>${definition.label}</span>`;
    row.appendChild(button);
    box.appendChild(row);
  });
}

addEventListener("keydown", (event) => {
  if (waiting) {
    event.preventDefault();
    if (event.key !== "Escape") handler.rebind(waiting, event.key);
    waiting = null;
    drawBinds();
    return;
  }

  const action = handler.actionForKey(event.key);
  if (action) {
    event.preventDefault();
    handler.trigger(action);
  }
});

document
  .querySelectorAll("[data-a]")
  .forEach((button) => (button.onclick = () => handler.trigger(button.dataset.a)));

$("replay").onclick = () => handler.replay();
$("reset").onclick = () => {
  if (!handler.locked) handler.clear();
};
$("next").onclick = () => {
  if (!handler.locked) handler.nextLevel();
};

// Keep the canvas sharp at the actual display size and pixel density.
function fit() {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  if (!width) return;

  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(width * pixelRatio * 0.75);
  context.setTransform(canvas.width / 480, 0, 0, canvas.height / 360, 0, 0);
  render();
}

new ResizeObserver(fit).observe(canvas);
addEventListener("orientationchange", fit);

// Swipe to move; tap to dash.
let touchStart = null;
canvas.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.changedTouches[0];
    touchStart = [touch.clientX, touch.clientY];
  },
  { passive: true },
);
canvas.addEventListener("touchend", (event) => {
  if (!touchStart) return;

  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStart[0];
  const dy = touch.clientY - touchStart[1];
  touchStart = null;

  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
    handler.trigger("dash");
    return;
  }

  handler.trigger(
    Math.abs(dx) > Math.abs(dy)
      ? dx > 0
        ? "right"
        : "left"
      : dy > 0
        ? "down"
        : "up",
  );
});

drawBinds();
fit();
