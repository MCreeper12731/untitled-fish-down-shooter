import { ResizeSystem } from 'engine/systems/ResizeSystem.js';
import { UpdateSystem } from 'engine/systems/UpdateSystem.js';
import { Game } from './game_engine/Game.js';
import { GUI } from 'dat';

const game = new Game();
await game.load();
await game.create_instance(3, [0,-10], 1, 0, {
    isDynamic : true,
    isRigid : false,
    velocity_2d : [-0.0005, 0],
    max_speed : 0,
    acceleration_2d : [0, 0],
    friction : 0
});

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

