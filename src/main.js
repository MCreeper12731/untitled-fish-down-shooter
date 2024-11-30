import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { Game } from './game_engine/Game.js';
import { GUI } from 'dat';
import { GameInstance_tool } from './game_engine/GameInstance.js';

const game = new Game();
await game.load();

await game.spawn_enemy(GameInstance_tool.type_enum.ENEMY_STANDARD, 0, 10, 0);
await game.spawn_enemy(GameInstance_tool.type_enum.ENEMY_TANK, 10, 20, 0);
await game.spawn_enemy(GameInstance_tool.type_enum.ENEMY_FAST, 0, 30, 0);

console.log(game.instances);

//necessary to have these in this specific script
const canvas = game.get_canvas();
function update(t, dt) {
    game.update(t, dt);
}
function render() {
    game.render();
}
function resize({ displaySize: { width, height }}) {
    game.resize(width, height);
}
new ResizeSystem({ canvas, resize }).start();
new UpdateSystem({ update, render }).start();

