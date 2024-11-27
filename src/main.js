import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { Game } from './game_engine/Game.js';
import { Transform } from 'engine/core.js';
import { GUI } from 'dat';

const game = new Game();
await game.load();
await game.create_instance(3, [0,-10], 1, 0, {
    is_dynamic : false,
    is_rigid : true,
    velocity_2d : [-0.0005, 0],
    max_speed : 0,
    acceleration_2d : [0, 0],
    friction : 0
});
const wall1 = await game.create_instance(
    3, [0,10], 0.8, 0, {
    is_rigid: true,
});
wall1.render_node.addComponent(new Transform({
    scale: [100, 100, 0.1]
}))

//game.remove_instance(1);


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

